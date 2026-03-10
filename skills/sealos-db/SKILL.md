---
name: sealos-db
description: >-
  Use when someone needs to manage databases on Sealos: create, list, update, scale,
  delete, start, stop, restart, check status, get connection info, enable/disable
  public access, backup/restore databases, or view database logs. Triggers on
  "I need a database", "create a PostgreSQL on sealos", "scale my database",
  "delete the database", "show my databases", "backup my database",
  "restore from backup", "show database logs", or "my app needs a database connection".
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
- "show all type", "all types", "show all" → treat as "Show all types"
- "show all versions", "all versions" → treat as "Show all versions"
- "pg", "postgres" → treat as the PostgreSQL option
- "mongo" → treat as the MongoDB option

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

Check for memory file `sealos-db.md` in the project's auto memory directory.

**If memory file exists and contains `kubeconfig_path` + `api_url`:**
1. Verify the kubeconfig file still exists at the saved path
2. If memory has a `profile` field, ensure the script's active profile matches:
   run `node scripts/sealos-db.mjs profiles` and compare. If different,
   run `node scripts/sealos-db.mjs use <profile>` to switch first.
3. Run `node scripts/sealos-db.mjs list` to test auth
4. If works → skip Step 1. Greet with context.
5. If fails (401, file missing) → proceed to Step 1

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

Run `node scripts/sealos-db.mjs init ~/.sealos/kubeconfig`. This single command:
- Parses the kubeconfig, extracts the server URL
- **Auto-probes** candidate API URLs (tries `dbprovider.<domain>` with subdomain
  variations) and uses the first one that responds successfully
- Saves config to `~/.config/sealos-db/config.json`
- Fetches available versions and lists databases

**If auto-detection fails** (error mentions "Could not auto-detect API URL"):
`AskUserQuestion`:
- header: "API URL"
- question: "Could not auto-detect API URL. What is your Sealos domain?"
- useDescription: "Find it in your browser URL bar when logged into Sealos Console (e.g., usw.sailos.io)"
- options: ["I'll check my Sealos Console"]

Then run: `node scripts/sealos-db.mjs init ~/.sealos/kubeconfig https://dbprovider.<domain>`

**If `init` returns an `authError`** (has `versions` but `databases: null`):
The API URL is correct but the kubeconfig token has expired.

1. Display:
   > API connection successful (`{profileName}`), but your kubeconfig token has expired.
2. Re-run `node scripts/sealos-auth.mjs login` to re-authenticate
3. After login succeeds → re-run `node scripts/sealos-db.mjs init ~/.sealos/kubeconfig`
4. Clear the memory file's `Auth` section so stale credentials aren't reused.

**If `init` succeeds fully** (has `versions` and `databases`, no `authError`):
The response includes `versions`, `databases`, and `profileName`. Display:
> Connected to Sealos (`{profileName}`). You have N databases.

Use `versions` and `databases` in Step 3 instead of making separate calls.

---

## Step 2: Route

Determine the operation from user intent:

| Intent | Operation |
|--------|-----------|
| "create/deploy/set up a database" | Create |
| "list/show my databases" | List |
| "check status/connection info" | Get |
| "scale/resize/update resources" | Update |
| "delete/remove database" | Delete |
| "start/stop/restart/public access" | Action |
| "backup/restore/list backups" | Backup |
| "show logs/check errors/slow queries" | Logs |
| "switch cluster/profile/account" | Profile |

If ambiguous, ask one clarifying question.

---

## Step 3: Operations

### Create

**3a. Scan project context**

Check the working directory for project files (package.json, go.mod, requirements.txt,
Cargo.toml, etc.) to understand the tech stack.

**3b. Versions & existing databases**

Use versions and databases from `init` response (Step 1c). If Step 0 was used
(skipped auth), run `node scripts/sealos-db.mjs list-versions` only if needed.

**3c. Ask name first**

`AskUserQuestion`:
- header: "Name"
- question: "Database name?"
- options: generate 2-3 name suggestions from project dir + detected type
  (see `references/defaults.md` for name suffix rules).
  If a name already exists (from 1d list), avoid it and note the conflict.
- Constraint: `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`, max 63 chars

**3d. Show recommended config and confirm**

Read `references/defaults.md` for type recommendation rules, resource presets,
and termination policy defaults.

Auto-resolve config from context:
- User's request (e.g., "create a pg" → type is postgresql)
- Project tech stack from 3a (e.g., Next.js → recommend postgresql)
- Scale hints (e.g., "production database" → higher resources)
- Memory preferences (e.g., last used type)

Display the **recommended config summary** (all fields from the create API):

