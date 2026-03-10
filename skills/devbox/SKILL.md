---
name: sealos-devbox
description: >-
  Use when someone needs to manage development environments on Sealos: create, list,
  update, scale, delete, start, pause, shutdown, restart devboxes, get SSH connection info,
  manage ports, create releases, deploy to production, or monitor resource usage.
  Triggers on "I need a devbox", "create a Node.js devbox on sealos", "scale my devbox",
  "delete the devbox", "show my devboxes", "deploy my devbox", "get SSH info",
  "pause the devbox", "create a release", or "my app needs a dev environment".
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
- "show all runtimes", "all runtimes" → treat as "Show all runtimes"
- "node", "nodejs" → treat as the Node.js option
- "py", "python3" → treat as the Python option
- "next" → treat as the Next.js option

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

Check for memory file `sealos-devbox.md` in the project's auto memory directory.

**If memory file exists and contains `kubeconfig_path` + `api_url`:**
1. Verify the kubeconfig file still exists at the saved path
2. Run `node scripts/sealos-devbox.mjs list` to test auth
3. If works → skip Step 1. Greet with context.
4. If fails (401, file missing) → proceed to Step 1

**If no memory file or missing auth fields:**
1. Run `node scripts/sealos-auth.mjs check`
2. If `authenticated: true` → skip to Step 1b (init with `~/.sealos/kubeconfig`)
3. If `authenticated: false` → proceed to Step 1a

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

Run `node scripts/sealos-devbox.mjs init ~/.sealos/kubeconfig`. This single command:
- Parses the kubeconfig, extracts the server URL
- **Auto-probes** candidate API URLs (tries `devbox.<domain>` with subdomain
  variations) and uses the first one that responds successfully
- Saves config to `~/.config/sealos-devbox/config.json`
- Fetches available templates and lists devboxes

**If auto-detection fails** (error mentions "Could not auto-detect API URL"):
`AskUserQuestion`:
- header: "API URL"
- question: "Could not auto-detect API URL. What is your Sealos domain?"
- useDescription: "Find it in your browser URL bar when logged into Sealos Console (e.g., gzg.sealos.io)"
- options: ["I'll check my Sealos Console"]

Then run: `node scripts/sealos-devbox.mjs init ~/.sealos/kubeconfig https://devbox.<domain>`

**If `init` returns an `authError`** (has `templates` but `devboxes: null`):
The API URL is correct but the kubeconfig token has expired.

1. Display:
   > API connection successful, but your kubeconfig token has expired.
2. Re-run `node scripts/sealos-auth.mjs login` to re-authenticate
3. After login succeeds → re-run `node scripts/sealos-devbox.mjs init ~/.sealos/kubeconfig`
4. Clear the memory file's `Auth` section so stale credentials aren't reused.

**If `init` succeeds fully** (has `templates` and `devboxes`, no `authError`):
The response includes `templates`, `devboxes`, and `profileName`. Display:
> Connected to Sealos (`{profileName}`). You have N devboxes.

Use `templates` and `devboxes` in Step 3 instead of making separate calls.

---

## Step 2: Route

Determine the operation from user intent:

| Intent | Operation |
|--------|-----------|
| "create/set up a devbox/dev environment" | Create |
| "list/show my devboxes" | List |
| "check status/details/SSH info" | Get |
| "scale/resize/update resources/ports" | Update |
| "delete/remove devbox" | Delete |
| "start/pause/shutdown/restart" | Action |
| "SSH/connect/remote access" | SSH Connect |
| "create release/tag/version" | Release |
| "deploy/ship to production" | Deploy |
| "monitor/metrics/CPU/memory usage" | Monitor |
| "autostart/startup command" | Autostart |


If ambiguous, ask one clarifying question.

---

## Step 3: Operations

### Create

**3a. Scan project context**

Check the working directory for project files (package.json, go.mod, requirements.txt,
Cargo.toml, etc.) to understand the tech stack.

**3b. Templates & existing devboxes**

Use templates and devboxes from `init` response (Step 1c). If Step 0 was used
(skipped auth), run `node scripts/sealos-devbox.mjs templates` only if needed.

**3c. Ask name first**

`AskUserQuestion`:
- header: "Name"
- question: "Devbox name?"
- options: generate 2-3 name suggestions from project dir + detected runtime
  (see `references/defaults.md` for name suffix rules).
  If a name already exists (from list), avoid it and note the conflict.
- Constraint: `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`, max 63 chars

