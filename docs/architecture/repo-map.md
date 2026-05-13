# Repo map — apps, packages, and tooling

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> Deep tech-stack inventory for Sergeant. Compact summary lives in [`AGENTS.md § Repo overview`](../../AGENTS.md#repo-overview); this file holds the full per-app + per-package matrix that AGENTS.md used to inline before initiative 0009 PR 3.2. Cross-reference with [`service-catalog.md`](./service-catalog.md) for runtime targets / healthchecks and with [`platforms.md`](./platforms.md) for the web ↔ mobile feature-parity view.

## Toolchain

- **Language:** TypeScript 6.
- **Package manager:** pnpm 9 (`packageManager: "pnpm@9.15.1"`); enforced via `volta`/`engines.pnpm`.
- **Runtime:** Node 20 (`engines.node: "20.x"`); enforced via `volta.node`/`engines.node`.
- **Monorepo:** Turborepo 2 — pipelines defined in [`turbo.json`](../../turbo.json). All apps run under `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- **Pre-commit:** Husky 9 (`.husky/pre-commit` runs `lint-staged`; `.husky/commit-msg` runs `commitlint`). Pipeline matrix in [`CONTRIBUTING.md § Pre-commit hooks`](../../CONTRIBUTING.md#pre-commit-hooks). Hard Rule #7 forbids `--no-verify` skips.

## Apps (`apps/`)

| App                 | Stack                                                                                                            | Purpose                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/web`          | Vite 8 + React 18 + TanStack Query + Tailwind CSS 4 + design-tokens preset + Vitest/MSW/RTL + Playwright         | Single-page web app (PWA target). Bundle budget enforced via `size-limit` (≤ 820 kB JS / ≤ 28 kB CSS). |
| `apps/server`       | Express + PostgreSQL (`pg`) + Better Auth + Anthropic fetch client + Voyage fetch client + Vitest/Testcontainers | REST API + chat orchestrator + Mono webhook ingestion. Dockerfile: `Dockerfile.api` → Railway.         |
| `apps/mobile`       | Expo 52 + React Native 0.76 + NativeWind + MMKV + Jest                                                           | iOS/Android app via Expo Router. Local-first storage in MMKV.                                          |
| `apps/mobile-shell` | Capacitor 7 wrapper                                                                                              | Native shell that re-uses the `apps/web` build artifacts; no app code lives here, only build glue.     |
| `tools/console`     | grammy + Anthropic SDK + Vitest                                                                                  | Internal Telegram bot (ops + marketing dispatcher). Multi-agent. Internal only — never user-facing.    |

## Packages (`packages/`)

| Package                         | Purpose                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@sergeant/shared`              | Zod schemas + types + business logic shared across apps. Change with care — used everywhere.                               |
| `@sergeant/api-client`          | HTTP clients + types mirroring `apps/server/src/modules/*` response shapes (Hard Rule #3 keeps them aligned).              |
| `@sergeant/config`              | Cross-app build/runtime config helpers.                                                                                    |
| `@sergeant/db-schema`           | Drizzle ORM schemas (Postgres + SQLite) + the migration runner used by `apps/server`. Schema changes pair with a SQL file. |
| `@sergeant/design-tokens`       | Tailwind preset + tokens (colour scale, semantic typography, animation tiers). Backs Hard Rules #8/#11/#13/#14/#16/#17.    |
| `@sergeant/insights`            | Cross-module analytics — pure functions over normalized data.                                                              |
| `eslint-plugin-sergeant-design` | Custom ESLint rules referenced by Hard Rules #8/#9/#10/#11/#12/#13/#14/#21. Tests via `node --test`.                       |
| `@sergeant/finyk-domain`        | Finyk module domain logic (kcal-style — but for money/budgets/transactions).                                               |
| `@sergeant/fizruk-domain`       | Fizruk module domain logic (workouts, sets, biometrics).                                                                   |
| `@sergeant/nutrition-domain`    | Nutrition module domain logic (meals, OFF lookups, kcal math).                                                             |
| `@sergeant/routine-domain`      | Routine module domain logic (habits, streaks, calendar).                                                                   |
| `@sergeant/openclaw-plugin`     | OpenClaw Gateway plugin that registers Sergeant tools/hooks and proxies to `apps/server /api/internal/openclaw/*`.         |

## Ops & tooling (`ops/`, `tools/`, `scripts/`)

- `ops/n8n-workflows/` — n8n workflow JSON manifests (heartbeat, agent-dispatcher). Validated by `pnpm ops:n8n:validate`.
- `tools/console/` — Telegram bot (above). Sidecar `tsconfig.json` extends `tsconfig.node.json`.
- `tools/tsconfig-guard/` — guards strict-family `tsconfig` flags (Hard Rule #19); allowlist with expiry/owner.
- `scripts/` — governance / docs / API / CI helpers. See [`docs/governance/README.md`](../governance/README.md) for the full list.

## Test stacks per surface

- `apps/web` — Vitest + MSW + Testing Library; a11y via `pnpm test:a11y`; Playwright for e2e (`pnpm e2e`).
- `apps/server` — Vitest + Testcontainers (real Postgres). Snapshot tests on response shapes lock Hard Rule #1 / #3.
- `apps/mobile` — Jest.
- `tools/console` — Vitest. Includes the dispatcher contract test against `ops/n8n-workflows/20-agent-dispatcher.json`.
- `packages/eslint-plugin-sergeant-design` — `node --test` (`__tests__/*.mjs`).
- All other `packages/*` — Vitest.

## Build / deployment outputs

- `apps/web` — Vercel preview deploy on each PR. Bundle output copied into `apps/server/dist/assets/*` for unified-mode serving (Replit/Railway). `size-limit` paths point through that copy.
- `apps/server` — Railway via `Dockerfile.api`. Pre-deploy: `pnpm db:migrate`. Health endpoint: `/health`. Migrations require `MIGRATE_DATABASE_URL` (= public DB URL).
- `apps/mobile` — Expo build (EAS).
- `apps/mobile-shell` — Capacitor build wrapping `apps/web` output.

## Where to look for what

- Per-path test stack + RQ keys factory + owner map → [`module-ownership.md`](./module-ownership.md).
- Domain invariants (time, money, identity) → [`domain-invariants.md`](./domain-invariants.md).
- Diagrams (C4, sequence flows) → [`diagrams/`](./diagrams/README.md).
- Hard rules with full BAD/GOOD examples → [`docs/governance/rules/`](../governance/rules/).
- Service catalog (runtime targets, healthchecks) → [`service-catalog.md`](./service-catalog.md).
