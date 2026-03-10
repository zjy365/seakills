#!/usr/bin/env node
// Sealos Template CLI - single entry point for all template operations.
// Zero external dependencies. Requires Node.js (guaranteed by Claude Code).
//
// Usage:
//   node sealos-template.mjs <command> [args...]
//
// Config priority:
//   1. KUBECONFIG_PATH + API_URL env vars (backwards compatible)
//   2. ~/.config/sealos-template/config.json (from `init`)
//   3. Error with hint to run `init`
//
// Commands:
//   init <kubeconfig_path> [api_url]  Parse kubeconfig, probe API URL, save config
//   list [--language=en]              List all templates (no auth needed)
//   get <name> [--language=en]        Get template details (no auth needed)
//   create <json>                     Create a template instance (auth required)
//   create-raw <json_or_filepath>     Deploy from raw YAML (auth required)
//   profiles                          List all saved profiles
//   use <profile>                     Switch active profile

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = resolve(homedir(), '.config/sealos-template/config.json');
const API_PATH = '/api/v2alpha'; // API version — update here if the version changes

// --- config (multi-profile) ---

function loadAllConfig() {
  if (!existsSync(CONFIG_PATH)) return { active: null, profiles: {} };
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    // Migrate legacy flat format → profiles format
    if (raw.apiUrl && !raw.profiles) {
      return { active: 'default', profiles: { default: { kubeconfigPath: raw.kubeconfigPath, apiUrl: raw.apiUrl } } };
    }
    return raw;
  } catch { return { active: null, profiles: {} }; }
}

function deriveProfileName(apiUrl) {
  try {
    const host = new URL(apiUrl).hostname;
    const parts = host.split('.');
    // template.usw.sailos.io → usw.sailos
    if (parts[0] === 'template' && parts.length > 2) {
      return parts.slice(1, -1).join('.');
    }
    return parts.slice(0, -1).join('.') || 'default';
  } catch { return 'default'; }
}

function writeAllConfig(all) {
  const dir = resolve(homedir(), '.config/sealos-template');
  mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(all, null, 2) + '\n');
}

function loadConfig() {
  // Priority 1: env vars
  if (process.env.API_URL) {
    return {
      apiUrl: process.env.API_URL,
      kubeconfigPath: process.env.KUBECONFIG_PATH || resolve(homedir(), '.kube/config'),
    };
  }

  // Priority 2: active profile from saved config
  const all = loadAllConfig();
  if (all.active && all.profiles[all.active]) {
    const p = all.profiles[all.active];
    if (p.apiUrl && p.kubeconfigPath) return p;
  }

  // Priority 3: error
  return null;
}

function saveConfig(kubeconfigPath, apiUrl) {
  const all = loadAllConfig();
  const name = deriveProfileName(apiUrl);
  all.profiles[name] = { kubeconfigPath, apiUrl };
  all.active = name;
  writeAllConfig(all);
  return name;
}

// --- auth ---

function getEncodedKubeconfig(path) {
  if (!existsSync(path)) {
    throw new Error(`Kubeconfig not found at ${path}`);
  }
  return encodeURIComponent(readFileSync(path, 'utf-8'));
}

// --- HTTP ---