**3d. Show recommended config and confirm**

Read `references/defaults.md` for runtime recommendation rules and resource presets.

Auto-resolve config from context:
- User's request (e.g., "create a python devbox" → runtime is python)
- Project tech stack from 3a (e.g., Next.js → recommend next.js runtime)
- Scale hints (e.g., "production devbox" → higher resources)
- Memory preferences (e.g., last used runtime)
- Default port from templates API (e.g., next.js → 3000)

Display the **recommended config summary** (all fields from the create API):

```
Devbox config:

  Name:        my-app-next
  Runtime:     next.js (detected from next.config.mjs)
  CPU:         1 Core
  Memory:      2 GB
  Ports:       3000 (http, public)
```

Then `AskUserQuestion`:
- header: "Config"
- question: "Create with this config?"
- options:
  1. "Create now (Recommended)" — accept all, proceed to 3e
  2. "Customize" — go to 3d-customize flow

**3d-customize: Pick fields to change, then configure only those**

`AskUserQuestion`:
- header: "Customize"
- question: "Which fields do you want to change?"
- multiSelect: true
- options: **(max 4 items)** — group fields into 4:
  - "Runtime — {current_runtime}"
  - "Resources (CPU, Memory) — {cpu}C / {mem}GB"
  - "Ports — {current_ports}"
  - "Env & Autostart"

When "Runtime" selected → ask Runtime (step 1).
When "Resources" selected → ask CPU (step 2), Memory (step 3) sequentially.
When "Ports" selected → ask port config (step 4).
When "Env & Autostart" selected → ask env vars and autostart command (step 5).
Fields not selected keep their current values.

**1) Runtime** — First output ALL available runtimes from `templates` as a numbered text list.
Then `AskUserQuestion`:
- header: "Runtime"
- question: "Which runtime?"
- options: **(max 4 items)** — top 4 runtimes for the project context
  (see `references/defaults.md`), mark current with "(current)".
  User can type any other runtime name/number via "Type something".
- After runtime change: auto-update default port from templates API

**2) CPU** → `AskUserQuestion`:
- header: "CPU"
- question: "CPU cores? (0.1-32)"
- options: **(max 4 items)** — `0.5, 1 (current), 2, 4` cores.
  Mark current with "(current)".

**3) Memory** → `AskUserQuestion`:
- header: "Memory"
- question: "Memory? (0.1-32 GB)"
- options: **(max 4 items)** — `1, 2 (current), 4, 8` GB.
  Mark current with "(current)".

**4) Ports** → `AskUserQuestion`:
- header: "Ports"
- question: "Port configuration?"
- options:
  - "Keep default ({port} http public)" — use template default
  - "Add custom port"
  - "No ports"

If "Add custom port": ask for port number, protocol (http/grpc/ws), and isPublic.

**5) Env & Autostart** → Ask for environment variables (name=value pairs) and
autostart command (optional). If user provides env vars, parse them into the array format.

After all fields, re-display the updated config summary and `AskUserQuestion`:
- header: "Config"
- question: "Create with this config?"
- options:
  1. "Create now (Recommended)"
  2. "Customize" — re-run the customize flow

**3e. Create and wait**

Build JSON body:
```json
{"name":"my-devbox","runtime":"next.js","quota":{"cpu":1,"memory":2},"ports":[{"number":3000,"protocol":"http","isPublic":true}]}
```

Run `node scripts/sealos-devbox.mjs create-wait '<json>'`. This single command creates the
devbox and polls until `running` (timeout 2 minutes). The response includes SSH info.

**3f. Show SSH info and offer integration**

Display SSH connection details (host, port, username, key path).

Then `AskUserQuestion`:
- header: "Integration"
- question: "Set up SSH access for this devbox?"
- options:
  1. "Write SSH config (Recommended)" — append Host block to `~/.ssh/config`
  2. "Show SSH command only" — display `ssh -i key -p port user@host`
  3. "Open in VS Code" — show VS Code Remote SSH instructions
  4. "Skip" — just show the info, don't write anything
- When writing SSH config, append, don't overwrite.

---

### List

Run `node scripts/sealos-devbox.mjs list`. Format as table:

```
Name            Runtime     Status    CPU  Memory
my-app-next     next.js     Running   1    2GB
api-server      go          Stopped   2    4GB
```

Highlight abnormal statuses (Error, Stopped).

---

### Get

If no name given, run List first, then `AskUserQuestion` with devbox names as options
(header: "Devbox", question: "Which devbox?").

