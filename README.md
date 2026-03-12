# Seakills

AI skills that let you deploy any project to [Sealos Cloud](https://gzg.sealos.run) with a single slash command — right from your AI coding assistant.

Works with **Claude Code**, **Gemini CLI**, and **Codex**.

## Quick Start

```bash
curl -fsSL https://seakills.gzg.sealos.run/install.sh | bash
```

Then open your project and run:

```
/sealos-deploy
```

That's it. Your project is live on Sealos Cloud.

## What You Need

Before your first deploy, make sure you have:

- [ ] **Docker** installed and running
- [ ] **A Docker Hub account** (the skill will prompt you to log in)
- [ ] **A [Sealos Cloud](https://gzg.sealos.run) account** (you'll be guided through auth on first run)
- [ ] **Node.js 18+** (optional — speeds up scoring, image detection, and auth; curl fallback used otherwise)
- [ ] **Python 3.8+** (optional — enables template validation; AI fallback used otherwise)
- [ ] **kubectl** (optional — enables in-place updates of running apps)

## Usage: `/sealos-deploy`

Deploy any project — local or remote:

```
/sealos-deploy                                       # deploy your current project
/sealos-deploy https://github.com/labring-sigs/kite  # deploy a GitHub repo
```

### First deploy

The skill assesses your project, generates a Dockerfile if needed, builds and pushes an image, and deploys to Sealos Cloud:

```
[preflight] ✓ Docker  ✓ git  ✓ Sealos Cloud
[assess]    Go + net/http → score 10/12, suitable
[detect]    Found ghcr.io/zxh326/kite:v0.4.0 (amd64) → skip build
[template]  Generated Sealos template
[deploy]    ✓ Deployed to Sealos Cloud
```

### Updating

Just run `/sealos-deploy` again after changing your code. The skill detects your running deployment, rebuilds the image, and does a rolling update with zero downtime. If the new version fails health checks, it auto-rolls back.

```
[detect]    Found existing deployment kite-x8k2m1nq
[build]     Built & pushed zhujingyang/kite:20260310-143022
[update]    ✓ Image updated, rollout complete
```

## First Time Setup

On your first run, the skill walks you through everything interactively — Docker Hub login, Sealos Cloud auth, and any missing tools. No manual token copy-paste required.

## Coming Soon

| Skill | What it does |
|-------|-------------|
| `/database` | Provision and manage databases (PostgreSQL, MySQL, MongoDB, Redis) |
| `/objectstorage` | Create and manage object storage buckets |
| More | Every Sealos Cloud capability as an agent skill |

## License

MIT
