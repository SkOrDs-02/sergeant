# Sergeant

[![CI](https://github.com/SkOrDs-02/sergeant/actions/workflows/ci.yml/badge.svg)](https://github.com/SkOrDs-02/sergeant/actions/workflows/ci.yml)
![Node 20](https://img.shields.io/badge/node-20.x-brightgreen)
![pnpm 9](https://img.shields.io/badge/pnpm-9.15.1-orange)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Last touched:** 2026-06-26 by @Skords-01. **Next review:** 2026-09-24.
> **Status:** Active

> **Гроші, тіло, звички, їжа — в одному додатку. Local-first. Приватно.**
> Sergeant — це особистий hub для дисциплінованої щоденки: один додаток замість п'яти, з AI-коучем, що бачить весь твій день.

> **AI coding agent or tool?** Read [`AGENTS.md`](./AGENTS.md) — repo policy, hard rules, and the agent operating system (skills, playbooks). Sub-tree quick references: [`apps/web/AGENTS.md`](./apps/web/AGENTS.md), [`apps/server/AGENTS.md`](./apps/server/AGENTS.md), [`apps/mobile/AGENTS.md`](./apps/mobile/AGENTS.md).

<!-- Hero asset slot: replace this comment with `<img src="docs/assets/sergeant-hero.png" alt="Sergeant dashboard preview" width="1280" />` once the screenshot is captured (see docs/assets/README.md § "Як викапчити hero"). The slot stays as a comment, not a broken image link, so the README renders cleanly until the file lands. -->

<p align="center"><em>Hero screenshot pending — capture-інструкції в <a href="./docs/assets/README.md">docs/assets/</a>. Виконавець може закрити цей пункт у follow-up PR через 1280×720 PNG з cold-start dashboard-у.</em></p>

## Що це?

Sergeant обʼєднує 5 модулів, які раніше жили в окремих додатках:

| Модуль         | Що робить                                                 |
| -------------- | --------------------------------------------------------- |
| **Фінік**      | Фінанси: Monobank-інтеграція, транзакції, бюджети, борги  |
| **Фізрук**     | Фітнес: тренування, підходи, біометрія, планування        |
| **Рутина**     | Звички: трекер habit-ів, стріки, календар                 |
| **Харчування** | Їжа: meal-логи, сканер штрих-кодів, AI-аналіз             |
| **HubChat**    | AI-помічник: чат з Claude, який виконує дії через розмову |

Web (PWA), iOS, Android. Працює офлайн. Дані — на твоєму пристрої.

## Спробувати

- **Локальний запуск:** [§ Quickstart](#quickstart) нижче — ~5 хвилин від клонування до live UI на `http://localhost:5173`.
- **Демо-режим без реєстрації:** після bootstrap відкрий `http://localhost:5173/welcome?demo=1` — побачиш приклад інтерфейсу з seed-даними, без створення акаунта.
  _(Public production URL ще не лінкується — додасться, коли launch-readiness допиляється; див. [`docs/01-product/launch/business/04-launch-readiness.md`](./docs/01-product/launch/business/04-launch-readiness.md))._
- **Огляд продукту:** [`docs/01-product/launch/business/01-monetization-and-pricing.md`](./docs/01-product/launch/business/01-monetization-and-pricing.md) — бізнес-модель + позиціонування.
- **Поточний стан FTUX:** [`docs/01-product/launch/product-os/ftux-master-tracker.md`](./docs/01-product/launch/product-os/ftux-master-tracker.md) — sprint registry + відкриті проблеми.

> Хочеш контриб'ютити, а не просто юзати? → [§ For Contributors and Agents](#for-contributors-and-agents) у кінці.

## Tech Stack

- **Language:** TypeScript 6
- **Frontend (web):** React 18, Vite, Tailwind CSS, TanStack Query
- **Mobile:** Expo 52, React Native 0.76, NativeWind
- **Mobile shell:** Capacitor (web wrapper for native distribution)
- **Backend:** Express.js, PostgreSQL 16, Better Auth (authentication)
- **AI:** Anthropic Claude API, Voyage AI (embeddings)
- **Monorepo:** Turborepo, pnpm 9.15.1
- **Testing:** Vitest, Testing Library, MSW (API mocking), Testcontainers (real Postgres in tests), Playwright (E2E)
- **Linting:** ESLint 9, Prettier, commitlint, Husky (pre-commit hooks)
- **CI/CD:** GitHub Actions
- **Deploy:** Vercel (frontend), Hetzner CX23 + Coolify (backend: API + PostgreSQL + Redis; see [ADR-0074](docs/04-governance/adr/0074-hosting-hetzner-coolify.md))
- **Monitoring:** Sentry (errors), PostHog (analytics), Grafana (metrics), Web Vitals
- **Telegram bot:** grammy + Anthropic (internal ops)

## What is in the repo

### Apps (`apps/`)

| Directory           | What it is               | Stack                   | Deployed to             |
| ------------------- | ------------------------ | ----------------------- | ----------------------- |
| `apps/web`          | Web app (primary UI)     | React + Vite + Tailwind | Vercel                  |
| `apps/server`       | API server (backend)     | Express + PostgreSQL    | Hetzner + Coolify       |
| `apps/mobile`       | Mobile app (native)      | Expo + React Native     | App Store / Google Play |
| `apps/mobile-shell` | Mobile app (web wrapper) | Capacitor               | App Store / Google Play |
| `tools/openclaw`    | Telegram bot (internal)  | grammy + Anthropic      | Railway                 |

### Tooling (`tools/`)

Non-app workspaces that support lint / build invariants. Not deployed.

| Directory              | What it is                                         | Stack      |
| ---------------------- | -------------------------------------------------- | ---------- |
| `tools/tsconfig-guard` | Strict TS-flag guard (Hard Rule #19); gates `lint` | TypeScript |

### Packages (`packages/`)

Packages are shared code reused across apps. Instead of copy-pasting between web and mobile, we put shared code in `packages/` and import from there.

| Package                         | Purpose                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `@sergeant/shared`              | Shared business logic, Zod schemas, types — used by ALL apps                    |
| `@sergeant/api-client`          | Type-safe HTTP client for talking to the server                                 |
| `@sergeant/config`              | Shared configs (ESLint, TypeScript, etc.)                                       |
| `@sergeant/design-tokens`       | Design tokens, Tailwind preset, colors, typography                              |
| `@sergeant/insights`            | Cross-module analytics (pure functions over data)                               |
| `@sergeant/finyk-domain`        | Finance domain logic (calculations, amount formatting)                          |
| `@sergeant/fizruk-domain`       | Fitness domain logic (calories, load calculations)                              |
| `@sergeant/nutrition-domain`    | Nutrition domain logic                                                          |
| `@sergeant/routine-domain`      | Habits domain logic                                                             |
| `@sergeant/db-schema`           | Drizzle schemas, migrations, and sync helpers                                   |
| `@sergeant/openclaw-plugin`     | OpenClaw Gateway tools/hooks plugin (Gateway-only — NOT consumed by web/mobile) |
| `eslint-plugin-sergeant-design` | Custom ESLint rules for the design system                                       |

Architecture overview lives in [docs/02-engineering/architecture/README.md](./docs/02-engineering/architecture/README.md); the full doc index lives in [docs/README.md](./docs/README.md).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│   apps/web      │     │   apps/mobile   │     │   apps/mobile-shell │
│ (React + Vite)  │     │ (Expo + RN)     │     │ (Capacitor)         │
└───────┬─────────┘     └───────┬─────────┘     └───────┬─────────────┘
        │                       │                       │
        └───────────┬───────────┘                       │
                    │                                   │
                    ▼                                   │
        ┌───────────────────────┐                       │
        │ packages/api-client   │◀──────────────────────┘
        │ (HTTP client)         │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   apps/server         │
        │ (Express + Better Auth│
        │  + Anthropic Claude)  │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐     ┌─────────────────┐
        │   PostgreSQL          │     │  tools/openclaw   │
        │ (Coolify / pgvector)  │     │  (Telegram bot)  │
        └───────────────────────┘     └─────────────────┘
```

Fizruk and Routine modules follow a **local-first** approach: data is stored locally first (localStorage on web, MMKV on mobile), then synced to the server via CloudSync using LWW (Last-Write-Wins) conflict resolution. The app works offline.

## Prerequisites

- **Node.js 20.x** (recommended via [Volta](https://volta.sh/))
- **pnpm 9.15.1** (`npm install -g pnpm@9.15.1`)
- **Docker** (for local PostgreSQL)

## Quickstart

### Fast path: `pnpm bootstrap` (~5 хв)

```bash
git clone https://github.com/SkOrDs-02/sergeant.git
cd sergeant
corepack enable && corepack prepare pnpm@9.15.1 --activate   # one-time
pnpm bootstrap
```

`pnpm bootstrap` робить:

1. Перевіряє Node 20.x + pnpm 9.15.1 + Docker daemon (з підказкою як виправити, якщо щось не так).
2. `pnpm install --frozen-lockfile` (skip-неться, якщо `node_modules` свіжий).
3. `cp .env.example .env`, якщо `.env` ще нема (existing `.env` не чіпається).
4. `pnpm dev:db` — піднімає Postgres у Docker і прокачує всі міграції.
5. Друкує блок «next steps» з командами для запуску API + Web.

Тільки prerequisites без install/docker: `pnpm bootstrap:check`.

Прапорці: `--skip-install`, `--skip-db` (для CI / повторних прогонів). Кроки нижче — manual fallback, якщо bootstrap не запускається.

### Manual fallback

#### 1. Clone and install

```bash
git clone https://github.com/SkOrDs-02/sergeant.git
cd sergeant
pnpm install --frozen-lockfile
```

`--frozen-lockfile` installs the exact versions recorded in the lockfile without modifying it.

#### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in your editor. Most values are pre-filled for local development. Key variables:

| Variable                                    | Required? | What it does                                                                                                                                                                                                  |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Yes       | Database URL (Docker default: `postgresql://hub:hub@localhost:5432/hub`)                                                                                                                                      |
| `BETTER_AUTH_SECRET`                        | Yes       | Session cookie signing secret (min 32 characters)                                                                                                                                                             |
| `ANTHROPIC_API_KEY`                         | For AI    | Claude API key — HubChat won't work without it                                                                                                                                                                |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | No        | Google OAuth — without these the "Sign in with Google" button won't appear                                                                                                                                    |
| `VITE_API_PROXY_TARGET`                     | No        | Dev proxy target (default `http://127.0.0.1:3000`)                                                                                                                                                            |
| Others                                      | No        | See [`docs/02-engineering/integrations/env-vars.md`](./docs/02-engineering/integrations/env-vars.md) — full reference for all 100+ optional variables (Sentry, PostHog, Voyage, Mono, OpenClaw, AI quotas, …) |

#### 3. Start the database

```bash
pnpm dev:db
```

This runs `docker compose up -d` + `pnpm db:migrate` — starts PostgreSQL 16 in a Docker container and runs all SQL migrations.

To stop the database: `pnpm db:down` (or `docker compose down`).

#### 4. Start the server and web app

```bash
# In one terminal:
pnpm dev:server

# In another terminal:
pnpm dev:web
```

Local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

#### 5. (Optional) Mobile app

```bash
# Expo (React Native)
pnpm --filter @sergeant/mobile start

# Capacitor (web wrapper → native)
# First build web, then open in Xcode / Android Studio
```

#### 6. (Optional) Telegram bot

```bash
pnpm --filter @sergeant/openclaw dev
```

Requires a Telegram Bot Token in `tools/openclaw/.env`.

## Core commands

| Command                 | What it does                                                |
| ----------------------- | ----------------------------------------------------------- |
| `pnpm dev:web`          | Start the web app (Vite dev server)                         |
| `pnpm dev:server`       | Start the API server (Express)                              |
| `pnpm dev:db`           | Start Docker + run migrations                               |
| `pnpm lint`             | Lint code (ESLint + imports + OpenAPI)                      |
| `pnpm typecheck`        | TypeScript type checking                                    |
| `pnpm test`             | Run all tests                                               |
| `pnpm test:coverage`    | Tests with coverage report                                  |
| `pnpm format`           | Format code (Prettier)                                      |
| `pnpm format:check`     | Check formatting without changing files                     |
| `pnpm build`            | Build all apps                                              |
| `pnpm build:web`        | Build web only                                              |
| `pnpm check`            | Full verification: format + lint + typecheck + test + build |
| `pnpm db:up`            | Start Docker with PostgreSQL                                |
| `pnpm db:down`          | Stop Docker                                                 |
| `pnpm db:migrate`       | Run SQL migrations                                          |
| `pnpm gen`              | Generate boilerplate (plop)                                 |
| `pnpm gen:adr`          | Generate a new ADR (Architecture Decision Record)           |
| `pnpm docs:check-links` | Verify documentation links                                  |
| `pnpm bootstrap`        | One-shot dev bootstrap (verify env + install + docker + db) |
| `pnpm bootstrap:check`  | Verify Node/pnpm/Docker prerequisites only                  |

## Testing

```bash
# All tests (via Turborepo)
pnpm test

# Tests for a specific package
pnpm --filter @sergeant/web test
pnpm --filter @sergeant/server test

# Tests with coverage
pnpm test:coverage

# E2E / a11y tests
pnpm test:a11y
```

Test stacks by surface:

- **Web:** Vitest + MSW + React Testing Library
- **Server:** Vitest + Testcontainers (real Postgres)
- **Mobile:** Jest

## Deployment

| Service                  | Deployed to                          | How                                                            |
| ------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| Web (frontend)           | Vercel                               | Auto preview deploy on every PR, production on merge to `main` |
| Server (API)             | Hetzner CX23 + Coolify               | `deploy-api.yml` → `ghcr.io/.../sergeant-api` → Coolify; `Dockerfile.api`, pre-deploy migrate (ADR-0074) |
| Mobile (Expo)            | EAS Build → TestFlight / Google Play | Via Expo Application Services                                  |
| Mobile Shell (Capacitor) | App Store / Google Play              | Via Capacitor build                                            |

## Integrations

| Service              | What it does                         | Required?                         |
| -------------------- | ------------------------------------ | --------------------------------- |
| **Monobank**         | Transactions, balances, webhooks     | No — Finyk works without it       |
| **Anthropic Claude** | AI chat (HubChat)                    | Yes for AI, no for the rest       |
| **Voyage AI**        | Embeddings for AI memory (pgvector)  | No                                |
| **OpenFoodFacts**    | Product search by barcode            | No — falls back to USDA           |
| **USDA FDC**         | Nutrient search by barcode           | No — falls back to DEMO_KEY       |
| **Groq Whisper**     | Voice input → text                   | No — falls back to Web Speech API |
| **PostHog**          | Product analytics                    | No                                |
| **Sentry**           | Error monitoring                     | No                                |
| **Resend**           | Email (verification, password reset) | No                                |
| **Google OAuth**     | "Sign in with Google"                | No                                |
| **n8n**              | Workflow automation (ops)            | No                                |

## Troubleshooting

| Symptom                                  | Cause                                       | Fix                                               |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `pnpm install` fails with lockfile error | Wrong pnpm version                          | `npm i -g pnpm@9.15.1`                            |
| `pnpm dev:db` doesn't work               | Docker not running                          | Start Docker Desktop, then retry                  |
| Port 5432 busy                           | Another Postgres or container               | `docker ps` → stop conflicting container          |
| API returns "401 Unauthorized"           | No session or `BETTER_AUTH_SECRET` mismatch | Restart server after changing `.env`, re-register |
| HubChat says "Unknown action"            | `max_tokens` cut off JSON tool-call         | Don't reduce `max_tokens` without testing         |
| lint-staged fails on commit              | Code didn't pass ESLint / Prettier          | Fix errors, `pnpm lint --fix`                     |
| Streaks reset unexpectedly               | Used UTC instead of Kyiv timezone           | Always calculate "today" via `Europe/Kyiv`        |
| Numbers from API come as strings         | bigint → string (PostgreSQL pg driver)      | `Number(r.id)` in serializer                      |

## Feature flags

Feature flags are managed via `docs/04-governance/governance/feature-flags.md`. Each flag controls the visibility of a specific feature.

## Observability

Monitoring is described in `docs/03-operations/observability/README.md`. Key components: Sentry (errors), PostHog (analytics), Prometheus/Grafana (metrics), Web Vitals (frontend performance).

## Documentation map

| Directory                           | Contents                                                   |
| ----------------------------------- | ---------------------------------------------------------- |
| `docs/04-governance/adr/`           | Architecture Decision Records — why we chose what we chose |
| `docs/02-engineering/api/`          | OpenAPI contracts, API documentation                       |
| `docs/02-engineering/architecture/` | Repository map, platforms, service catalog                 |
| `docs/90-work/audits/`              | UX/UI audits, typography, design reviews                   |
| `docs/03-operations/deploy/`        | Deployment instructions                                    |
| `docs/05-design/design/`            | Design system: brandbook, colors, module accents           |
| `docs/04-governance/governance/`    | Hard rules, review checklist, release policy               |
| `docs/02-engineering/integrations/` | Monobank, Railway, Vercel, Renovate, Voyage                |
| `docs/01-product/launch/`           | Monetization, GTM, launch readiness                        |
| `docs/02-engineering/mobile/`       | Capacitor, deep links, React Native migration              |
| `docs/03-operations/observability/` | SLO, dashboards, metrics, runbook                          |
| `docs/90-work/planning/`            | Roadmaps, AI improvements, dev stack roadmap               |
| `docs/00-start/playbooks/`          | Step-by-step recipes (add an endpoint, do a hotfix)        |
| `docs/03-operations/postmortems/`   | Incident post-mortems                                      |
| `docs/04-governance/security/`      | Access policy, disaster recovery, security audit           |
| `docs/00-start/agents/`             | AI agent system: skill catalog, workflows                  |
| `docs/90-work/tech-debt/`           | Tech debt registries (frontend, backend, mobile)           |

Roadmap: `docs/90-work/planning/README.md`. Tech debt: `docs/90-work/tech-debt/README.md`.

## For Contributors and Agents

- Humans: start with [CONTRIBUTING.md](./CONTRIBUTING.md).
- Agents: start with [AGENTS.md](./AGENTS.md) and [docs/00-start/agents/agent-skills-catalog.md](./docs/00-start/agents/agent-skills-catalog.md).
- Full docs index (genre-grouped — informational / trackers / archive): [docs/README.md](./docs/README.md).
- **What is currently in flight across all 7 trackers** (auto-rollup, CI drift gate): [docs/open-work.md](./docs/open-work.md).
- Repeatable execution recipes: [docs/00-start/playbooks/README.md](./docs/00-start/playbooks/README.md).
- Governance and hard rules matrix: [docs/04-governance/governance/README.md](./docs/04-governance/governance/README.md).
- Runtime inventory, release, incident, and recovery surfaces: [docs/02-engineering/architecture/service-catalog.md](./docs/02-engineering/architecture/service-catalog.md), [docs/04-governance/security/disaster-recovery.md](./docs/04-governance/security/disaster-recovery.md).

## License

MIT — see [LICENSE](./LICENSE).
