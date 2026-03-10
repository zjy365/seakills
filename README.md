# Seakills

AI agent skills for Sealos Cloud — deploy any project, provision databases, object storage & more with one command.

Works with **Claude Code**, **Gemini CLI**, **Codex** — any AI coding assistant with file and terminal access.

## Install

```bash
curl -fsSL https://seakills.gzg.sealos.run/install.sh | bash
```

The installer auto-detects your AI tools and sets up skills for each one.

**Supported agents:**

| Agent | Skills Dir | Detection |
|-------|-----------|-----------|
| Claude Code | `~/.claude/skills/` | `~/.claude` exists |
| Gemini CLI | `~/.gemini/skills/` | `~/.gemini` exists |
| Codex | `~/.codex/skills/` | `~/.codex` or `$CODEX_HOME` exists |

Skills are installed once to `~/.agents/skills/` (canonical), then symlinked to each agent. No duplication.

## Skills

### `/sealos-deploy` — Deploy & update any project

```
/sealos-deploy                                       # deploy or update current project
/sealos-deploy https://github.com/labring-sigs/kite  # deploy remote repo
```

One command for both first deploy and subsequent updates. The skill auto-detects whether the project is already running on Sealos and chooses the right path.

**First deploy:**

```
[preflight] ✓ Docker  ✓ git  ✓ Sealos Cloud
[assess]    Go + net/http → score 10/12, suitable
[detect]    Found ghcr.io/zxh326/kite:v0.4.0 (amd64) → skip build
[template]  Generated Sealos template
[deploy]    ✓ Deployed to Sealos Cloud
```

**Update (same command, auto-detected):**

```
[detect]    Found existing deployment kite-x8k2m1nq
[build]     Built & pushed zhujingyang/kite:20260310-143022
[update]    ✓ Image updated, rollout complete
```

**Pipeline:**

```
/sealos-deploy
  │
  ▼
Preflight — Docker, git, kubectl, Sealos auth
  │
  ▼
Existing deployment found?
  ├── Yes ──→ UPDATE: rebuild image → kubectl set image → verify rollout
  │           (auto-rollback on failure)
  │
  └── No ───→ DEPLOY:
              Assess ─── not deployable? → stop with reason
                │
                ▼
              Detect existing image ─── found? → skip build ──┐
                │ not found                                    │
                ▼                                              │
              Generate Dockerfile (if missing)                 │
                │                                              │
                ▼                                              │
              Build & Push to Docker Hub                       │
                │                                              │
                ◄──────────────────────────────────────────────┘
                │
                ▼
              Generate Sealos Template → Deploy → Done ✓
```

**First time setup:** On first use, the skill checks and guides you through Docker, Docker Hub login, and Sealos Cloud OAuth — all interactive, no manual token copy-paste.

**Updating:** Just run `/sealos-deploy` again after changing your code. The skill finds the running deployment, rebuilds the image, and does a rolling update with zero downtime. If the new version fails health checks, it auto-rolls back.

### Coming Soon

| Skill | Description |
|-------|-------------|
| `/sealos-database` | Provision and manage databases (PostgreSQL, MySQL, MongoDB, Redis) |
| `/sealos-objectstorage` | Create and manage object storage buckets |
| More | Every Sealos Cloud capability → an agent skill |

## Project Structure

```
seakills/
├── install.sh                          # Multi-agent installer
├── skills/
│   ├── sealos-deploy/                  # /sealos-deploy entry point
│   │   ├── SKILL.md                    # Phase overview & orchestration
│   │   ├── config.json                 # Regions, OAuth client config
│   │   ├── modules/                    # Preflight & pipeline logic
│   │   └── scripts/                    # Auth, image detection, build
│   ├── dockerfile-skill/               # Dockerfile generation & build-fix
│   ├── cloud-native-readiness/         # Readiness assessment (0-12 score)
│   └── docker-to-sealos/              # Docker Compose → Sealos template
└── site/                               # Landing page (seakills.run)
```

## Requirements

- Docker + Docker Hub account (for building & pushing images)
- [Sealos Cloud](https://sealos.run) account
- kubectl (optional — enables in-place updates of deployed apps)

## License

MIT
