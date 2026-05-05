# Sergeant

[![CI](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml/badge.svg)](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml)
![Node 20](https://img.shields.io/badge/node-20.x-brightgreen)
![pnpm 9](https://img.shields.io/badge/pnpm-9.15.1-orange)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Last validated:** 2026-05-05 by @Skords-01 / Devin. **Next review:** 2026-08-03.
> **Status:** Active

> **Гроші, тіло, звички, їжа — в одному додатку. Local-first. Приватно.**
> Sergeant — це особистий hub для дисциплінованої щоденки: один додаток замість п'яти, з AI-коучем, що бачить весь твій день.

<!-- Hero asset slot: replace this comment with `<img src="docs/assets/sergeant-hero.png" alt="Sergeant dashboard preview" width="1280" />` after PR-02b lands the asset (see docs/assets/README.md). -->

<p align="center"><em>(Hero screenshot pending — see <a href="./docs/assets/README.md">docs/assets/</a> capture instructions; PR-02b adds the actual file.)</em></p>

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
  _(Public production URL ще не лінкується — додасться, коли launch-readiness допиляється; див. [`docs/launch/04-launch-readiness.md`](./docs/launch/04-launch-readiness.md))._
- **Огляд продукту:** [`docs/launch/01-monetization-and-pricing.md`](./docs/launch/01-monetization-and-pricing.md) — бізнес-модель + позиціонування.
- **Поточний стан FTUX:** [`docs/launch/ftux-master-tracker.md`](./docs/launch/ftux-master-tracker.md) — sprint registry + відкриті проблеми.

> Хочеш контриб'ютити, а не просто юзати? → [§ For Contributors and Agents](#for-contributors-and-agents) у кінці.

## Tech Stack

- **Language:** TypeScript 6
- **Frontend (web):** React 18, Vite, Tailwind CSS, React Query (TanStack Query)
- **Mobile:** Expo 52, React Native 0.76, NativeWind
- **Mobile shell:** Capacitor (web wrapper for native distribution)
- **Backend:** Express.js, PostgreSQL 16, Better Auth (authentication)
- **AI:** Anthropic Claude API, Voyage AI (embeddings)
- **Monorepo:** Turborepo, pnpm 9.15.1
- **Testing:** Vitest, Testing Library, MSW (API mocking), Testcontainers (real Postgres in tests), Playwright (E2E)
- **Linting:** ESLint 9, Prettier, commitlint, Husky (pre-commit hooks)
- **CI/CD:** GitHub Actions
- **Deploy:** Vercel (frontend), Railway (backend + PostgreSQL)
- **Monitoring:** Sentry (errors), PostHog (analytics), Grafana (metrics), Web Vitals
- **Telegram bot:** grammy + Anthropic (internal ops)

## What is in the repo

### Apps (`apps/`)

| Directory           | What it is               | Stack                   | Deployed to             |
| ------------------- | ------------------------ | ----------------------- | ----------------------- |
| `apps/web`          | Web app (primary UI)     | React + Vite + Tailwind | Vercel                  |
| `apps/server`       | API server (backend)     | Express + PostgreSQL    | Railway                 |
| `apps/mobile`       | Mobile app (native)      | Expo + React Native     | App Store / Google Play |
| `apps/mobile-shell` | Mobile app (web wrapper) | Capacitor               | App Store / Google Play |
| `tools/console`     | Telegram bot (internal)  | grammy + Anthropic      | Railway                 |

### Packages (`packages/`)

Packages are shared code reused across apps. Instead of copy-pasting between web and mobile, we put shared code in `packages/` and import from there.

| Package                         | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `@sergeant/shared`              | Shared business logic, Zod schemas, types — used by ALL apps |
| `@sergeant/api-client`          | Type-safe HTTP client for talking to the server              |
| `@sergeant/config`              | Shared configs (ESLint, TypeScript, etc.)                    |
| `@sergeant/design-tokens`       | Design tokens, Tailwind preset, colors, typography           |
| `@sergeant/insights`            | Cross-module analytics (pure functions over data)            |
| `@sergeant/finyk-domain`        | Finance domain logic (calculations, amount formatting)       |
| `@sergeant/fizruk-domain`       | Fitness domain logic (calories, load calculations)           |
| `@sergeant/nutrition-domain`    | Nutrition domain logic                                       |
| `@sergeant/routine-domain`      | Habits domain logic                                          |
| `@sergeant/db-schema`           | Database schema                                              |
| `eslint-plugin-sergeant-design` | Custom ESLint rules for the design system                    |

Architecture overview lives in [docs/architecture/README.md](./docs/architecture/README.md); the full doc index lives in [docs/README.md](./docs/README.md).

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
        │   PostgreSQL          │     │  tools/console   │
        │ (Railway / Docker)    │     │  (Telegram bot)  │
        └───────────────────────┘     └─────────────────┘
```

Fizruk and Routine modules follow a **local-first** approach: data is stored locally first (localStorage on web, MMKV on mobile), then synced to the server via CloudSync using LWW (Last-Write-Wins) conflict resolution. The app works offline.

## Prerequisites

- **Node.js 20.x** (recommended via [Volta](https://volta.sh/))
- **pnpm 9.15.1** (`npm install -g pnpm@9.15.1`)
- **Docker** (for local PostgreSQL)

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/Skords-01/Sergeant.git
cd Sergeant
pnpm install --frozen-lockfile
```

`--frozen-lockfile` installs the exact versions recorded in the lockfile without modifying it.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in your editor. Most values are pre-filled for local development. Key variables:

| Variable                                    | Required? | What it does                                                                                                                                                                    |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Yes       | Database URL (Docker default: `postgresql://hub:hub@localhost:5432/hub`)                                                                                                        |
| `BETTER_AUTH_SECRET`                        | Yes       | Session cookie signing secret (min 32 characters)                                                                                                                               |
| `ANTHROPIC_API_KEY`                         | For AI    | Claude API key — HubChat won't work without it                                                                                                                                  |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | No        | Google OAuth — without these the "Sign in with Google" button won't appear                                                                                                      |
| `VITE_API_PROXY_TARGET`                     | No        | Dev proxy target (default `http://127.0.0.1:3000`)                                                                                                                              |
| Others                                      | No        | See [`docs/integrations/env-vars.md`](./docs/integrations/env-vars.md) — full reference for all 100+ optional variables (Sentry, PostHog, Voyage, Mono, OpenClaw, AI quotas, …) |

### 3. Start the database

```bash
pnpm dev:db
```

This runs `docker compose up -d` + `pnpm db:migrate` — starts PostgreSQL 16 in a Docker container and runs all SQL migrations.

To stop the database: `pnpm db:down` (or `docker compose down`).

### 4. Start the server and web app

```bash
# In one terminal:
pnpm dev:server

# In another terminal:
pnpm dev:web
```

Local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

### 5. (Optional) Mobile app

```bash
# Expo (React Native)
pnpm --filter @sergeant/mobile start

# Capacitor (web wrapper → native)
# First build web, then open in Xcode / Android Studio
```

### 6. (Optional) Telegram bot

```bash
pnpm --filter @sergeant/console dev
```

Requires a Telegram Bot Token in `tools/console/.env`.

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
| Server (API)             | Railway                              | Dockerfile.api, pre-deploy migrations                          |
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

Feature flags are managed via `docs/feature-flags.md`. Each flag controls the visibility of a specific feature.

## Observability

Monitoring is described in `docs/observability/README.md`. Key components: Sentry (errors), PostHog (analytics), Prometheus/Grafana (metrics), Web Vitals (frontend performance).

## Documentation map

| Directory             | Contents                                                   |
| --------------------- | ---------------------------------------------------------- |
| `docs/adr/`           | Architecture Decision Records — why we chose what we chose |
| `docs/api/`           | OpenAPI contracts, API documentation                       |
| `docs/architecture/`  | Repository map, platforms, service catalog                 |
| `docs/audits/`        | UX/UI audits, typography, design reviews                   |
| `docs/deploy/`        | Deployment instructions                                    |
| `docs/design/`        | Design system: brandbook, colors, module accents           |
| `docs/governance/`    | Hard rules, review checklist, release policy               |
| `docs/integrations/`  | Monobank, Railway, Vercel, Renovate, Voyage                |
| `docs/launch/`        | Monetization, GTM, launch readiness                        |
| `docs/mobile/`        | Capacitor, deep links, React Native migration              |
| `docs/observability/` | SLO, dashboards, metrics, runbook                          |
| `docs/planning/`      | Roadmaps, AI improvements, dev stack roadmap               |
| `docs/playbooks/`     | Step-by-step recipes (add an endpoint, do a hotfix)        |
| `docs/postmortems/`   | Incident post-mortems                                      |
| `docs/security/`      | Access policy, disaster recovery, security audit           |
| `docs/agents/`        | AI agent system: skill catalog, workflows                  |
| `docs/tech-debt/`     | Tech debt registries (frontend, backend, mobile)           |

Roadmap: `docs/planning/README.md`. Tech debt: `docs/tech-debt/README.md`.

## For Contributors and Agents

- Humans: start with [CONTRIBUTING.md](./CONTRIBUTING.md).
- Agents: start with [AGENTS.md](./AGENTS.md) and [docs/agents/agent-skills-catalog.md](./docs/agents/agent-skills-catalog.md).
- Repeatable execution recipes: [docs/playbooks/README.md](./docs/playbooks/README.md).
- Governance and hard rules matrix: [docs/governance/README.md](./docs/governance/README.md).
- Runtime inventory, release, incident, and recovery surfaces: [docs/architecture/service-catalog.md](./docs/architecture/service-catalog.md), [docs/security/disaster-recovery.md](./docs/security/disaster-recovery.md).

## License

MIT — see [LICENSE](./LICENSE).