```
Database config:

  Name:        my-app-pg
  Type:        PostgreSQL (recommended for web apps)
  Version:     postgresql-16.4.0 (latest)
  CPU:         1 Core
  Memory:      1 GB
  Storage:     3 GB
  Replicas:    3
  Termination: delete (data volumes kept)
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
- options: **(max 4 items)** — group the 7 fields into 4:
  - "Type & Version — {current_type} {current_version}"
  - "Resources (CPU, Memory, Storage) — {cpu}C / {mem}GB / {storage}GB"
  - "Replicas — {current_replicas}"
  - "Termination — {current_policy}"

When "Type & Version" selected → ask Type (step 1), then Version (step 2).
When "Resources" selected → ask CPU (step 3), Memory (step 4), Storage (step 5) sequentially.
Fields not selected keep their current values.

**1) Type** — First output ALL available types from `list-versions` as a numbered text list.
Then `AskUserQuestion`:
- header: "Type"
- question: "Database type?"
- options: **(max 4 items)** — top 4 types for the project context
  (see `references/defaults.md`), mark current with "(current)".
  User can type any other type name/number via "Type something".
- Example options array (for a Next.js project where current is postgresql):
  ```
  ["PostgreSQL (current)",
   "MongoDB",
   "Redis",
   "MySQL"]
  ```
- After type change: auto-update version to latest for new type

**2) Version** — First output ALL available versions for the chosen type as a numbered text list.
Then `AskUserQuestion`:
- header: "Version"
- question: "Which version?"
- options: **(max 4 items)** — latest 4 versions for the chosen type from `list-versions`,
  mark latest with "(latest)".
  User can type any other version via "Type something".
- Example options array:
  ```
  ["postgresql-16.4.0 (latest)",
   "postgresql-15.7.0",
   "postgresql-14.12.0",
   "postgresql-13.15.0"]
  ```

**3) CPU** → `AskUserQuestion`:
- header: "CPU"
- question: "CPU cores? (1-8)"
- options: **(max 4 items)** — `1 (current), 2, 4, 8` cores.
  Mark current with "(current)".

**4) Memory** → `AskUserQuestion`:
- header: "Memory"
- question: "Memory? (0.1-32 GB)"
- options: **(max 4 items)** — `1 (current), 2, 4, 8` GB.
  Mark current with "(current)".

**5) Storage** → `AskUserQuestion`:
- header: "Storage"
- question: "Storage? (1-300 GB)"
- options: **(max 4 items)** — `3 (current), 10, 20, 50` GB.
  Mark current with "(current)".

**6) Replicas** → `AskUserQuestion`:
- header: "Replicas"
- question: "Replicas? (1-20)"
- options: **(max 4 items)** — `1 (current), 2, 3, 5`.
  Mark current with "(current)".

**7) Termination policy** → `AskUserQuestion`:
- header: "Termination"
- question: "Termination policy? (cannot be changed after creation)"
- options:
  1. "delete (Recommended)" — description: "Cluster removed, data volumes (PVC) kept"
  2. "wipeout" — description: "Everything removed including data, irreversible"

After all fields, re-display the updated config summary and `AskUserQuestion`:
- header: "Config"
- question: "Create with this config?"
- options:
  1. "Create now (Recommended)"
  2. "Customize" — re-run the customize flow

Constraints:
- MySQL type is `apecloud-mysql`, not `mysql`
- Termination policy is set at creation and **cannot be changed later**

**3e. Create and wait**

Build JSON body:
```json
{"name":"my-db","type":"postgresql","version":"postgresql-16.4.0","quota":{"cpu":1,"memory":1,"storage":3,"replicas":3},"terminationPolicy":"delete"}
```

Run `node scripts/sealos-db.mjs create-wait '<json>'`. This single command creates the
database and polls until `running` (timeout 2 minutes). The response includes connection info.

**3f. Show connection info and offer integration**

Display connection details (host, port, username, password, connection string).

Then `AskUserQuestion`:
- header: "Integration"
- question: "Write connection info to your project?"
- options:
  1. "Add to .env (Recommended)" — append to .env file
  2. "Add to docker-compose.yml" — add service/env vars
  3. "Auto-detect framework config" — detect and write to framework-specific config
  4. "Skip" — just show the info, don't write anything
- When writing to `.env`, append, don't overwrite.

---

### List

Run `node scripts/sealos-db.mjs list`. Format as table:

```
Name            Type        Version             Status    CPU  Mem  Storage  Replicas
my-app-db       postgresql  postgresql-14.8.0   Running   1    2GB  5GB      1
cache           redis       redis-7.0.6         Running   1    1GB  3GB      1
```

Highlight abnormal statuses (Failed, Stopped).

---

### Get

If no name given, run List first, then `AskUserQuestion` with database names as options
(header: "Database", question: "Which database?").

Run `node scripts/sealos-db.mjs get {name}`. Display: name, type, version, status, quota, connection info.

---

### Update

**3a.** If no name given → List, then `AskUserQuestion` to pick which database
(options = database names from list).

**3b.** Run `node scripts/sealos-db.mjs get {name}`, show current specs.

**3c.** `AskUserQuestion` (header: "Update", question: "What to change?", multiSelect: true):
- "CPU" / "Memory" / "Storage" / "Replicas"
- For each selected field, follow up with `AskUserQuestion` offering allowed values as options.
  See `references/api-reference.md` for allowed values per field.

**3d.** Show before/after diff, then `AskUserQuestion` (header: "Confirm",
question: "Apply these changes?"):
- "Apply (Recommended)"
- "Edit again"
- "Cancel"

**3e.** Run `node scripts/sealos-db.mjs update {name} '{json}'`.

---

### Delete

**This is destructive. Maximum friction.**

**3a.** If no name given → List, then `AskUserQuestion` to pick which database.

**3b.** Run `node scripts/sealos-db.mjs get {name}`, show full details + termination policy.

**3c.** Explain consequences:
- `delete` policy: cluster removed, data volumes kept
- `wipeout` policy: everything removed, irreversible

**3d.** `AskUserQuestion`:
- header: "Confirm Delete"
- question: "Type `{name}` to permanently delete this database"
- options: ["Cancel"] — do NOT include the database name as a clickable option.
  The user must type the exact name via "Type something" to confirm.

If user types the correct name → proceed to 3e.
If user types something else → reply "Name doesn't match" and re-ask.
If user clicks Cancel → abort.

**3e.** Run `node scripts/sealos-db.mjs delete {name}`.

---

### Action (Start/Pause/Restart/Public Access)

**3a.** If no name given → List, then `AskUserQuestion` to pick which database.

**3b.** `AskUserQuestion` to confirm (header: "Action", question: "Confirm {action} on {name}?"):
- "{Action} now"
- "Cancel"
- For `enable-public`, add description warning about internet exposure.

**3c.** Run `node scripts/sealos-db.mjs {action} {name}`.
**3d.** For `start`: poll `node scripts/sealos-db.mjs get {name}` until `running`.
For `enable-public`: re-fetch and display `publicConnection`.

---

### Backup

**3a.** If no database name given → List, then `AskUserQuestion` to pick which database
(options = database names from list).

**3b.** `AskUserQuestion` (header: "Backup", question: "What would you like to do?"):
- "List backups"
- "Create backup"
- "Restore from backup"
- "Delete backup"

**List backups:**
Run `node scripts/sealos-db.mjs list-backups {name}`. Format as table:

```
Name                              Status      Created
my-db-backup-20240115             completed   2024-01-15T02:00:00Z
my-db-backup-20240120             completed   2024-01-20T02:00:00Z
```

Highlight non-completed statuses (inprogress, failed).

**Create backup:**
`AskUserQuestion` (header: "Backup Description", question: "Optional description? (max 31 chars)"):
- "Skip (no description)"
- "Pre-migration backup"
- "Manual snapshot"

Run `node scripts/sealos-db.mjs create-backup {name} '{"description":"..."}'` (omit body if skipped).
Confirm success.

**Delete backup:**
Run `node scripts/sealos-db.mjs list-backups {name}` first to show available backups.
`AskUserQuestion` with backup names as options (header: "Delete Backup", question: "Which backup to delete?").
Then confirm:
`AskUserQuestion` (header: "Confirm", question: "Delete backup '{backupName}'?"):
- "Delete"
- "Cancel"

Run `node scripts/sealos-db.mjs delete-backup {name} {backupName}`.

**Restore from backup:**
Run `node scripts/sealos-db.mjs list-backups {name}` first to show available backups.
`AskUserQuestion` with backup names (status=completed only) as options
(header: "Restore", question: "Which backup to restore from?").

Then `AskUserQuestion` (header: "Restore Config", question: "Restore with defaults?"):
- "Restore now (auto-name, same replicas)" — proceed with empty body
- "Customize name & replicas"

If customize: ask for new database name and replica count via `AskUserQuestion`.

Warn that restore creates a **new** database instance:
> This will create a new database from the backup. The original database is not affected.

`AskUserQuestion` (header: "Confirm Restore", question: "Restore from '{backupName}'?"):
- "Restore now"
- "Cancel"

Run `node scripts/sealos-db.mjs restore-backup {name} {backupName} '{"name":"...","replicas":N}'`.

---

### Logs

**3a.** If no database name given → List, then `AskUserQuestion` to pick which database
(options = database names from list).

**3b.** Get database details: run `node scripts/sealos-db.mjs get {name}` to determine
the database type. Map the type to log dbType parameter:
- `postgresql` → `postgresql`
- `apecloud-mysql` → `mysql`
- `mongodb` → `mongodb`
- `redis` → `redis`
- Other types → inform user that logs are only supported for mysql, mongodb, redis, postgresql

**3c.** `AskUserQuestion` (header: "Log Type", question: "Which logs?"):
- "Runtime logs" — logType: `runtimeLog`
- "Slow queries" — logType: `slowQuery`
- "Error logs" — logType: `errorLog`

**3d.** List log files: run `node scripts/sealos-db.mjs log-files {podName} {dbType} {logType}`.

The `podName` comes from the database's pod name (typically `{name}-{type}-0` or similar,
available from the `get` response). If unsure, use `{name}-{type}-0` as default.

Display available log files. If multiple files, `AskUserQuestion` with file paths as options
(header: "Log File", question: "Which log file?"). If only one, use it directly.

**3e.** Fetch logs: run `node scripts/sealos-db.mjs logs {podName} {dbType} {logType} {logPath}`.

Display log entries in a readable format:
```
[2024-01-15 02:00:00] [LOG]   checkpoint starting: xlog
[2024-01-15 02:00:01] [ERROR] connection reset by peer
```

If `hasMore` is true in the response metadata, offer to fetch more:
`AskUserQuestion` (header: "More Logs", question: "Load more log entries?"):
- "Next page"
- "Done"

---

### Profile (Switch Cluster)

The script supports multiple Sealos clusters via named profiles. Each `init` auto-creates
a profile named after the domain (e.g., `usw.sailos`). Existing profiles are preserved.

**List profiles:** Run `node scripts/sealos-db.mjs profiles`. Display as table:

```
Profile       API URL                                          Active
usw.sailos    https://dbprovider.usw.sailos.io/api/v2alpha     ✓
cn.sailos     https://dbprovider.cn.sailos.io/api/v2alpha
```

**Switch profile:** `AskUserQuestion` with profile names as options
(header: "Profile", question: "Which cluster?"). Then run:
`node scripts/sealos-db.mjs use <name>`

**Add new cluster:** `AskUserQuestion`:
- header: "Add Cluster"
- question: "How to connect to the new cluster?"
- options: ["OAuth2 Login (Recommended)", "Use existing kubeconfig file"]

If "OAuth2 Login" → run Step 1a (OAuth2 login), then Step 1b (init with `~/.sealos/kubeconfig`).
If "Use existing kubeconfig file" → `AskUserQuestion` asking for the file path, then run
`node scripts/sealos-db.mjs init <path>`. `init` auto-creates a new profile from the domain
without removing existing ones.

---

## Step 4: Update Memory

After every successful operation, update the memory file named `sealos-db.md`
in the project's auto memory directory.

**What to save and when:**

| Event | Save |
|-------|------|
| Successful auth (Step 1) | `profile`, `kubeconfig_path`, `api_url`, `namespace` |
| After create | Add database to list, update `preferred_type` |
| After delete | Remove database from list |
| After list/get | Refresh databases list with current state |

**Memory file format:**

```markdown
# Sealos DB Memory

