---
name: sealos-template
description: >-
  Use when someone needs to deploy applications from templates on Sealos: browse
  templates, view template details, deploy from catalog, or deploy custom YAML.
  Triggers on "deploy perplexica", "show available templates", "deploy from template",
  "list Sealos apps", "deploy this YAML", or "what apps can I deploy on Sealos".
---

## Interaction Principle — MANDATORY

**NEVER output a question as plain text. ALWAYS use `AskUserQuestion` with an `options` array.**

This is a hard rule with zero exceptions:
- Every time you need user input → call `AskUserQuestion` with `options`
- Do NOT write a question as text output and wait — the user MUST see clickable options
- Do NOT output explanatory prose and then ask a question as text — call `AskUserQuestion` instead
- Keep text output before `AskUserQuestion` to one short sentence max (status update only)

**BAD** (never do this):
```
Please save your Sealos kubeconfig to a file and tell me the path.
Download from Sealos Console > Settings > Kubeconfig...
```

**GOOD** (always do this):
```
AskUserQuestion(header="Kubeconfig", question="Where is your Sealos kubeconfig?", options=[...])
```

`AskUserQuestion` always adds an implicit "Other / Type something" option automatically,
so the user can still type custom input when none of the options fit.

**Free-text matching:** When the user types free text instead of clicking an option,
match it to the closest option by intent. Examples:
- "show all", "browse all" → treat as "Browse all"
- "deploy it", "yes deploy" → treat as "Deploy now"
- "perplexica", "perplexica template" → treat as selecting that template

Never re-ask the same question because the wording didn't match exactly.

## Fixed Execution Order

**ALWAYS follow these steps in this exact order. No skipping, no reordering.**

```
Step 0: Check Memory       (try to restore auth from previous session)
Step 1: Authenticate        (only if Step 0 has no valid memory)
Step 2: Route               (determine which operation the user wants)
Step 3: Execute operation   (follow the operation-specific steps below)
Step 4: Update Memory       (save state for next session)
```

---

## Step 0: Check Memory

Check for a memory file named `sealos-template.md` in the project's auto memory directory
(the path is provided by the system environment, e.g. `~/.claude/projects/.../memory/sealos-template.md`).

**If memory file exists and contains `kubeconfig_path` + `api_url`:**
1. Verify the kubeconfig file still exists at the saved path
2. If memory has a `profile` field, ensure the script's active profile matches:
   run `node scripts/sealos-template.mjs profiles` and compare. If different,
   run `node scripts/sealos-template.mjs use <profile>` to switch first.
3. Run `node scripts/sealos-template.mjs list` (auto-loads config) to test connection
4. If works → skip Step 1. Greet with context:
   > Connected to Sealos (`{profile}`). {N} templates available.
5. If fails → proceed to Step 1, mention connection issue

**If no memory file or missing auth fields:**
1. Run `node scripts/sealos-auth.mjs check`
2. If `authenticated: true` → skip to Step 1b (init with `~/.sealos/kubeconfig`)
3. If `authenticated: false` → proceed to Step 1a

**Note:** Browsing is public (no auth needed). Auth is only validated on deploy operations.
If memory has `api_url` but no `kubeconfig_path`, browsing still works — only prompt for
kubeconfig when the user wants to deploy.

---

## Step 1: Authenticate

Run this step only if Step 0 found no valid memory.

### 1a. OAuth2 Login

Run `node scripts/sealos-auth.mjs login`.

This command:
1. Opens the user's browser to the Sealos authorization page
2. Displays a user code and verification URL in stderr
3. Polls until the user approves (max 10 minutes)
4. Exchanges the token for a kubeconfig
5. Saves to `~/.sealos/kubeconfig`

Display while waiting:
> Opening browser for Sealos login... Approve the request in your browser.

**If TLS error**: Retry with `node scripts/sealos-auth.mjs login --insecure`

