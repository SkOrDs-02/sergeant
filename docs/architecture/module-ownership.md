# Module ownership map

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> Per-path ownership, test stack, RQ keys factory, and conventions. Quick look-up before editing. Compact summary table lives in [`AGENTS.md § Module ownership map`](../../AGENTS.md#module-ownership-map); deep per-path table is here so Stack-pulse PR-04 secondary-column gate (`pnpm lint:codeowners`) and the per-module CODEOWNERS coverage stay close to one another.

¹ **Secondary** is the bus-factor backup reviewer. Real GitHub handles like `@alice` are preferred, but during the rollout we use placeholders such as `TBD (frontend-engineer)`. Empty cells are rejected by `pnpm lint:codeowners` (PR-04 contract).

## Apps

| Path                                   | Owner        | Secondary ¹             | Test stack                              | RQ keys factory                       | Notes                                                                                                                                                           |
| -------------------------------------- | ------------ | ----------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/modules/finyk/**`        | `@Skords-01` | TBD (frontend-engineer) | Vitest + MSW + RTL                      | `finykKeys`                           | Tailwind, localStorage. Mono webhooks → `monoWebhook*` keys.                                                                                                    |
| `apps/web/src/modules/fizruk/**`       | `@Skords-01` | TBD (frontend-engineer) | Vitest + MSW + RTL                      | (none yet — local-first via MMKV-web) | Workouts/sets are local-first. Cloud sync via `cloudsync` queue.                                                                                                |
| `apps/web/src/modules/nutrition/**`    | `@Skords-01` | TBD (frontend-engineer) | Vitest + MSW + RTL                      | `nutritionKeys`                       | OFF = OpenFoodFacts; barcode scans share cache key with meal-sheet.                                                                                             |
| `apps/web/src/modules/routine/**`      | `@Skords-01` | TBD (frontend-engineer) | Vitest + RTL                            | (local-first)                         | Habits + streaks; rely on Kyiv-day boundary (see [Domain invariants](./domain-invariants.md)).                                                                  |
| `apps/web/src/core/**`                 | `@Skords-01` | TBD (frontend-engineer) | Vitest + RTL + (MSW for fetch)          | `hubKeys`, `coachKeys`, `digestKeys`  | HubChat, OnboardingWizard, dashboard. Quick actions registry lives here.                                                                                        |
| `apps/web/src/core/lib/chatActions/**` | `@Skords-01` | TBD (frontend-engineer) | Vitest + RTL                            | n/a                                   | HubChat tool handlers. Повертають `string` для `tool_result`. Пишуть у localStorage тільки через `ls`/`lsSet`. Тест: happy path + error path кожного handler-а. |
| `apps/web/src/shared/**`               | `@Skords-01` | TBD (frontend-engineer) | Vitest                                  | factories defined here                | Pure utils. No React.                                                                                                                                           |
| `apps/server/src/modules/**`           | `@Skords-01` | TBD (backend-engineer)  | Vitest + Testcontainers (real Postgres) | n/a                                   | Always coerce bigint→number in serializers ([Rule #1](../governance/rules/01-db-types-coerce-bigint-to-number.md)). Update `api-client` types.                  |
| `apps/server/src/modules/chat/**`      | `@Skords-01` | TBD (backend-engineer)  | Vitest                                  | n/a                                   | Anthropic tool defs split per domain in `toolDefs/`. See [`module-structure.md`](./module-structure.md).                                                        |
| `apps/server/src/migrations/**`        | `@Skords-01` | TBD (data-engineer)     | n/a                                     | n/a                                   | Sequential `NNN_*.sql` (currently 001–049). No gaps. Two-phase for DROP — see [Rule #4](../governance/rules/04-sql-migrations-sequential-two-phase.md).         |
| `apps/mobile/src/core/**`              | `@Skords-01` | TBD (mobile-engineer)   | Jest                                    | (mobile RQ uses module-local keys)    | NativeWind (not Tailwind). MMKV (not localStorage). No DOM.                                                                                                     |
| `apps/mobile/app/**`                   | `@Skords-01` | TBD (mobile-engineer)   | Jest                                    | n/a                                   | Expo Router routes. Each `_layout.tsx` is a navigator.                                                                                                          |
| `apps/mobile-shell/**`                 | `@Skords-01` | TBD (mobile-engineer)   | none                                    | n/a                                   | Capacitor wrapper around `apps/web`. No app code lives here, only build glue.                                                                                   |
| `tools/openclaw/**`                    | `@Skords-01` | TBD (backend-engineer)  | Vitest                                  | n/a                                   | Telegram bot (grammy + Anthropic). Multi-agent: ops + marketing. Internal only.                                                                                 |

## Packages

| Path                                                  | Owner        | Secondary ¹            | Test stack | RQ keys factory | Notes                                                                                                                                                                  |
| ----------------------------------------------------- | ------------ | ---------------------- | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/**`                                  | `@Skords-01` | TBD (any-engineer)     | Vitest     | n/a             | Zod schemas, types, business logic. Used by all apps — change with care.                                                                                               |
| `packages/api-client/**`                              | `@Skords-01` | TBD (backend-engineer) | Vitest     | n/a             | HTTP clients + types. Must mirror `apps/server/src/modules/*` response shapes.                                                                                         |
| `packages/insights/**`                                | `@Skords-01` | TBD (any-engineer)     | Vitest     | n/a             | Cross-module analytics. Pure functions over normalized data.                                                                                                           |
| `packages/{finyk,fizruk,nutrition,routine}-domain/**` | `@Skords-01` | TBD (any-engineer)     | Vitest     | n/a             | Domain logic shared web ↔ mobile (e.g., kcal math, budget computations).                                                                                               |
| `packages/db-schema/**`                               | `@Skords-01` | TBD (data-engineer)    | Vitest     | n/a             | Drizzle ORM schemas (Postgres + SQLite) and the migration runner used by `apps/server`. Schema changes pair with a new SQL migration in `apps/server/src/migrations/`. |

## Ops surfaces

| Path                      | Owner        | Secondary ¹        | Notes                                                                                             |
| ------------------------- | ------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| `ops/n8n-workflows/**`    | `@Skords-01` | TBD (any-engineer) | n8n workflow JSON manifests (heartbeat, agent-dispatcher). Validate via `pnpm ops:n8n:validate`.  |
| `tools/tsconfig-guard/**` | `@Skords-01` | TBD (any-engineer) | Strict-family flag guard (Hard Rule #19). Allowlist with expiry/owner; gates `pnpm lint`.         |
| `scripts/**`              | `@Skords-01` | TBD (any-engineer) | Governance / docs / API / CI helpers. See [`docs/governance/README.md`](../governance/README.md). |

## See also

- [`repo-map.md`](./repo-map.md) — per-app stack matrix + per-package purpose.
- [`module-structure.md`](./module-structure.md) — canonical layout of `apps/{web,mobile}/src/modules/<domain>/` + per-module deviations.
- [`docs/governance/rules/`](../governance/rules/) — per-rule canonical bodies referenced by the table notes.
- [`.github/CODEOWNERS`](../../.github/CODEOWNERS) — branch-protection-enforced reviewer assignment per path; coverage gate is `pnpm lint:codeowners`.