## Auth
- auth_method: oauth2
- profile: usw.sailos
- kubeconfig_path: ~/.sealos/kubeconfig
- api_url: https://dbprovider.usw.sailos.io/api/v2alpha
- namespace: ns-xxx

## Databases
- my-app-pg: postgresql, running, Dev tier
- cache: redis, running, Small tier

## Preferences
- preferred_type: postgresql
```

**Rules:**
- Create the file if it doesn't exist
- Use Edit tool to update specific sections, don't overwrite the whole file unnecessarily
- The databases list is a cache for quick reference — always verify with live API when accuracy matters

---

## Scripts

Two entry points in `scripts/` (relative to this skill's directory):
- `sealos-auth.mjs` — OAuth2 Device Grant login (shared across all skills)
- `sealos-db.mjs` — Database operations

Zero external dependencies (Node.js only).
TLS certificate verification is disabled (`rejectUnauthorized: false`) because Sealos
clusters may use self-signed certificates. See `references/api-reference.md` for details.

**The scripts are bundled with this skill — do NOT check if they exist. Just run them.**

**Path resolution:** This skill's directory is listed in "Additional working directories"
in the system environment. Use that path to locate the scripts. For example, if the
additional working directory is `/Users/x/project/.claude/skills/sealos-db/scripts`,
then run: `node /Users/x/project/.claude/skills/sealos-db/scripts/sealos-db.mjs <command>`.

**Auth commands:**
```bash
node $SCRIPTS/sealos-auth.mjs check              # Check if authenticated
node $SCRIPTS/sealos-auth.mjs login               # Start OAuth2 login
node $SCRIPTS/sealos-auth.mjs login --insecure    # Skip TLS verification
node $SCRIPTS/sealos-auth.mjs info                # Show auth details
```

**Config auto-load priority:**
1. `KUBECONFIG_PATH` + `API_URL` env vars (backwards compatible)
2. `~/.config/sealos-db/config.json` (saved by `init`)
3. Error with hint to run `init`

```bash
# Use the absolute path from "Additional working directories" — examples below use SCRIPT as placeholder
SCRIPT="/path/from/additional-working-dirs/sealos-db.mjs"