**If other error**:
`AskUserQuestion`:
- header: "Login Failed"
- question: "Browser login failed. Try again?"
- options: ["Try again", "Cancel"]

### 1b. Init (derive API URL + validate connection)

Run `node scripts/sealos-template.mjs init ~/.sealos/kubeconfig`. This single command:
- Parses the kubeconfig, extracts the server URL
- **Auto-probes** candidate API URLs (tries `template.<domain>` with subdomain
  variations) and uses the first one that responds successfully
- Saves config to `~/.config/sealos-template/config.json`
- Fetches template count to verify connection

**If auto-detection fails** (error mentions "Could not auto-detect API URL"):
`AskUserQuestion`:
- header: "API URL"
- question: "Could not auto-detect API URL. What is your Sealos domain?"
- useDescription: "Find it in your browser URL bar when logged into Sealos Console (e.g., usw.sailos.io)"
- options: ["I'll check my Sealos Console"]

Then run: `node scripts/sealos-template.mjs init ~/.sealos/kubeconfig https://template.<domain>`

**If `init` succeeds:**
The response includes `profileName` and `templateCount`. Display:
> Connected to Sealos (`{profileName}`). {templateCount} templates available.

---

## Step 2: Route

Determine the operation from user intent:

| Intent | Operation |
|--------|-----------|
| "list/show/browse templates" | Browse |
| "what apps can I deploy" | Browse |
| "deploy X" / "I need X" | Deploy |
| "deploy this YAML" / "deploy custom template" | Deploy Raw |
| "show template details" / "what does X need" | Details |
| "switch cluster/profile/account" | Profile |

If ambiguous, ask one clarifying question.

---

## Step 3: Operations

### Browse

1. Run `node scripts/sealos-template.mjs list` command, get template array + `menuKeys` categories
2. If categories exist (`menuKeys` is non-empty), group templates by category, sort by `deployCount` within each
3. Display categorized list: name, description, deployCount
4. `AskUserQuestion`: top 4 categories as options (header: "Category", question: "Browse by category?")
5. After user picks category → show templates in that category
6. `AskUserQuestion`: top 4 templates as options (header: "Template", question: "Which template?")
7. After selection → proceed to Details

---

### Details

1. Run `node scripts/sealos-template.mjs get <name>` command
2. Display all fields:
   - Name, description, categories, gitRepo
   - Resource quota: CPU, Memory, Storage, NodePort
   - Required args: name, description, type (highlight required with no default)
   - Optional args: name, description, type, default value
   - Deploy count
3. `AskUserQuestion`: "Deploy this template" / "Browse more" / "Done"

---

### Deploy (`POST /templates/instances`)

1. If template name not known → run Browse first
2. Run `node scripts/sealos-template.mjs get <name>` to fetch template details with quota and args
3. Show resource requirements (quota from API response):
   ```
   Resource requirements:
     CPU:      1 vCPU
     Memory:   2.25 GiB
     Storage:  2 GiB
     NodePort: 0
   ```

4. **Ensure auth:** If not yet authenticated (no kubeconfig), run Step 1 now.
   Browse is public but deploy requires auth.

5. Collect required args (where `required: true` AND `default` is empty string):
   - For each: `AskUserQuestion` with arg description and type
   - Password/secret types (type is `"password"` or name contains KEY, SECRET, TOKEN, PASSWORD):
     no pre-filled options, user must type
   - Boolean types: options `["true", "false"]`
   - String with obvious values: suggest up to 4 options
6. Show optional args with their defaults, `AskUserQuestion`: "Use defaults (Recommended)" / "Customize"
   - If customize: iterate through optional args one by one
7. Ask instance name: `AskUserQuestion` with 2-3 suggestions (`my-{template}`, `{project}-{template}`)
   - **User can type any name — passed to API exactly as typed**
   - Constraint shown in question: lowercase, alphanumeric + hyphens, 1-63 chars
