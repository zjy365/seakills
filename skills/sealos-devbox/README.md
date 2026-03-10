# Sealos Devbox — Claude Code Skill

Manage development environments on [Sealos](https://sealos.io) using natural language. Create, scale, and manage devboxes with SSH access, port forwarding, releases, and deployments — without leaving your terminal.

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- A Sealos kubeconfig file (download from **Sealos Console > Settings > Kubeconfig**)

### Install

Copy the `sealos-devbox` skill into your project's `.claude/skills/` directory. Claude Code auto-detects it.

### Usage

Ask Claude Code in natural language, or run `/sealos-devbox`:

```
> Create a Node.js devbox for my project
> Show my devboxes
> Scale my-app-node to 4 cores
> Delete the test devbox
> Pause the staging devbox
> Get SSH connection info for my-api
> Create a release for my-app
> Deploy v1.0.0 to production
> Show CPU/memory metrics for my-devbox
```

Claude walks you through authentication, configuration, and execution interactively.

## Features

- **Smart defaults** — detects your tech stack and recommends a runtime, resources, and ports
- **Full lifecycle** — create, list, inspect, update, delete, start, pause, shutdown, restart
- **SSH integration** — auto-saves SSH keys, offers to write SSH config, supports VS Code Remote
- **Port management** — add, remove, and toggle public access for ports
- **Release & deploy** — create versioned releases and deploy to AppLaunchpad
- **Resource monitoring** — view CPU and memory usage metrics over time
- **Session memory** — remembers your auth and preferences across conversations
- **Safe deletes** — requires explicit name confirmation before destroying anything

## Authentication

On first use, Claude asks you to point to your Sealos kubeconfig file. Credentials are cached locally at `~/.config/sealos-devbox/config.json` and reused across sessions.