# First-time setup — auto-probes API URL, saves config, returns versions + databases
node $SCRIPT init ~/.sealos/kubeconfig

# First-time setup with manual API URL (if auto-probe fails)
node $SCRIPT init ~/.sealos/kubeconfig https://dbprovider.your-domain.com

# After init, no env vars needed — config is auto-loaded
node $SCRIPT list-versions
node $SCRIPT list
node $SCRIPT get my-db
node $SCRIPT create '{"name":"my-db","type":"postgresql","quota":{"cpu":1,"memory":1,"storage":3,"replicas":3}}'
node $SCRIPT create-wait '{"name":"my-db","type":"postgresql","quota":{"cpu":1,"memory":1,"storage":3,"replicas":3}}'
node $SCRIPT update my-db '{"quota":{"cpu":2}}'
node $SCRIPT delete my-db
node $SCRIPT start|pause|restart|enable-public|disable-public my-db

# Backup management
node $SCRIPT list-backups my-db
node $SCRIPT create-backup my-db '{"description":"pre-migration"}'
node $SCRIPT delete-backup my-db my-db-backup-20240115
node $SCRIPT restore-backup my-db my-db-backup-20240115 '{"name":"my-db-restored","replicas":3}'

# Log retrieval
node $SCRIPT log-files my-db-postgresql-0 postgresql runtimeLog
node $SCRIPT logs my-db-postgresql-0 postgresql runtimeLog /var/log/postgresql.log
node $SCRIPT logs my-db-postgresql-0 postgresql slowQuery /var/log/slow.log 1 50