8. Display confirmation summary:
   - Template name, instance name, all args (mask password/secret values: first 3 chars + `*****`)
   - Resource requirements
9. `AskUserQuestion`: "Deploy now" / "Edit args" / "Cancel"
10. Run `node scripts/sealos-template.mjs create '<json>'` with exact `{name, template, args}` — **no modification of any values**
11. Display API response: instance name, uid, createdAt, resources list with quotas

---

### Deploy Raw (`POST /templates/raw`)

1. `AskUserQuestion`: "From a file in my project" / "I'll provide it"
2. If file → ask path, read file content as YAML string
3. `AskUserQuestion`: "Dry-run first (Recommended)" / "Deploy directly" (maps to `dryRun: true/false`)
4. If template YAML has required args without defaults → collect via `AskUserQuestion`
5. Build the JSON body: `{yaml, args, dryRun}` — **no modification**
6. Run `node scripts/sealos-template.mjs create-raw '<json>'`
   - For large JSON bodies, write to a temp file and pass the file path instead
7. If dry-run → show preview (200 response: auto-generated name, resources), then confirm actual deploy
8. If deploy → show result (201 response)

---

### Profile (Switch Cluster)

The script supports multiple Sealos clusters via named profiles. Each `init` auto-creates
a profile named after the domain (e.g., `usw.sailos`). Existing profiles are preserved.

**List profiles:** Run `node scripts/sealos-template.mjs profiles`. Display as table:

```
Profile       API URL                                          Active
usw.sailos    https://template.usw.sailos.io/api/v2alpha       ✓
cn.sailos     https://template.cn.sailos.io/api/v2alpha
```

**Switch profile:** `AskUserQuestion` with profile names as options
(header: "Profile", question: "Which cluster?"). Then run:
`node scripts/sealos-template.mjs use <name>`

**Add new cluster:** `AskUserQuestion`:
- header: "Add Cluster"
- question: "How to connect to the new cluster?"
- options: ["OAuth2 Login (Recommended)", "Use existing kubeconfig file"]

If "OAuth2 Login" → run Step 1a (OAuth2 login), then Step 1b (init with `~/.sealos/kubeconfig`).
If "Use existing kubeconfig file" → `AskUserQuestion` asking for the file path, then run
`node scripts/sealos-template.mjs init <path>`. `init` auto-creates a new profile from the domain
without removing existing ones.

---

## Step 4: Update Memory

After every successful operation, update the memory file named `sealos-template.md`
in the project's auto memory directory.

**What to save and when:**

| Event | Save |
|-------|------|
| Successful auth (Step 1) | `profile`, `kubeconfig_path`, `api_url` |
| After deploy | Add instance to recent deploys |
| After browse/details | Update last browsed info |

**Memory file format:**

```markdown
# Sealos Template Memory

## Auth
- auth_method: oauth2
- profile: usw.sailos
- kubeconfig_path: ~/.sealos/kubeconfig
- api_url: https://template.usw.sailos.io/api/v2alpha

## Recent Deploys
- my-perplexica: perplexica, 2026-01-28
- my-nocodb: nocodb, 2026-01-25
```

**Rules:**
- Create the file if it doesn't exist
- Use Edit tool to update specific sections, don't overwrite the whole file unnecessarily

---

## Scripts

