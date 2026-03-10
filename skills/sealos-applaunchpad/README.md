# Sealos AppLaunchpad — Claude Code Skill

Deploy and manage containerized applications on [Sealos](https://sealos.io) using natural language. Create, scale, and manage apps — without leaving your terminal.

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- A Sealos kubeconfig file (download from **Sealos Console > Settings > Kubeconfig**)

### Install

Copy the `sealos-applaunchpad` skill into your project's `.claude/skills/` directory. Claude Code auto-detects it.

### Usage

Ask Claude Code in natural language, or run `/sealos-applaunchpad`:

```
> Deploy my Next.js app on Sealos
> Create an nginx app
> Show my apps
> Scale my-app to 2 cores and 4GB memory
> Delete the test app
> Pause my staging app
> Restart the API server
> Add storage to my-app
```

Claude walks you through authentication, configuration, and execution interactively.

## Features

- **Smart defaults** — detects your tech stack and recommends an image, port, and resources
- **Full lifecycle** — create, list, inspect, update, delete, start, pause, restart
- **Port management** — configure HTTP, gRPC, WebSocket, TCP/UDP ports with public/private access
- **Auto-scaling** — configure HPA (Horizontal Pod Autoscaler) for elastic scaling
- **GPU support** — allocate GPU resources for ML/AI workloads
- **Storage management** — add and expand persistent volumes
- **Environment & config** — manage env variables, config maps, and launch commands
- **Session memory** — remembers your auth and preferences across conversations
- **Safe deletes** — requires explicit name confirmation before destroying anything

## Authentication

On first use, Claude asks you to point to your Sealos kubeconfig file. Credentials are cached locally at `~/.config/sealos-applaunchpad/config.json` and reused across sessions.
