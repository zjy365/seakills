# Sealos Template — Claude Code Skill

Browse and deploy applications from the [Sealos](https://sealos.io) template catalog using natural language. Deploy AI tools, databases, web apps, and more — without leaving your terminal.

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- A Sealos kubeconfig file (download from **Sealos Console > Settings > Kubeconfig**) — only needed for deploying, not browsing

### Install

Copy the `sealos-template` skill into your project's `.claude/skills/` directory. Claude Code auto-detects it.

### Usage

Ask Claude Code in natural language, or run `/sealos-template`:

```
> What apps can I deploy on Sealos?
> Show me AI templates
> Deploy Perplexica
> I need a search engine
> Deploy this YAML file
> Show template details for nocodb
```

Claude walks you through browsing, configuration, and deployment interactively.

## Features

- **Template catalog** — browse available applications by category (AI, database, tools, etc.)
- **Smart browsing** — templates sorted by popularity, grouped by category
- **Guided deployment** — collects required args interactively, shows resource requirements
- **Raw YAML deploy** — deploy custom templates from project files with dry-run preview
- **OAuth2 login** — browser-based auth, no manual kubeconfig download needed

## Authentication

Browsing templates is public — no authentication needed. On first deploy, Claude starts an OAuth2 browser login via `sealos-auth.mjs`. Credentials are saved to `~/.sealos/kubeconfig` and `~/.sealos/auth.json`, with the API URL auto-derived from the region.