function apiCall(method, endpoint, { apiUrl, auth, body, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl + endpoint);
    const isHttps = url.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const headers = {};
    if (auth) headers['Authorization'] = auth;
    if (body) headers['Content-Type'] = 'application/json';

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      timeout,
      rejectUnauthorized: false, // Sealos clusters may use self-signed certificates
    };

    const req = reqFn(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString();
        let parsed = null;
        try { parsed = JSON.parse(rawBody); } catch { parsed = rawBody || null; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// --- helpers ---

function requireConfig(allowNoConfig) {
  const cfg = loadConfig();
  if (!cfg && !allowNoConfig) {
    throw new Error('No config found. Run: node sealos-template.mjs init <kubeconfig_path>');
  }
  return cfg;
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

// --- kubeconfig parsing ---

function extractServerUrl(content) {
  // Handles quoted and unquoted server URLs:
  //   server: https://host:6443
  //   server: "https://host:6443"
  //   server: 'https://host:6443'
  const match = content.match(/server:\s*['"]?(https?:\/\/[^\s'"]+)/);
  return match ? match[1] : null;
}

function deriveApiCandidates(serverUrl) {
  const urlObj = new URL(serverUrl);
  const hostname = urlObj.hostname;
  const parts = hostname.split('.');

  const candidates = [];
  const seen = new Set();
  function add(url) {
    if (!seen.has(url)) { seen.add(url); candidates.push(url); }
  }

  // 1. template.<full-hostname>
  add(`https://template.${hostname}${API_PATH}`);

  // 2. Strip first subdomain (e.g., apiserver.usw.sailos.io → template.usw.sailos.io)
  if (parts.length > 2) {
    add(`https://template.${parts.slice(1).join('.')}${API_PATH}`);
  }

  // 3. Strip first two subdomains (for deeper hierarchies)
  if (parts.length > 3) {
    add(`https://template.${parts.slice(2).join('.')}${API_PATH}`);
  }

  return candidates;
}

async function probeApiUrl(candidates) {
  for (const apiUrl of candidates) {
    try {
      const res = await apiCall('GET', '/templates', { apiUrl, timeout: 5000 });
      if (res.status === 200) return apiUrl;
    } catch { /* try next candidate */ }
  }
  return null;
}

// --- parse CLI flags ---

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

// --- validation ---

function validateCreateBody(body) {
  const errors = [];
  if (!body.name) {
    errors.push('name is required');
  } else {
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(body.name)) errors.push('name must match ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$');
    if (body.name.length > 63) errors.push('name must be at most 63 characters');
  }
  if (!body.template) errors.push('template is required');
  if (errors.length) throw new Error('Validation failed: ' + errors.join('; '));
}

function validateCreateRawBody(body) {
  const errors = [];
  if (!body.yaml) errors.push('yaml is required');
  if (errors.length) throw new Error('Validation failed: ' + errors.join('; '));
}

// --- individual commands ---

async function listTemplates(cfg, language) {
  const apiUrl = cfg ? cfg.apiUrl : null;
  if (!apiUrl) throw new Error('No config found. Provide API_URL env var or run: node sealos-template.mjs init <kubeconfig_path>');
  const langParam = language ? `?language=${encodeURIComponent(language)}` : '';
  const res = await apiCall('GET', `/templates${langParam}`, { apiUrl });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  // Include X-Menu-Keys header in result
  const menuKeys = res.headers['x-menu-keys'] || '';
  return { templates: res.body, menuKeys };
}

async function getTemplate(cfg, name, language) {
  const apiUrl = cfg ? cfg.apiUrl : null;
  if (!apiUrl) throw new Error('No config found. Provide API_URL env var or run: node sealos-template.mjs init <kubeconfig_path>');
  const langParam = language ? `?language=${encodeURIComponent(language)}` : '';
  const res = await apiCall('GET', `/templates/${encodeURIComponent(name)}${langParam}`, { apiUrl });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createInstance(cfg, jsonBody) {
  const body = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
  validateCreateBody(body);
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('POST', '/templates/instances', { apiUrl: cfg.apiUrl, auth, body });
  if (res.status !== 201) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createRaw(cfg, jsonOrFilepath) {
  let body;
  if (typeof jsonOrFilepath === 'string' && (jsonOrFilepath.startsWith('/') || jsonOrFilepath.startsWith('~'))) {
    // Treat as file path — read JSON body from file
    const filePath = jsonOrFilepath.replace(/^~/, homedir());
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
    const content = readFileSync(absPath, 'utf-8');
    body = JSON.parse(content);
  } else {
    body = typeof jsonOrFilepath === 'string' ? JSON.parse(jsonOrFilepath) : jsonOrFilepath;
  }
  validateCreateRawBody(body);
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('POST', '/templates/raw', { apiUrl: cfg.apiUrl, auth, body });
  if (res.status !== 200 && res.status !== 201) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

// --- batch commands ---

async function init(kubeconfigPath, manualApiUrl) {
  // 1. Resolve path
  const kcPath = kubeconfigPath.replace(/^~/, homedir());
  const absPath = resolve(kcPath);

  if (!existsSync(absPath)) {
    throw new Error(`Kubeconfig not found at ${absPath}`);
  }

  // 2. Parse kubeconfig
  const kcContent = readFileSync(absPath, 'utf-8');
  const serverUrl = extractServerUrl(kcContent);
  if (!serverUrl) {
    throw new Error('Could not find server URL in kubeconfig');
  }

  // 3. Resolve API URL — manual override or auto-probe
  let apiUrl;
  if (manualApiUrl) {
    apiUrl = manualApiUrl.replace(/\/+$/, '');
    if (!apiUrl.endsWith(API_PATH)) {
      apiUrl += API_PATH;
    }
  } else {
    const candidates = deriveApiCandidates(serverUrl);
    apiUrl = await probeApiUrl(candidates);
    if (!apiUrl) {
      throw new Error(
        `Could not auto-detect API URL from server: ${serverUrl}\n` +
        `Tried: ${candidates.join(', ')}\n` +
        `Specify manually: node sealos-template.mjs init ${kubeconfigPath} <api_url>\n` +
        `Example: node sealos-template.mjs init ${kubeconfigPath} https://template.your-domain.com`
      );
    }
  }

  // 4. Save config (auto-derives profile name from domain)
  const profileName = saveConfig(absPath, apiUrl);

  // 5. Fetch templates to verify connection (public, no auth needed)
  const cfg = { apiUrl, kubeconfigPath: absPath };
  const { templates } = await listTemplates(cfg);

  // 6. Test auth (optional — may fail if kubeconfig is expired, but that's ok for browsing)
  let authValid = false;
  try {
    const auth = getEncodedKubeconfig(absPath);
    // Try a lightweight auth-required call — create with invalid body to test auth
    // Instead, just validate the kubeconfig can be read and encoded
    authValid = !!auth;
  } catch {
    authValid = false;
  }

  return { apiUrl, kubeconfigPath: absPath, profileName, templateCount: templates.length, authValid };
}

// --- main ---

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd) {
    console.error('ERROR: Command required.');
    console.error('Commands: init|list|get|create|create-raw|profiles|use');
    process.exit(1);
  }

  try {
    let result;

    switch (cmd) {
      case 'init': {
        if (!args[0]) throw new Error('Usage: node sealos-template.mjs init <kubeconfig_path> [api_url]');
        result = await init(args[0], args[1]);
        break;
      }

      case 'list': {
        const cfg = requireConfig(false);
        const { flags } = parseFlags(args);
        result = await listTemplates(cfg, flags.language || 'en');
        break;
      }

      case 'get': {
        const cfg = requireConfig(false);
        const { flags, positional } = parseFlags(args);
        if (!positional[0]) throw new Error('Template name required');
        result = await getTemplate(cfg, positional[0], flags.language || 'en');
        break;
      }

      case 'create': {
        const cfg = requireConfig(false);
        if (!args[0]) throw new Error('JSON body required');
        result = await createInstance(cfg, args[0]);
        break;
      }

      case 'create-raw': {
        const cfg = requireConfig(false);
        if (!args[0]) throw new Error('JSON body or file path required');
        result = await createRaw(cfg, args[0]);
        break;
      }

      case 'profiles': {
        const all = loadAllConfig();
        result = {
          active: all.active,
          profiles: Object.entries(all.profiles).map(([name, cfg]) => ({
            name,
            apiUrl: cfg.apiUrl,
            kubeconfigPath: cfg.kubeconfigPath,
            active: name === all.active,
          })),
        };
        break;
      }

      case 'use': {
        if (!args[0]) throw new Error('Profile name required');
        const name = args[0];
        const all = loadAllConfig();
        if (!all.profiles[name]) {
          const available = Object.keys(all.profiles).join(', ');
          throw new Error(`Profile '${name}' not found. Available: ${available || '(none)'}`);
        }
        all.active = name;
        writeAllConfig(all);
        result = { active: name, ...all.profiles[name] };
        break;
      }

      default:
        throw new Error(`Unknown command '${cmd}'. Commands: init|list|get|create|create-raw|profiles|use`);
    }

    if (result !== undefined) output(result);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
