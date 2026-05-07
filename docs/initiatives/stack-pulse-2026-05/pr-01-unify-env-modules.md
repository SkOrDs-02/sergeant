# PR-01: Уніфікувати env-модулі сервера

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Closed — merged ([#2122](https://github.com/Skords-01/Sergeant/pull/2122)). `apps/server/src/env.ts` зведено до 19-рядкового re-export shim над `apps/server/src/env/env.ts` (єдиний Zod-schema джерело правди + `assertStartupEnv()`); CI-guard `scripts/check-env-single-source.mjs` блокує `process.env`-доступ поза дозволеним списком. `env/betterAuthEnv.ts` лишено навмисно — викликається з auth lifecycle до повного startup.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Severity** | Critical (C1)                                                 |
| **Owner**    | TBD                                                           |
| **Effort**   | 1–2 дні                                                       |
| **Risk**     | Medium (зачіпає startup-validation усіх deploy-target-ів)     |
| **Touches**  | `apps/server/src/env.ts`, `apps/server/src/env/`, scripts, CI |

## Контекст

У `apps/server/src/` живуть **три** конкуруючі модулі для конфігурації:

1. `env.ts` (~432 рядки) — custom `parseIntEnv` / `parseBoolEnv`, без schema-валідації, ~80+ змінних включно з AI-memory, OpenClaw, retention.
2. `env/env.ts` (~301 рядок) — Zod-schema `envSchema`, `assertStartupEnv()`, частина тих самих змінних (`DATABASE_URL`, `BETTER_AUTH_TOKEN_ENC_KEY`, `MONO_TOKEN_ENC_KEY`).
3. `env/betterAuthEnv.ts` (~81 рядок) — `assertBetterAuthStartupEnv()` з weak-secret list і startup-warnings.

Дрейф уже стартував:

- `MIN_PASSWORD_LENGTH` / `MAX_PASSWORD_LENGTH` визначені у обох (з однаковими дефолтами — поки що).
- `SHUTDOWN_GRACE_MS` / `SHUTDOWN_HARD_TIMEOUT_MS` — у обох.
- `BETTER_AUTH_TOKEN_ENC_KEY` валідується (regex `[0-9a-f]{64}`) тільки у `env/env.ts`.
- `BETTER_AUTH_SECRET` валідується (length ≥ 32, weak-list) тільки у `betterAuthEnv.ts`.
- `NUTRITION_BACKUP_KEY_SECRET` — тільки в `env/env.ts`.

Прогноз: завтра хтось додасть змінну тільки у `env.ts` (бо там 80% ADR-логіки), потім виявить що production не валідує її. У dev це працює, у prod падає на 3-й годині після релізу.

## Scope

- Об'єднати в один `apps/server/src/env/index.ts` з повною Zod-схемою (з усіма AI-memory / OpenClaw полями з `env.ts`).
- Видалити custom `parseIntEnv` / `parseBoolEnv` — використати `z.coerce.number().default()` + `z.coerce.boolean().default()`.
- `betterAuthEnv.ts` `assertBetterAuthStartupEnv` → перенести у `envSchema.refine()` або окремий `betterAuthSchema` що `extend`-ить базовий.
- Single source of truth: усі імпорти `import { env } from "@/env"` (alias).
- CI-guard `scripts/check-env-single-source.mjs`, який падає, якщо у `apps/server/src/` з'являється другий `env*.ts` файл з `process.env.`-доступом.

## Out of scope

- Міграція env-vars у feature-flag-toggle DB-таблицю (це M1, окремий PR).
- Зміна публічних env-vars у `.env.example` — лишити документацію формату.
- Міграція мобільних `EXPO_PUBLIC_*` — окремий scope.

## Acceptance criteria (DoD)

- [ ] Один файл `apps/server/src/env/index.ts` з Zod-schema, експортує `env: EnvSchema` і `assertStartupEnv()`.
- [ ] `apps/server/src/env.ts` видалений; всі імпорти `from "../env"` / `from "./env"` оновлені.
- [ ] `apps/server/src/env/betterAuthEnv.ts` видалений; логіка перенесена у головну схему через `.refine()`.
- [ ] `pnpm typecheck` проходить.
- [ ] `pnpm test` проходить (включно з `apps/server/src/env/__tests__/env.test.ts`).
- [ ] `scripts/check-env-single-source.mjs` доданий і викликається у `ci.yml` `lint`-job.
- [ ] Документ-маркер: `Last validated` оновлений у `00-overview.md` після merge.

## Тести

- **Unit:** `apps/server/src/env/__tests__/env.test.ts` — happy-path + кожен `.refine()`-fail з фіксованим error-message.
- **Production-startup:** `apps/server/src/env/__tests__/production-startup.test.ts` — `NODE_ENV=production` + слабкий `BETTER_AUTH_SECRET` → throws.
- **Snapshot:** `pnpm dev:server` з пустим `.env` має падати з зрозумілою помилкою (manual smoke).

## Rollout

- Single PR, immediate. Перед merge:
  1. На staging deploy перевірити, що сервер стартує з реальним env-set.
  2. На production — pre-deploy `pnpm typecheck` як запобіжник.
- Rollback: `git revert` (без irreversible operations).

## Risks & mitigations

| Risk                                                            | Mitigation                                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Пропустимо змінну → production startup-fail                     | CI typecheck + grep `process.env.` поза env-файлом → fail                                |
| Zod 4 breaking-changes у `.refine()` API                        | Pin до тестованої версії, додати unit-тести на refine-pathways                           |
| Better Auth перевірки потрібні раніше у lifecycle ніж envSchema | Залишити окремий `assertAuthEnv()` що **викликає** envSchema і потім додаткові перевірки |

## Touchpoints (file:line)

- `apps/server/src/env.ts:20–429` — джерело об'єднання
- `apps/server/src/env/env.ts:21–190` — джерело об'єднання
- `apps/server/src/env/betterAuthEnv.ts:34–80` — джерело об'єднання
- `apps/server/src/index.ts` — startup `assertStartupEnv()` callsite
- `apps/server/src/auth.ts:1–319` — споживачі Better Auth env-vars
- `.github/workflows/ci.yml` — додати `scripts/check-env-single-source.mjs`