Run `node scripts/sealos-devbox.mjs get {name}`. Display: name, runtime, status, quota,
SSH info, ports, env, pods.

---

### Update

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox
(options = devbox names from list).

**3b.** Run `node scripts/sealos-devbox.mjs get {name}`, show current specs.

**3c.** `AskUserQuestion` (header: "Update", question: "What to change?", multiSelect: true):
- "CPU & Memory"
- "Ports"

**For CPU & Memory:** Follow up with `AskUserQuestion` for each field offering allowed values.
See `references/api-reference.md` for allowed ranges.

**For Ports:** Show current ports. Then `AskUserQuestion`:
- "Add a port"
- "Remove a port" (list existing ports as sub-options)
- "Toggle public access" (list existing ports)
- "Replace all ports" (specify new port list)

**3d.** Show before/after diff, then `AskUserQuestion` (header: "Confirm",
question: "Apply these changes?"):
- "Apply (Recommended)"
- "Edit again"
- "Cancel"

**3e.** Run `node scripts/sealos-devbox.mjs update {name} '{json}'`.

**Important:** When updating ports, the `ports` array in the update body is a **full replacement**.
Include all existing ports you want to keep (with their `portName`), plus any new ports.
Existing ports omitted from the array will be deleted.

---

### Delete

**This is destructive. Maximum friction.**

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** Run `node scripts/sealos-devbox.mjs get {name}`, show full details.

**3c.** Explain consequences:
> Deleting a devbox permanently removes the environment, all files inside it, SSH keys,
> and port configurations. This cannot be undone.

**3d.** `AskUserQuestion`:
- header: "Confirm Delete"
- question: "Type `{name}` to permanently delete this devbox"
- options: ["Cancel"] — do NOT include the devbox name as a clickable option.
  The user must type the exact name via "Type something" to confirm.

If user types the correct name → proceed to 3e.
If user types something else → reply "Name doesn't match" and re-ask.
If user clicks Cancel → abort.

**3e.** Run `node scripts/sealos-devbox.mjs delete {name}`.

---

### Action (Start/Pause/Shutdown/Restart)

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** For pause and shutdown, explain the difference:

> **Pause** — Quick suspend. The pod is paused but resources stay allocated. Fast resume (~seconds).
> Use when you're stepping away briefly.
>
> **Shutdown** — Full stop. Resources are released. Slower resume (~30s-1min) as the pod must restart.
> Use when you're done for the day or want to save costs.

**3c.** `AskUserQuestion` to confirm (header: "Action", question: "Confirm {action} on {name}?"):
- "{Action} now"
- "Cancel"

**3d.** Run `node scripts/sealos-devbox.mjs {action} {name}`.
**3e.** For `start`: poll `node scripts/sealos-devbox.mjs get {name}` until `running`.

---

### SSH Connect

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** Run `node scripts/sealos-devbox.mjs get {name}`. Extract SSH info.

**3c.** Check if SSH key exists at `~/.config/sealos-devbox/keys/{name}.pem`.

**3d.** Display SSH connection info:

```
SSH Connection:

  Host:        {ssh.host}
  Port:        {ssh.port}
  User:        {ssh.user}
  Key:         ~/.config/sealos-devbox/keys/{name}.pem
  Working Dir: {ssh.workingDir}

  Command: ssh -i ~/.config/sealos-devbox/keys/{name}.pem -p {ssh.port} {ssh.user}@{ssh.host}
```

**3e.** `AskUserQuestion`:
- header: "SSH Setup"
- question: "How would you like to connect?"
- options:
  1. "Write SSH config" — append Host block to `~/.ssh/config`
  2. "Copy SSH command" — just show the command
  3. "VS Code Remote SSH" — show instructions for VS Code Remote-SSH extension
  4. "Done"

---

### Release

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** `AskUserQuestion` (header: "Release", question: "What would you like to do?"):
- "Create a release"
- "List releases"
- "Delete a release"

**Create release:**
`AskUserQuestion` (header: "Release Tag", question: "Tag for this release?"):
- Suggest tags like "v1.0.0", "v0.1.0", or based on existing releases
- Ask for optional description

Build body: `{"tag":"v1.0.0","releaseDescription":"...","startDevboxAfterRelease":true}`

Run `node scripts/sealos-devbox.mjs create-release {name} '<json>'`.
Show status (202 Accepted = async). Suggest checking `list-releases` for progress.

**List releases:**
Run `node scripts/sealos-devbox.mjs list-releases {name}`. Format as table:

