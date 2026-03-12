# Sealos DB — Claude Code Skill

Manage databases on [Sealos](https://sealos.io) using natural language. Create, scale, and manage PostgreSQL, MongoDB, Redis, and more — without leaving your terminal.

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- A Sealos kubeconfig file (download from **Sealos Console > Settings > Kubeconfig**)

### Install

Copy the `sealos-db` skill into your project's `.claude/skills/` directory. Claude Code auto-detects it.

### Usage

Ask Claude Code in natural language, or run `/sealos-db`:

```
> I need a PostgreSQL database for my app
> Create a Redis cache
> Show my databases
> Scale my-app-pg to 4 cores
> Delete the test database
> Enable public access on my-app-pg
> Restart the staging database
```

Claude walks you through authentication, configuration, and execution interactively.

## Features

- **Smart defaults** — detects your tech stack and recommends a database type, version, and resources
- **Full lifecycle** — create, list, inspect, update, delete, start, stop, restart
- **Public access control** — expose or hide databases from the internet
- **Project integration** — writes connection info to `.env`, `docker-compose.yml`, or framework config
- **Safe deletes** — requires explicit name confirmation before destroying anything

## Authentication

On first use, Claude opens your browser for OAuth2 login. Credentials are saved to `~/.sealos/kubeconfig` and the API URL is auto-derived from `~/.sealos/auth.json`.