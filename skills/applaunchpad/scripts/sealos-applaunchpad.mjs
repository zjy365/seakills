#!/usr/bin/env node
// Sealos AppLaunchpad CLI - single entry point for all app operations.
// Zero external dependencies. Requires Node.js (guaranteed by Claude Code).
//
// Usage:
//   node sealos-applaunchpad.mjs <command> [args...]
//
// Config priority:
//   1. KUBECONFIG_PATH + API_URL env vars (backwards compatible)
//   2. ~/.config/sealos-applaunchpad/config.json (from `init`)
//   3. Error with hint to run `init`
//
// Commands:
//   init <kubeconfig_path> [api_url]  Parse kubeconfig, probe API URL, save config
//   list                              List all apps
//   get <name>                        Get app details
//   create <json>                     Create a new app
//   create-wait <json>                Create + poll until running (timeout 2min)
//   update <name> <json>              Update app configuration
//   delete <name>                     Delete an app
//   start <name>                      Start a paused app
//   pause <name>                      Pause a running app (scales to zero)
//   restart <name>                    Restart an app
//   update-storage <name> <json>      Incremental storage update (expand only)
//   profiles                          List all saved profiles
//   use <profile>                     Switch active profile

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = resolve(homedir(), '.config/sealos-applaunchpad/config.json');
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
    // applaunchpad.usw.sailos.io → usw.sailos
    if (parts[0] === 'applaunchpad' && parts.length > 2) {
      return parts.slice(1, -1).join('.');
    }
    return parts.slice(0, -1).join('.') || 'default';
  } catch { return 'default'; }
}

function writeAllConfig(all) {
  const dir = resolve(homedir(), '.config/sealos-applaunchpad');
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
        resolve({ status: res.statusCode, body: parsed });
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
    throw new Error('No config found. Run: node sealos-applaunchpad.mjs init <kubeconfig_path>');
  }
  return cfg;
}

function requireName(args) {
  if (!args[0]) throw new Error('App name required');
  return args[0];
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

  // 1. applaunchpad.<full-hostname>
  add(`https://applaunchpad.${hostname}${API_PATH}`);

  // 2. Strip first subdomain (e.g., apiserver.usw.sailos.io → applaunchpad.usw.sailos.io)
  if (parts.length > 2) {
    add(`https://applaunchpad.${parts.slice(1).join('.')}${API_PATH}`);
  }

  // 3. Strip first two subdomains (for deeper hierarchies)
  if (parts.length > 3) {
    add(`https://applaunchpad.${parts.slice(2).join('.')}${API_PATH}`);
  }

  return candidates;
}

async function probeApiUrl(candidates, auth) {
  // AppLaunchpad has no unauthenticated endpoint — probe GET /apps with auth.
  // Accept 200/401/403 as valid URL (proves the service exists).
  for (const apiUrl of candidates) {
    try {
      const res = await apiCall('GET', '/apps', { apiUrl, auth, timeout: 5000 });
      if ([200, 401, 403].includes(res.status)) return apiUrl;
    } catch { /* try next candidate */ }
  }
  return null;
}

// --- individual commands ---

