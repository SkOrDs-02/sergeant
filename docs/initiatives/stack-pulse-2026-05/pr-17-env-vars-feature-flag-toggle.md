# PR-17: 80+ env-vars → DB feature-flag toggle

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Severity**       | Medium (M1)                                                                             |
| **Linked finding** | M1 (`00-overview.md`)                                                                   |
| **Owner**          | TBD (sponsor: @Skords-01)                                                               |
| **Effort**         | 3–5 днів                                                                                |
| **Risk**           | Medium (runtime config переноситься з env у БД — нова startup залежність)               |
| **Touches**        | `apps/server/src/env/env.ts`, `apps/server/src/migrations/`, нова `feature_flags` table |
| **Trigger**        | при додаванні 90-ї змінної у `apps/server/src/env/env.ts`                               |

## Контекст

`apps/server/src/env/env.ts` — 811 рядків, **47 окремих Zod-полів** у єдиній схемі (`rg -c "z\.string\(\)|z\.number|z\.boolean|z\.enum"`). Це уніфіковано (PR-01 [#2122](https://github.com/Skords-01/Sergeant/pull/2122)), але кожен новий feature-flag вимагає:

1. PR у `env/env.ts` + новий refine
2. Railway env-var update (manual)
3. Server restart для зміни
4. Жодного per-cohort / per-tenant toggling

При додаванні 90-ї змінної (поточно ~80 у env-проді + 47 у Zod-схемі) ціна кожної конфігурації зростає лінійно: PR-time, restart-time, потенціал для silent typo-misconfiguration.

## Scope

### 1. Класифікація

Розділити змінні на дві групи у `env/env.ts`:

- **Bootstrap-only** (потрібні до connect-у до БД): `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`, `PORT`, `LOG_LEVEL`, `SENTRY_DSN`, `OPENCLAW_*` — лишаються env-vars.
- **Feature-toggle** (можна змінити runtime): `AI_QUOTA_*`, `AI_QUOTA_CIRCUIT_THRESHOLD`, `MONOBANK_WEBHOOK_*`, `RATE_LIMIT_*` thresholds, etc. — мігрують у DB.

### 2. `feature_flags` table

```sql
-- apps/server/src/migrations/045_feature_flags.sql
CREATE TABLE feature_flags (
  key            TEXT PRIMARY KEY,
  value          JSONB NOT NULL,
  default_value  JSONB NOT NULL,
  scope          TEXT NOT NULL DEFAULT 'global',  -- 'global' | 'tenant:<id>' | 'cohort:<name>'
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scope_format CHECK (scope ~ '^(global|tenant:[a-z0-9_-]+|cohort:[a-z0-9_-]+)$')
);

CREATE INDEX feature_flags_scope_idx ON feature_flags (scope);
```

Two-phase migration (rule #4): seed таблицю з поточних env-значень, потім окремо PR з drop-у env-полів.

### 3. Runtime API

`packages/feature-flags` workspace:

```ts
export interface FlagStore {
  get<T>(key: string, fallback: T, scope?: string): Promise<T>;
  set<T>(
    key: string,
    value: T,
    scope?: string,
    updatedBy?: string,
  ): Promise<void>;
}
```

In-memory cache з 60-сек TTL + invalidation broadcast через `pg_notify('feature_flag_changed', ...)`.

### 4. Bootstrap-fallback

Якщо БД недоступна на startup, `FlagStore.get()` повертає `default_value` з env-snapshot (built into image). Server **не** падає.

### 5. Admin UI

`tools/console` (Telegram bot) — нова команда `/flag <key> <value>` з audit-log у `feature_flags.updated_by = 'tg:@<user>'`.

## Out of scope

- Cohort-evaluation logic (LaunchDarkly-style targeting rules) — окремий ADR при першій real cohort-targeted фічі.
- Feature-flag UX в самому web-app — окремий PR після backend.

## Acceptance criteria (DoD)

- [ ] Migration `045_feature_flags.sql` (CREATE TABLE) merged.
- [ ] `packages/feature-flags` workspace з `PgFlagStore` + `InMemoryFlagStore` (для тестів) + `EnvFallbackFlagStore`.
- [ ] `apps/server/src/env/env.ts` має explicit `FEATURE_FLAGS_BACKEND` enum (`db` | `env`); default `env` на 0% rollout, потім flip → `db`.
- [ ] `pg_notify` listener в `apps/server/src/index.ts` invalidates cache на `feature_flag_changed`.
- [ ] ADR-0054 «Feature-flag storage migration» з rationale + rollback plan.
- [ ] `tools/console` /flag команда з role-check `ops`.
- [ ] Documented у `docs/architecture/feature-flags.md`.

## Тести

- `packages/feature-flags/src/__tests__/pgFlagStore.integration.test.ts` (Testcontainers Postgres).
- `apps/server/src/__tests__/feature-flag-bootstrap-fallback.test.ts` — БД недоступна → fallback на default.
- `apps/server/src/__tests__/feature-flag-cache-invalidation.test.ts` — pg_notify invalidates.

## Rollout

1. PR-1: migration + workspace + `EnvFallbackFlagStore` (no behavior change).
2. PR-2: seed feature-toggle keys у DB; flip `FEATURE_FLAGS_BACKEND=db`.
3. PR-3 (after 7d soak): drop env-vars з `env/env.ts` (two-phase per Rule #4).

## Risks & mitigations

| Risk                                                       | Mitigation                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| DB недоступна на startup → server не може прочитати flags  | `EnvFallbackFlagStore` з env-snapshot built into image як default-on-bootstrap      |
| Stale cache → silent feature-flag mismatch між instances   | `pg_notify` broadcast + 60s TTL + `/flag get` пов'язаний з версією від `updated_at` |
| Audit-log gap (хто змінив flag)                            | `updated_by` обов'язкове поле; FlagStore.set() кидає, якщо updatedBy відсутній      |
| Two-phase drop пропустить env-removal → silent dual-source | freshness-gate: ESLint правило `no-flag-from-env` на полі, що позначене `db_only`   |

## Touchpoints (file:line)

- `apps/server/src/env/env.ts:1-811` — bootstrap-only vs feature-toggle classification
- `apps/server/src/migrations/` — new `045_feature_flags.sql`
- `apps/server/src/index.ts` — pg_notify listener wiring
- `packages/feature-flags/` — new workspace
- `tools/console/src/agents/ops/` — /flag command
- `docs/architecture/feature-flags.md` — new
- `docs/adr/0054-feature-flag-storage-migration.md` — new

## Refs

- [LaunchDarkly «Build vs buy» rationale](https://launchdarkly.com/blog/build-vs-buy/)
- [Postgres LISTEN/NOTIFY for cache invalidation](https://www.postgresql.org/docs/current/sql-notify.html)