```
Tag       Description          Created              Image
v1.0.0    First release        2024-01-15 10:00     ghcr.io/...
v0.1.0    Beta                 2024-01-10 08:00     ghcr.io/...
```

**Delete release:**
Run `node scripts/sealos-devbox.mjs list-releases {name}` first. `AskUserQuestion` with
tags as options (header: "Delete Release", question: "Which release to delete?").
Confirm before deleting.

Run `node scripts/sealos-devbox.mjs delete-release {name} {tag}`.

---

### Deploy

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** Run `node scripts/sealos-devbox.mjs list-releases {name}`. If no releases,
guide user to create one first.

**3c.** `AskUserQuestion` (header: "Deploy", question: "Which release to deploy?"):
- List available release tags as options

**3d.** `AskUserQuestion` to confirm (header: "Confirm Deploy",
question: "Deploy `{tag}` of `{name}` to AppLaunchpad?"):
- "Deploy now"
- "Cancel"

**3e.** Run `node scripts/sealos-devbox.mjs deploy {name} {tag}`.

**3f.** Show deployment status. Run `node scripts/sealos-devbox.mjs list-deployments {name}`
to verify.

---

### Monitor

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** `AskUserQuestion` (header: "Time Range", question: "Monitoring period?"):
- "Last 1 hour"
- "Last 3 hours (default)"
- "Last 24 hours"
- "Custom range"

For "Custom range": ask for start time, end time, and step interval.

**3c.** Run `node scripts/sealos-devbox.mjs monitor {name} [start] [end] [step]`.

**3d.** Display metrics as a table:

```
Time              CPU %    Memory %
14:38             1.08     10.32
14:40             1.18     10.37
14:42             1.25     10.41
```

Highlight high utilization (>80%) with a warning.

---

### Autostart

**3a.** If no name given → List, then `AskUserQuestion` to pick which devbox.

**3b.** Run `node scripts/sealos-devbox.mjs get {name}` to show current state and runtime.

**3c.** Suggest a startup command based on the runtime:

| Runtime | Suggested command |
|---------|-------------------|
| node.js, next.js, express.js, react, vue, etc. | `npm start` or `npm run dev` |
| python, django, flask | `python manage.py runserver` or `flask run` |
| go, gin, echo, chi, iris | `go run .` |
| rust, rocket | `cargo run` |
| java, quarkus, vert.x | `mvn quarkus:dev` or `java -jar app.jar` |

**3d.** `AskUserQuestion` (header: "Autostart", question: "Startup command?"):
- Suggested command from table above
- "No command (just enable autostart)"
- "Custom command"

**3e.** Run `node scripts/sealos-devbox.mjs autostart {name} '{"execCommand":"..."}'`
or `node scripts/sealos-devbox.mjs autostart {name}` for default behavior.

---

## Step 4: Update Memory

After every successful operation, update the memory file named `sealos-devbox.md`
in the project's auto memory directory.

**What to save and when:**

| Event | Save |
|-------|------|
| Successful auth (Step 1) | `kubeconfig_path`, `api_url`, `namespace` |
| After create | Add devbox to list, update `preferred_runtime` |
| After delete | Remove devbox from list |
| After list/get | Refresh devboxes list with current state |

**Memory file format:**

```markdown
# Sealos Devbox Memory

## Auth
- auth_method: oauth2
- kubeconfig_path: ~/.sealos/kubeconfig
- api_url: https://devbox.gzg.sealos.io/api/v2alpha
- namespace: ns-xxx

## Devboxes
- my-app-next: next.js, running, 1C/2GB
- api-server: go, stopped, 2C/4GB

## Preferences
- preferred_runtime: next.js
```

**Rules:**
- Create the file if it doesn't exist
- Use Edit tool to update specific sections, don't overwrite the whole file unnecessarily
- The devboxes list is a cache for quick reference — always verify with live API when accuracy matters

---

## Scripts