# Multi-cluster profile management
node $SCRIPT profiles               # list all saved profiles
node $SCRIPT use usw.sailos          # switch active profile
```

## Reference Files

- `references/api-reference.md` — API endpoints, resource constraints, error formats. Read first.
- `references/defaults.md` — Tier presets, type recommendations, config card templates, termination policy. Read for create operations.
- `references/openapi.json` — Complete OpenAPI spec. Read only for edge cases.

## Error Handling

**Treat each error independently.** Do NOT chain unrelated errors.

| Scenario | Action |
|----------|--------|
| Kubeconfig not found | Run `node scripts/sealos-auth.mjs login` to authenticate |
| Auth error (401) | Run `node scripts/sealos-auth.mjs login` to re-authenticate, then re-run `init` |
| Name conflict (409) | Suggest alternative name |
| Invalid specs | Explain constraint, suggest valid value |
| Storage shrink | Refuse, K8s limitation |
| Creation timeout (>2 min) | Offer to keep polling or check console |
| "Unsupported version" (500) | Retry WITHOUT version field |
| "namespace not found" (500) | Cluster admin kubeconfig; need Sealos user kubeconfig |

## Rules

- NEVER ask a question as plain text — ALWAYS use `AskUserQuestion` with options
- NEVER ask user to manually download kubeconfig — always use `scripts/sealos-auth.mjs login`
- NEVER run `test -f` on the skill script — it is always present, just run it
- NEVER write kubeconfig to `~/.kube/config` — may overwrite user's existing config
- NEVER echo kubeconfig content to output
- NEVER delete without explicit name confirmation
- NEVER construct HTTP requests inline — always use `scripts/sealos-db.mjs`
- When writing to `.env`, append, don't overwrite
- Version must come from `node scripts/sealos-db.mjs list-versions`. If rejected, retry without version field
- MySQL type is `apecloud-mysql`, not `mysql`
- Storage can only expand, never shrink