Two entry points in `scripts/` (relative to this skill's directory):
- `sealos-auth.mjs` — OAuth2 Device Grant login (shared across all skills)
- `sealos-template.mjs` — Template browsing and deployment operations

**Auth commands:**
```bash
node $SCRIPTS/sealos-auth.mjs check              # Check if authenticated
node $SCRIPTS/sealos-auth.mjs login               # Start OAuth2 login
node $SCRIPTS/sealos-auth.mjs login --insecure    # Skip TLS verification
node $SCRIPTS/sealos-auth.mjs info                # Show auth details
```

Single entry point for Template operations: `scripts/sealos-template.mjs`.
Zero external dependencies (Node.js only).
TLS certificate verification is disabled (`rejectUnauthorized: false`) because Sealos
clusters may use self-signed certificates. See `references/api-reference.md` for details.

**The script is bundled with this skill — do NOT check if it exists. Just run it.**

**Path resolution:** This skill's directory is listed in "Additional working directories"
in the system environment. Use that path to locate the script. For example, if the
additional working directory is `/Users/x/project/.claude/skills/sealos-template/scripts`,
then run: `node /Users/x/project/.claude/skills/sealos-template/scripts/sealos-template.mjs <command>`.

**Config auto-load priority:**
1. `KUBECONFIG_PATH` + `API_URL` env vars (backwards compatible)
2. `~/.config/sealos-template/config.json` (saved by `init`)
3. Error with hint to run `init`

```bash
# Use the absolute path from "Additional working directories" — examples below use SCRIPT as placeholder
SCRIPT="/path/from/additional-working-dirs/sealos-template.mjs"

# First-time setup — auto-probes API URL, saves config, returns template count
node $SCRIPT init ~/.sealos/kubeconfig

# First-time setup with manual API URL (if auto-probe fails)
node $SCRIPT init ~/.sealos/kubeconfig https://template.your-domain.com

# After init, no env vars needed — config is auto-loaded
node $SCRIPT list                          # list all templates (public, no auth)
node $SCRIPT list --language=zh            # list in Chinese
node $SCRIPT get perplexica                # get template details (public, no auth)
node $SCRIPT get perplexica --language=zh  # get details in Chinese
node $SCRIPT create '{"name":"my-app","template":"perplexica","args":{"OPENAI_API_KEY":"sk-xxx"}}'
node $SCRIPT create-raw '{"yaml":"apiVersion: app.sealos.io/v1\nkind: Template\n...","dryRun":true}'
node $SCRIPT create-raw /path/to/body.json  # read JSON body from file

# Multi-cluster profile management
node $SCRIPT profiles               # list all saved profiles
node $SCRIPT use usw.sailos          # switch active profile
```

## Reference Files

- `references/api-reference.md` — API endpoints, instance name constraints, error formats. Read first.
- `references/defaults.md` — Display rules, arg collection rules, masking. Read for deploy operations.
- `references/openapi.json` — Complete OpenAPI spec. Read only for edge cases.

## Error Handling

**Treat each error independently.** Do NOT chain unrelated errors.

| HTTP Status | Error Code | Action |
|-------------|------------|--------|
| 400 | INVALID_PARAMETER | Show which field is invalid from details array, re-ask |
| 400 | INVALID_VALUE | Show validation message (e.g., name format rules), re-ask |
| 401 | AUTHENTICATION_REQUIRED | Run `node scripts/sealos-auth.mjs login` to re-authenticate |
| 403 | PERMISSION_DENIED | Show details, suggest checking permissions |
| 404 | NOT_FOUND | Template doesn't exist in catalog, show list for user to pick |
| 409 | ALREADY_EXISTS | Instance name taken, ask for alternative name |
| 422 | INVALID_RESOURCE_SPEC | Show K8s rejection reason from details |
| 500 | KUBERNETES_ERROR / INTERNAL_ERROR | Show error message and details |
| 503 | SERVICE_UNAVAILABLE | Cluster unreachable, retry later |

## Rules

- NEVER ask a question as plain text — ALWAYS use `AskUserQuestion` with options
- NEVER ask user to manually download kubeconfig — always use `scripts/sealos-auth.mjs login`
- NEVER run `test -f` on the skill script — it is always present, just run it
- NEVER write kubeconfig to `~/.kube/config` — may overwrite user's existing config
- NEVER echo kubeconfig content to output
- NEVER construct HTTP requests inline — always use `scripts/sealos-template.mjs`
- NEVER modify user-provided values (name, args) before passing to API
- Mask password/secret arg values in display only (pass real values to API)
- Instance name passed to API exactly as user provides it
