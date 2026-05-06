# PR-13: PG pool sizing + monitoring + alerts

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Closed — implementation merged. Observability стек уже мав
> Prometheus pool-gauges (`db_pool_*`) і алерти (`DbPoolWaitingSustained` +
> `DbPoolSaturated`) до старту PR-13; цей PR довіз: бамп `PG_POOL_SIZE`
> default 10 → 20, slow-connect Pino warn + Sentry breadcrumb +
> `db_slow_pool_connects_total` counter, новий
> [`docs/observability/pg-pool-sizing.md`](../../observability/pg-pool-sizing.md).

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Severity** | High (H7)                                                                  |
| **Owner**    | `@Skords-01` (secondary TBD)                                               |
| **Effort**   | 1 день                                                                     |
| **Risk**     | Medium (зміна connection-load на DB може exposed-нути latent index-issues) |
| **Touches**  | `apps/server/src/env*`, `apps/server/src/db.ts`, observability             |

## Контекст

```ts
// apps/server/src/env.ts:56
PG_POOL_SIZE: parseIntEnv("PG_POOL_SIZE", 10);
```

10 connections — це **дуже** консервативно для:

- BullMQ workers (auth-mail + AI memory ingestion + push) — кожен worker тримає connection під час job-у.
- Express request-handlers — кожен active request бере connection.
- Background tasks (cron-у нема, але є scheduled retention cleanup).

Реальний навантажений профіль (estimate за наявних AI ingest jobs ~10/min):

| Component                  | Concurrent connections (peak)           |
| -------------------------- | --------------------------------------- |
| Express requests           | 5–15 (обмежено rate-limit)              |
| BullMQ AI-memory ingestion | 3–5 (з `concurrency: 5`)                |
| Auth-mail worker           | 1                                       |
| Push worker                | 1                                       |
| Migration runner (rare)    | 1                                       |
| Idle reserve               | 1–2                                     |
| **Total peak**             | **12–25** ← перевищує `PG_POOL_SIZE=10` |

При перевищенні — request чекає у `pg-pool` queue, видно як latency-spikes на `/api/...` без явної причини.

## Scope

### 1. Sizing rule

- Default `PG_POOL_SIZE=20` (баланс між overprovisioning і реальним навантаженням).
- ENV-перекриття: на staging `PG_POOL_SIZE=10`, на production `PG_POOL_SIZE=20`.

### 2. Per-worker pool ізоляція (advanced)

- Розглянути окремий `pg.Pool` для BullMQ workers (`PG_POOL_SIZE_WORKER=10`) і express (`PG_POOL_SIZE_HTTP=15`). Worker-jobs тримають connection довше (3–10s на embedding write), не повинні задушувати express.
- Якщо це додає complexity — defer на наступний PR; main PR просто пiдвищує total до 20.

### 3. Monitoring

- Pino metric `pg_pool_size`, `pg_pool_idle`, `pg_pool_waiting` — кожні 30s emit.
- Sentry breadcrumb на `pool.connect()` longer than 500ms.
- Alert у `docs/observability/alerts.md`: «pg_pool_waiting > 5 sustained for 2 min».

### 4. Documentation

- `docs/observability/pg-pool-sizing.md` — формула, як змінити, як зрозуміти що time-to-pool slow.

## Out of scope

- Перейти на pgbouncer (зовнішній connection-pooler) — окремий ADR з cost analysis.
- Read-replicas (Railway не підтримує одразу).

## Acceptance criteria (DoD)

- [x] `PG_POOL_SIZE` default = 20 (`apps/server/src/env/env.ts:190`).
- [x] Pool metrics emitted (Prometheus gauges `db_pool_total/idle/waiting`
      sampled кожні 10s через `startPoolSampler` — це шиплось у main
      раніше; для PR-13 додано Counter `db_slow_pool_connects_total`).
- [x] Sentry breadcrumb на slow `pool.connect()` (`category: db.pool.slow_connect`,
      `apps/server/src/db.ts` `instrumentedConnect`). Поріг: `PG_SLOW_CONNECT_MS`
      default 500мс.
- [x] Alert правила задокументовані — `DbPoolWaitingSustained` (5m, ticket)
      і `DbPoolSaturated` (10m, page) живуть у
      [`docs/observability/prometheus/alert_rules.yml`](../../observability/prometheus/alert_rules.yml).
- [x] Документ [`docs/observability/pg-pool-sizing.md`](../../observability/pg-pool-sizing.md).

## Тести

- `apps/server/src/db.poolSlowConnect.test.ts` — slow checkout пише Pino warn
  `db_pool_slow_connect` + Sentry `addBreadcrumb({category:"db.pool.slow_connect"})`,
  fast checkout — мовчить (mocked `pg.Pool` з контрольованим `connect()`-delay).
- Існуючі `apps/server/src/db.test.ts` (PR #046 routedThrough) і
  `apps/server/src/dbReplica.test.ts` (PR #047) — passing.
- Smoke на staging з `PG_POOL_SIZE=20`: AI-memory ingestion з queue-depth 50 не блокує `/api/health`.

## Rollout

- Single PR. Якщо production DB-CPU піднімається >20% sustained — rollback пулу до 15.

## Risks & mitigations

| Risk                                                    | Mitigation                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Postgres має `max_connections` 100 (Railway default)    | 20 pool × 1 server-instance = 20, OK з headroom                           |
| Pool-size↑ exposed-ить latent missing-index → CPU spike | DB observability (pg_stat_statements) видасть проблему; fallback rollback |

## Touchpoints (file:line)

- `apps/server/src/env.ts:56`
- `apps/server/src/db.ts` — pool configuration
- `apps/server/src/obs/db-pool-metrics.ts` — новий
- `docs/observability/pg-pool-sizing.md` — новий

## Refs

- [pg-pool docs](https://node-postgres.com/api/pool)
- [Postgres connection sizing rule](https://github.com/brianc/node-postgres/wiki/pg-pool#choosing-pool-size)
