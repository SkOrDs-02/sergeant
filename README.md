# Sergeant

[![CI](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml/badge.svg)](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml)
![Node 20](https://img.shields.io/badge/node-20.x-brightgreen)
![pnpm 9](https://img.shields.io/badge/pnpm-9.15.1-orange)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Sergeant - персональна платформа-хаб для фінансів, звичок, спорту, харчування та AI-асистованих повсякденних сценаріїв. Продукт живе в одному `pnpm` + `Turborepo` monorepo і розгортається як web/PWA, mobile та internal ops surfaces.

## Що в репо

- `apps/web` - основний продукт: Vite + React 18 PWA.
- `apps/server` - Express + PostgreSQL + Better Auth API.
- `apps/mobile` - Expo + React Native клієнт.
- `apps/mobile-shell` - Capacitor shell навколо web surface.
- `apps/console` - internal Telegram bot для ops/marketing сценаріїв.
- `packages/*` - shared contracts, domain logic, design tokens, config і tooling.

Швидкий архітектурний огляд дивись у [docs/architecture/README.md](./docs/architecture/README.md), а повний doc index - у [docs/README.md](./docs/README.md).

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

Основні локальні URL:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## Основні команди

```bash
pnpm dev:web
pnpm dev:server
pnpm dev:db
pnpm lint
pnpm typecheck
pnpm test
```

Розгорнутий contributor workflow, verification matrix і commit/PR conventions живуть у [CONTRIBUTING.md](./CONTRIBUTING.md).

## For Contributors and Agents

- Людям: починай з [CONTRIBUTING.md](./CONTRIBUTING.md).
- Агентам: починай з [AGENTS.md](./AGENTS.md) і каталогу skills [docs/superpowers/agent-skills-catalog.md](./docs/superpowers/agent-skills-catalog.md).
- Repeatable execution recipes: [docs/playbooks/README.md](./docs/playbooks/README.md).
- Governance та hard rules matrix: [docs/governance/README.md](./docs/governance/README.md).
