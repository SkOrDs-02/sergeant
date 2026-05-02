# Sergeant

[![CI](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml/badge.svg)](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml)
![Node 20](https://img.shields.io/badge/node-20.x-brightgreen)
![pnpm 9](https://img.shields.io/badge/pnpm-9.15.1-orange)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

Sergeant is a personal hub platform for finance, habits, sport, nutrition, and AI-assisted day-to-day workflows. The product lives in one `pnpm` + `Turborepo` monorepo and ships across web/PWA, mobile, and internal ops surfaces.

## What is in the repo

- `apps/web` - primary product surface built with Vite + React 18.
- `apps/server` - Express + PostgreSQL + Better Auth API.
- `apps/mobile` - Expo + React Native client.
- `apps/mobile-shell` - Capacitor shell around the web surface.
- `apps/console` - internal Telegram bot for ops and marketing workflows.
- `packages/*` - shared contracts, domain logic, design tokens, config, and tooling.

Architecture overview lives in [docs/architecture/README.md](./docs/architecture/README.md); the full doc index lives in [docs/README.md](./docs/README.md).

## Quickstart

```bash
git clone https://github.com/Skords-01/Sergeant.git
cd Sergeant
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:db
pnpm dev:server
pnpm dev:web
```

Local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## Core commands

```bash
pnpm dev:web
pnpm dev:server
pnpm dev:db
pnpm lint
pnpm typecheck
pnpm test
```

Detailed contributor workflow, verification matrix, and commit/PR conventions live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## For Contributors and Agents

- Humans: start with [CONTRIBUTING.md](./CONTRIBUTING.md).
- Agents: start with [AGENTS.md](./AGENTS.md) and [docs/superpowers/agent-skills-catalog.md](./docs/superpowers/agent-skills-catalog.md).
- Repeatable execution recipes: [docs/playbooks/README.md](./docs/playbooks/README.md).
- Governance and hard rules matrix: [docs/governance/README.md](./docs/governance/README.md).
- Runtime inventory, release, incident, and recovery surfaces: [docs/architecture/service-catalog.md](./docs/architecture/service-catalog.md), [docs/security/disaster-recovery.md](./docs/security/disaster-recovery.md).