async function list(cfg) {
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('GET', '/apps', { apiUrl: cfg.apiUrl, auth });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function get(cfg, name) {
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('GET', `/apps/${name}`, { apiUrl: cfg.apiUrl, auth });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

function validateCreateBody(body) {
  const errors = [];
  if (body.name) {
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(body.name)) errors.push('name must match ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$');
    if (body.name.length > 63) errors.push('name must be at most 63 characters');
  }
  if (!body.image || !body.image.imageName) {
    errors.push('image.imageName is required');
  }
  if (body.image && body.image.imageRegistry && body.image.imageRegistry !== null) {
    const reg = body.image.imageRegistry;
    if (!reg.username || !reg.password || !reg.serverAddress) {
      errors.push('imageRegistry requires username, password, and serverAddress');
    }
  }
  if (body.quota) {
    const q = body.quota;
    if (q.cpu !== undefined && (typeof q.cpu !== 'number' || q.cpu < 0.1 || q.cpu > 32)) errors.push('cpu must be 0.1-32');
    if (q.memory !== undefined && (typeof q.memory !== 'number' || q.memory < 0.1 || q.memory > 32)) errors.push('memory must be 0.1-32 GB');
    if (q.replicas !== undefined && (!Number.isInteger(q.replicas) || q.replicas < 1 || q.replicas > 20)) errors.push('replicas must be an integer 1-20');
    if (q.replicas !== undefined && q.hpa !== undefined) errors.push('replicas and hpa are mutually exclusive');
    if (q.hpa) {
      if (!['cpu', 'memory', 'gpu'].includes(q.hpa.target)) errors.push('hpa.target must be cpu, memory, or gpu');
      if (typeof q.hpa.value !== 'number') errors.push('hpa.value is required');
      if (typeof q.hpa.minReplicas !== 'number') errors.push('hpa.minReplicas is required');
      if (typeof q.hpa.maxReplicas !== 'number') errors.push('hpa.maxReplicas is required');
    }
    if (q.gpu) {
      if (!q.gpu.type) errors.push('gpu.type is required (e.g., A100, V100, T4)');
    }
  }
  if (body.ports) {
    for (const p of body.ports) {
      if (!p.number || p.number < 1 || p.number > 65535) errors.push(`port number must be 1-65535, got ${p.number}`);
      if (p.protocol && !['http', 'grpc', 'ws', 'tcp', 'udp', 'sctp'].includes(p.protocol)) {
        errors.push(`port protocol must be http|grpc|ws|tcp|udp|sctp, got ${p.protocol}`);
      }
    }
  }
  if (errors.length) throw new Error('Validation failed: ' + errors.join('; '));
}

function validateUpdateBody(body) {
  const errors = [];
  if (body.quota) {
    const q = body.quota;
    if (q.cpu !== undefined && ![0.1, 0.2, 0.5, 1, 2, 3, 4, 8].includes(q.cpu)) errors.push('cpu must be one of: 0.1, 0.2, 0.5, 1, 2, 3, 4, 8');
    if (q.memory !== undefined && ![0.1, 0.5, 1, 2, 4, 8, 16].includes(q.memory)) errors.push('memory must be one of: 0.1, 0.5, 1, 2, 4, 8, 16 GB');
    if (q.replicas !== undefined && (!Number.isInteger(q.replicas) || q.replicas < 1 || q.replicas > 20)) errors.push('replicas must be an integer 1-20');
    if (q.replicas !== undefined && q.hpa !== undefined) errors.push('replicas and hpa are mutually exclusive');
    if (q.hpa) {
      if (!['cpu', 'memory', 'gpu'].includes(q.hpa.target)) errors.push('hpa.target must be cpu, memory, or gpu');
      if (typeof q.hpa.value !== 'number') errors.push('hpa.value is required');
      if (typeof q.hpa.minReplicas !== 'number') errors.push('hpa.minReplicas is required');
      if (typeof q.hpa.maxReplicas !== 'number') errors.push('hpa.maxReplicas is required');
    }
  }
  if (body.ports) {
    for (const p of body.ports) {
      if (p.number !== undefined && (p.number < 1 || p.number > 65535)) errors.push(`port number must be 1-65535, got ${p.number}`);
      if (p.protocol && !['http', 'grpc', 'ws', 'tcp', 'udp', 'sctp'].includes(p.protocol)) {
        errors.push(`port protocol must be http|grpc|ws|tcp|udp|sctp, got ${p.protocol}`);
      }
    }
  }
  if (body.image && !body.image.imageName) {
    errors.push('image.imageName is required when updating image');
  }
  if (errors.length) throw new Error('Validation failed: ' + errors.join('; '));
}

async function create(cfg, jsonBody) {
  const body = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
  validateCreateBody(body);
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('POST', '/apps', { apiUrl: cfg.apiUrl, auth, body });
  if (res.status !== 201) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function update(cfg, name, jsonBody) {
  const body = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
  validateUpdateBody(body);
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('PATCH', `/apps/${name}`, { apiUrl: cfg.apiUrl, auth, body });
  if (res.status !== 204) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  // Re-fetch to return updated state
  try {
    const updated = await get(cfg, name);
    return { success: true, message: 'App update initiated', app: updated };
  } catch {
    return { success: true, message: 'App update initiated' };
  }
}

async function del(cfg, name) {
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('DELETE', `/apps/${name}`, { apiUrl: cfg.apiUrl, auth });
  if (res.status !== 204) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return { success: true, message: `App '${name}' deleted` };
}

async function action(cfg, name, actionName) {
  const validActions = ['start', 'pause', 'restart'];
  if (!validActions.includes(actionName)) {
    throw new Error(`Invalid action '${actionName}'. Valid actions: ${validActions.join(', ')}`);
  }
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('POST', `/apps/${name}/${actionName}`, { apiUrl: cfg.apiUrl, auth });
  if (res.status !== 204) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  return { success: true, message: `Action '${actionName}' on '${name}' completed` };
}

async function updateStorage(cfg, name, jsonBody) {
  const body = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
  const auth = getEncodedKubeconfig(cfg.kubeconfigPath);
  const res = await apiCall('PATCH', `/apps/${name}/storage`, { apiUrl: cfg.apiUrl, auth, body });
  if (res.status !== 204) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  // Re-fetch to return updated state
  try {
    const updated = await get(cfg, name);
    return { success: true, message: 'Storage update initiated', app: updated };
  } catch {
    return { success: true, message: 'Storage update initiated' };
  }
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

  // 3. Get auth for probing (AppLaunchpad needs auth for all endpoints)
  const auth = getEncodedKubeconfig(absPath);

  // 4. Resolve API URL — manual override or auto-probe
  let apiUrl;
  if (manualApiUrl) {
    apiUrl = manualApiUrl.replace(/\/+$/, '');
    if (!apiUrl.endsWith(API_PATH)) {
      apiUrl += API_PATH;
    }
  } else {
    const candidates = deriveApiCandidates(serverUrl);
    apiUrl = await probeApiUrl(candidates, auth);
    if (!apiUrl) {
      throw new Error(
        `Could not auto-detect API URL from server: ${serverUrl}\n` +
        `Tried: ${candidates.join(', ')}\n` +
        `Specify manually: node sealos-applaunchpad.mjs init ${kubeconfigPath} <api_url>\n` +
        `Example: node sealos-applaunchpad.mjs init ${kubeconfigPath} https://applaunchpad.your-domain.com`
      );
    }
  }

  // 5. Save config (auto-derives profile name from domain)
  const profileName = saveConfig(absPath, apiUrl);

  // 6. Fetch apps to verify auth
  const cfg = { apiUrl, kubeconfigPath: absPath };
  let apps = [];
  try {
    apps = await list(cfg);
  } catch (e) {
    // API URL found but auth failed — return partial result
    return { apiUrl, kubeconfigPath: absPath, profileName, apps: null, authError: e.message };
  }

  return { apiUrl, kubeconfigPath: absPath, profileName, apps };
}

async function createWait(cfg, jsonBody) {
  // 1. Create
  const body = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
  const createResult = await create(cfg, body);
  const name = body.name || createResult.name;

  // 2. Poll every 5s until running (max 2 min)
  const timeout = 120000;
  const interval = 5000;
  const start = Date.now();

  let lastStatus = 'creating';
  let consecutiveErrors = 0;
  while (Date.now() - start < timeout) {
    await sleep(interval);
    try {
      const info = await get(cfg, name);
      consecutiveErrors = 0;
      lastStatus = info.status;
      process.stderr.write(`Status: ${lastStatus}\n`);
      if (lastStatus.toLowerCase() === 'running') {
        return info;
      }
      if (lastStatus.toLowerCase() === 'error') {
        throw new Error(`App creation failed. Status: ${lastStatus}`);
      }
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors >= 5 || Date.now() - start > timeout) throw e;
    }
  }

  // Timeout - return last known state
  try {
    const info = await get(cfg, name);
    return { ...info, warning: `Timed out after 2 minutes. Last status: ${info.status}` };
  } catch {
    return { name, status: lastStatus, warning: 'Timed out after 2 minutes' };
  }
}

// --- main ---

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd) {
    console.error('ERROR: Command required.');
    console.error('Commands: init|list|get|create|create-wait|update|delete|start|pause|restart|update-storage|profiles|use');
    process.exit(1);
  }

  try {
    let result;

    switch (cmd) {
      case 'init': {
        if (!args[0]) throw new Error('Usage: node sealos-applaunchpad.mjs init <kubeconfig_path> [api_url]');
        result = await init(args[0], args[1]);
        break;
      }

      case 'list': {
        const cfg = requireConfig(false);
        result = await list(cfg);
        break;
      }

      case 'get': {
        const cfg = requireConfig(false);
        const name = requireName(args);
        result = await get(cfg, name);
        break;
      }

      case 'create': {
        const cfg = requireConfig(false);
        if (!args[0]) throw new Error('JSON body required');
        result = await create(cfg, args[0]);
        break;
      }

      case 'create-wait': {
        const cfg = requireConfig(false);
        if (!args[0]) throw new Error('JSON body required');
        result = await createWait(cfg, args[0]);
        break;
      }

      case 'update': {
        const cfg = requireConfig(false);
        const name = requireName(args);
        if (!args[1]) throw new Error('JSON body required');
        result = await update(cfg, name, args[1]);
        break;
      }

      case 'delete': {
        const cfg = requireConfig(false);
        const name = requireName(args);
        result = await del(cfg, name);
        break;
      }

      case 'start':
      case 'pause':
      case 'restart': {
        const cfg = requireConfig(false);
        const name = requireName(args);
        result = await action(cfg, name, cmd);
        break;
      }

      case 'update-storage': {
        const cfg = requireConfig(false);
        const name = requireName(args);
        if (!args[1]) throw new Error('JSON body required');
        result = await updateStorage(cfg, name, args[1]);
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
        const name = requireName(args);
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
        throw new Error(`Unknown command '${cmd}'. Commands: init|list|get|create|create-wait|update|delete|start|pause|restart|update-storage|profiles|use`);
    }

    if (result !== undefined) output(result);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