Two entry points in `scripts/` (relative to this skill's directory):
- `sealos-auth.mjs` — OAuth2 Device Grant login (shared across all skills)
- `sealos-devbox.mjs` — Devbox operations

Zero external dependencies (Node.js only).
TLS certificate verification is disabled (`rejectUnauthorized: false`) because Sealos
clusters may use self-signed certificates. See `references/api-reference.md` for details.

**The scripts are bundled with this skill — do NOT check if they exist. Just run them.**

**Path resolution:** This skill's directory is listed in "Additional working directories"
in the system environment. Use that path to locate the scripts. For example, if the
additional working directory is `/Users/x/project/.claude/skills/sealos-devbox/scripts`,
then run: `node /Users/x/project/.claude/skills/sealos-devbox/scripts/sealos-devbox.mjs <command>`.

**Auth commands:**
```bash
node $SCRIPTS/sealos-auth.mjs check              # Check if authenticated
node $SCRIPTS/sealos-auth.mjs login               # Start OAuth2 login
node $SCRIPTS/sealos-auth.mjs login --insecure    # Skip TLS verification
node $SCRIPTS/sealos-auth.mjs info                # Show auth details
```

**Config auto-load priority:**
1. `KUBECONFIG_PATH` + `API_URL` env vars (backwards compatible)
2. `~/.config/sealos-devbox/config.json` (saved by `init`)
3. Error with hint to run `init`

```bash
# Use the absolute path from "Additional working directories" — examples below use SCRIPT as placeholder
SCRIPT="/path/from/additional-working-dirs/sealos-devbox.mjs"

# First-time setup — auto-probes API URL, saves config, returns templates + devboxes
node $SCRIPT init ~/.sealos/kubeconfig

# First-time setup with manual API URL (if auto-probe fails)
node $SCRIPT init ~/.sealos/kubeconfig https://devbox.your-domain.com

# After init, no env vars needed — config is auto-loaded
node $SCRIPT templates
node $SCRIPT list
node $SCRIPT get my-devbox
node $SCRIPT create '{"name":"my-devbox","runtime":"node.js","quota":{"cpu":1,"memory":2},"ports":[{"number":3000}]}'
node $SCRIPT create-wait '{"name":"my-devbox","runtime":"node.js","quota":{"cpu":1,"memory":2}}'
node $SCRIPT update my-devbox '{"quota":{"cpu":2,"memory":4}}'
node $SCRIPT update my-devbox '{"ports":[{"portName":"existing-port","isPublic":false},{"number":8080}]}'
node $SCRIPT delete my-devbox
node $SCRIPT start|pause|shutdown|restart my-devbox
node $SCRIPT autostart my-devbox '{"execCommand":"npm start"}'

# Release management
node $SCRIPT list-releases my-devbox
node $SCRIPT create-release my-devbox '{"tag":"v1.0.0","releaseDescription":"First release"}'
node $SCRIPT delete-release my-devbox v1.0.0

# Deployment
node $SCRIPT deploy my-devbox v1.0.0
node $SCRIPT list-deployments my-devbox

# Monitoring
node $SCRIPT monitor my-devbox
node $SCRIPT monitor my-devbox 1760510280 1760513880 5m

```

## Reference Files

- `references/api-reference.md` — API endpoints, resource constraints, error formats. Read first.
- `references/defaults.md` — Resource presets, runtime recommendations, config templates. Read for create operations.
- `references/openapi.json` — Complete OpenAPI spec. Read only for edge cases.

## Error Handling

**Treat each error independently.** Do NOT chain unrelated errors.

| Scenario | Action |
|----------|--------|
| Kubeconfig not found | Run `node scripts/sealos-auth.mjs login` to authenticate |
| Auth error (401) | Run `node scripts/sealos-auth.mjs login` to re-authenticate, then re-run `init` |
| Name conflict (409) | Suggest alternative name |
| Invalid specs | Explain constraint, suggest valid value |
| Creation timeout (>2 min) | Offer to keep polling or check console |
| Release 202 (async) | Explain it's building, suggest polling releases list |
| "namespace not found" (500) | Cluster admin kubeconfig; need Sealos user kubeconfig |

## Rules

- NEVER ask a question as plain text — ALWAYS use `AskUserQuestion` with options
- NEVER ask user to manually download kubeconfig — always use `scripts/sealos-auth.mjs login`
- NEVER run `test -f` on the skill script — it is always present, just run it
- NEVER write kubeconfig to `~/.kube/config` — may overwrite user's existing config
- NEVER echo kubeconfig content to output
- NEVER delete without explicit name confirmation
- NEVER construct HTTP requests inline — always use `scripts/sealos-devbox.mjs`
- When writing to `~/.ssh/config`, append, don't overwrite
- Runtime must come from `node scripts/sealos-devbox.mjs templates`
- SSH keys are auto-saved on create — do not ask the user to manually save them
- When updating ports, remember the array is a full replacement — include all ports to keep
- Explain pause vs shutdown difference when the user asks for either action
