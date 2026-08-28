# Repo map — apps, packages, and tooling

> **Last touched:** 2026-08-28 by @Skords-01. **Next review:** 2026-12-08.
> **Status:** Active

> **Machine-readable mirror:** [`docs/04-governance/governance/repo-map.auto.json`](../../04-governance/governance/repo-map.auto.json) (auto-gen via `pnpm docs:gen-repo-map`; CI gate `pnpm docs:check-repo-map` enforces that every workspace listed here is mentioned in this file). The auto-mirror enumerates workspaces + framework deps + owner from CODEOWNERS; editorial Purpose / Stack-narrative / Test-stacks-per-surface stays hand-maintained below.

> Deep tech-stack inventory for Sergeant. Compact summary lives in [`AGENTS.md § Repo overview`](../../../AGENTS.md#repo-overview); this file holds the full per-app + per-package matrix that AGENTS.md used to inline before initiative 0009 PR 3.2. Cross-reference with [`service-catalog.md`](./service-catalog.md) for runtime targets / healthchecks and with [`platforms.md`](./platforms.md) for the web ↔ mobile feature-parity view.

## Toolchain

- **Language:** TypeScript 6.
- **Package manager:** pnpm 9 (`packageManager: "pnpm@9.15.1"`); enforced via `volta`/`engines.pnpm`.
- **Runtime:** Node 22.x (`engines.node: "22.x"`, Volta pins 22.19.0); enforced via `volta.node`/`engines.node`.
- **Monorepo:** Turborepo 2 — pipelines defined in [`turbo.json`](../../../turbo.json). All apps run under `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- **Pre-commit:** Husky 9 (`.husky/pre-commit` runs `lint-staged`; `.husky/commit-msg` runs `commitlint`). Pipeline matrix in [`CONTRIBUTING.md § Pre-commit hooks`](../../../CONTRIBUTING.md#pre-commit-hooks). Hard Rule #7 forbids `--no-verify` skips.

## Apps (`apps/`)

| App                 | Stack                                                                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Vite 8 + React 18 + TanStack Query + Tailwind CSS 4 + design-tokens preset + Vitest/MSW/RTL + Playwright         | Single-page web app (PWA target). Bundle budget enforced via `size-limit` (≤ 1.38 MB JS brotli / ≤ 40 kB CSS) плюс окремий eager-гейт ≤ 280 kB (`scripts/ci/check-eager-bundle.mjs`) — канонічні числа в [`AGENTS.md § Performance budgets`](../../../AGENTS.md#performance-budgets) і `apps/web/package.json`; paths point through `apps/server/dist/assets/*` after unified-mode copy. Lighthouse LCP/FCP/TBT gated separately via `lighthouserc.json`. |
| `apps/server`       | Express + PostgreSQL (`pg`) + Better Auth + Anthropic fetch client + Voyage fetch client + Vitest/Testcontainers | REST API + chat orchestrator + Mono webhook ingestion. Dockerfile: `Dockerfile.api` → `ghcr.io` → Hetzner/Coolify (ADR-0074).                                                                                                                                                                                                                                                                                                                             |
| `apps/mobile`       | Expo 52 + React Native 0.76 + NativeWind + MMKV + Jest                                                           | iOS/Android app via Expo Router. Local-first storage in MMKV.                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/mobile-shell` | Capacitor 7 wrapper                                                                                              | Native shell that re-uses the `apps/web` build artifacts; no app code lives here, only build glue.                                                                                                                                                                                                                                                                                                                                                        |
| `apps/landing`      | Vite 7 + React 18 + Tailwind CSS 4 + Vitest (роутинг ручний через `window.location.pathname`, без react-router)  | Standalone marketing landing with Telegram waitlist conversion ([#444](https://github.com/Skords-01/Sergeant/pull/444), [#487](https://github.com/Skords-01/Sergeant/pull/487)). Separate Vercel build; shares analytics contracts through `@sergeant/shared`.                                                                                                                                                                                            |

## Packages (`packages/`)

| Package                         | Purpose                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sergeant/shared`              | Zod schemas + types + business logic shared across apps. Change with care — used everywhere.                                                                     |
| `@sergeant/api-client`          | HTTP clients + types mirroring `apps/server/src/modules/*` response shapes (Hard Rule #3 keeps them aligned).                                                    |
| `@sergeant/config`              | Cross-app build/runtime config helpers.                                                                                                                          |
| `@sergeant/db-schema`           | Drizzle ORM schemas (Postgres + SQLite) + the migration runner used by `apps/server`. Schema changes pair with a SQL file.                                       |
| `@sergeant/design-tokens`       | Tailwind preset + tokens (colour scale, semantic typography, animation tiers). Канон візуальних конвенцій — самі токени; відповідні Hard Rules retired ADR-0081. |
| `@sergeant/dualwrite-core`      | Platform-neutral dual-write framework core (op-loop, numeric converters) for the 4 module pipelines (ADR-0073).                                                  |
| `@sergeant/insights`            | Cross-module analytics — pure functions over normalized data.                                                                                                    |
| `eslint-plugin-sergeant-design` | Custom ESLint rules referenced by Hard Rules #10 і #21 (решта номерів retired ADR-0081). Tests via `node --test`.                                                |
| `@sergeant/finyk-domain`        | Finyk module domain logic (kcal-style — but for money/budgets/transactions).                                                                                     |
| `@sergeant/fizruk-domain`       | Fizruk module domain logic (workouts, sets, biometrics).                                                                                                         |
| `@sergeant/nutrition-domain`    | Nutrition module domain logic (meals, OFF lookups, kcal math).                                                                                                   |
| `@sergeant/routine-domain`      | Routine module domain logic (habits, streaks, calendar).                                                                                                         |

## Ops & tooling (`ops/`, `tools/`, `scripts/`) та інші теки кореня

- `ops/n8n-workflows/` — n8n workflow JSON manifests (heartbeat, agent-dispatcher). Validated by `pnpm ops:n8n:validate`.
- `tools/tsconfig-guard/` — guards strict-family `tsconfig` flags (Hard Rule #19); allowlist with expiry/owner.
- `tools/agent-snapshot/` — zero-dep динамічний snapshot контексту для агентів (`pnpm snapshot`, ADR-0071) → `.agents/snapshot.md`.
- `scripts/` — governance / docs / API / CI helpers. See [`docs/04-governance/governance/README.md`](../../04-governance/governance/README.md) for the full list.

Теки кореня поза workspace-ами (не білдяться, але трекаються в git):

- `mockups/` — статична HTML-галерея прототипів (вхід `mockups/index.html`); візуальна правда для дизайн-рев'ю, не виробничий код.
- `.telemetry/` — tracking-plan і згенеровані identity-модулі; `tracking-plan.yaml` звіряється тестом `packages/shared/src/lib/analyticsEvents.test.ts`.
- `plop-templates/` — шаблони скафолдингу для `plopfile.mjs` (`pnpm plop`).
- `.tech-debt/` — JSON-бюджети burn-down, читаються `pnpm lint:localstorage-allowlist` і `pnpm lint:env-single-source`.
- `patches/` — `pnpm patch` для upstream-багів; кожен запис описано в [`pnpm-overrides.md`](../../../pnpm-overrides.md), гейт `pnpm lint:patches`.
- `.codex/` — репо-owned harness-шар Codex (`config.toml`, `hooks.json`, `agents/*.toml`); стан — `pnpm codex:status`.
- `.agents/` — harness-нейтральні SKILL.md (`skills/`) і реєстр версій харнеса (`harness-versions.json`); `.claude/` — worktree-конфіг Claude Code.

## Test stacks per surface

- `apps/web` — Vitest + MSW + Testing Library; a11y via `pnpm test:a11y`; Playwright for e2e (`pnpm e2e`).
- `apps/landing` — Vitest (design-token drift) + Playwright dependency for browser checks; lint/typecheck/build run through Turbo.
- `apps/server` — Vitest + Testcontainers (real Postgres). Snapshot tests on response shapes lock Hard Rule #1 / #3.
- `apps/mobile` — Jest.
- `packages/eslint-plugin-sergeant-design` — `node --test` (`__tests__/*.mjs`).
- All other `packages/*` — Vitest.

## Build / deployment outputs

- `apps/web` — Vercel preview deploy on each PR. Bundle output copied into `apps/server/dist/assets/*` for unified-mode serving. `size-limit` paths point through that copy.
- `apps/landing` — standalone Vercel static build from `apps/landing/vercel.json`; public domain is configured outside the repo.
- `apps/server` — Hetzner CX23 + Coolify via `Dockerfile.api` (образ `ghcr.io/.../sergeant-api`, GitHub Actions `deploy-api.yml`). Pre-deploy: `node dist-server/migrate.js` (Coolify `pre_deployment_command`). Health endpoint: `/health`. Migrations require `MIGRATE_DATABASE_URL` (= public DB URL). Rationale: [ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md).
- `apps/mobile` — Expo build (EAS).
- `apps/mobile-shell` — Capacitor build wrapping `apps/web` output.

## Where to look for what

- Per-path test stack + RQ keys factory + owner map → [`module-ownership.md`](./module-ownership.md).
- Domain invariants (time, money, identity) → [`domain-invariants.md`](./domain-invariants.md).
- Diagrams (C4, sequence flows) → [`diagrams/`](./diagrams/README.md).
- Hard rules with full BAD/GOOD examples → [`docs/04-governance/governance/rules/`](../../04-governance/governance/rules).
- Service catalog (runtime targets, healthchecks) → [`service-catalog.md`](./service-catalog.md).
