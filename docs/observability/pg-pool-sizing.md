---
status: active
owner: "@Skords-01"
last_validated: 2026-05-06
next_review: 2026-08-06
---

# Postgres pool sizing — knobs, sizing rule, debugging

> **Status:** active.
> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> Виконує acceptance criteria stack-pulse PR-13
> ([`docs/initiatives/stack-pulse-2026-05/pr-13-postgres-pool-sizing.md`](../initiatives/stack-pulse-2026-05/pr-13-postgres-pool-sizing.md)).
> Перетинається з [`docs/runbooks/database-connection-pooling.md`](../runbooks/database-connection-pooling.md)
> (deploy-shape pgBouncer pooler) і [`docs/observability/runbook.md`](./runbook.md)
> (response для алертів `DbPoolWaitingSustained` / `DbPoolSaturated`).

## TL;DR

- App-pool default: **`PG_POOL_SIZE=20`** (server-instance level). Виставляється у
  [`apps/server/src/env/env.ts`](../../apps/server/src/env/env.ts) і використовується у
  [`apps/server/src/db.ts`](../../apps/server/src/db.ts) як `pg.Pool({ max })`.
- Слідкувати по: `db_pool_total`, `db_pool_idle`, `db_pool_waiting`,
  `db_slow_pool_connects_total` (Prometheus). Pino warn `db_pool_slow_connect`
  - Sentry breadcrumb (`category: db.pool.slow_connect`) на checkout-и
    довші за `PG_SLOW_CONNECT_MS` (default 500мс).
- Алерти: `DbPoolWaitingSustained` (5m, ticket) і `DbPoolSaturated` (10m, page) —
  у [`docs/observability/prometheus/alert_rules.yml`](./prometheus/alert_rules.yml).

## Sizing rule

Профіль одного server-instance (peak):

| Component                          | Concurrent connections (peak) |
| ---------------------------------- | ----------------------------- |
| Express HTTP request handlers      | 5–15                          |
| BullMQ AI-memory ingest worker     | 3–5 (`concurrency: 5`)        |
| Auth-mail worker                   | 1                             |
| Push worker                        | 1                             |
| Sync stream (`syncV2Stream`) pulls | 1–3                           |
| Migration runner (deploy time)     | 1                             |
| Idle reserve                       | 1–2                           |
| **Total peak**                     | **12–28**                     |

Default `20` — баланс між overprovisioning і реальним навантаженням. Якщо
бачиш `db_pool_waiting > 0` стабільно — спочатку перевір, чи дійсно
треба більше connection-ів, чи це slow-query problem (див. секцію
"Debugging" нижче).

### Через pgBouncer (PR #046, runtime у production)

При `DATABASE_URL_POOL` set:

```
N replicas × PG_POOL_SIZE  ≤  pgBouncer DEFAULT_POOL_SIZE
pgBouncer DEFAULT_POOL_SIZE  ≤  Postgres max_connections − 5 (reserved migrations/superuser)
```

Railway-default `max_connections=100`, pgBouncer `DEFAULT_POOL_SIZE=20` (transaction-mode),
2 server replicas × `PG_POOL_SIZE=20` = 40 client-side slots →
pgBouncer мультиплексує у ≤20 backend-connections. Headroom OK.

### Без pgBouncer (dev / Replit / docker-compose)

App-pool ходить напряму у Postgres. `N replicas × PG_POOL_SIZE` має лишити
~5 backend-slots під migrations / superuser:

```
N replicas × PG_POOL_SIZE  ≤  Postgres max_connections − 5
```

Railway Hobby Postgres має `max_connections=100`, тому для single-replica
Replit/dev `PG_POOL_SIZE=20` — комфортно.

## ENV knobs

| ENV                        | Default | Опис                                                                                                    |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `PG_POOL_SIZE`             | `20`    | `pg.Pool` `max` — concurrent client checkouts на server-instance. Бамп => перевір DB max_connections.   |
| `PG_CONNECTION_TIMEOUT_MS` | `5000`  | `pg.Pool` `connectionTimeoutMillis` — fail-fast якщо acquire не встигає за цей час.                     |
| `PG_SLOW_CONNECT_MS`       | `500`   | Pino warn + Sentry breadcrumb + Prom counter `db_slow_pool_connects_total` коли checkout > цього часу.  |
| `PG_IDLE_TIMEOUT_MS`       | `30000` | `pg.Pool` `idleTimeoutMillis` — після цього idle connection закривається.                               |
| `PG_STATEMENT_TIMEOUT_MS`  | `30000` | `statement_timeout` per session (захист від runaway queries).                                           |
| `DB_SLOW_MS`               | `200`   | Поріг "повільного запиту" у `query()`-wrapper-і; не плутати з `SLOW_QUERY_THRESHOLD_MS`.                |
| `SLOW_QUERY_THRESHOLD_MS`  | `100`   | Legacy alias — лишається для зворотньої сумісності з існуючими env-set-ами.                             |
| `DATABASE_URL`             | —       | Direct Postgres URL. Завжди потрібен — migrations / advisory locks / session-mode.                      |
| `DATABASE_URL_POOL`        | unset   | pgBouncer URL. Якщо заданий, runtime app-pool ходить туди (transaction-mode). Деталі — runbook PR #046. |

## Метрики

Усі експортуються через `GET /metrics` (Prometheus exposition).

| Metric                        | Type    | Збирає                                                                        |
| ----------------------------- | ------- | ----------------------------------------------------------------------------- |
| `db_pool_total`               | Gauge   | Sampled кожні 10s (`startPoolSampler` у `obs/metrics.ts`).                    |
| `db_pool_idle`                | Gauge   | ↑                                                                             |
| `db_pool_waiting`             | Gauge   | ↑ — > 0 означає, що щось чекає у черзі pool-у.                                |
| `db_slow_pool_connects_total` | Counter | Інкрементиться на кожен `pool.connect()` повільніший за `PG_SLOW_CONNECT_MS`. |
| `db_query_duration_ms{op}`    | Hist    | Per-query latency у `query()`-wrapper-і.                                      |
| `db_slow_queries_total{op}`   | Counter | Запит > `SLOW_QUERY_THRESHOLD_MS` (legacy threshold).                         |
| `db_errors_total{code}`       | Counter | Per PG error code.                                                            |

Корисні запити:

```promql
# контеншн (leading indicator)
max(db_pool_waiting)

# pool utilization
(db_pool_total - db_pool_idle) / on() group_left max(db_pool_total)

# rate slow-checkouts по часу
rate(db_slow_pool_connects_total[5m])

# чи трафік уже згоряє idle-резерв
avg_over_time(db_pool_idle[5m])
```

## Алерти

Уже задокументовані у [`alert_rules.yml`](./prometheus/alert_rules.yml):

| Alert                    | Expr                  | For | Severity | Runbook                                                                  |
| ------------------------ | --------------------- | --- | -------- | ------------------------------------------------------------------------ |
| `DbPoolWaitingSustained` | `db_pool_waiting > 0` | 5m  | ticket   | [runbook.md#dbpoolwaitingsustained](./runbook.md#dbpoolwaitingsustained) |
| `DbPoolSaturated`        | `db_pool_waiting > 0` | 10m | page     | [runbook.md#dbpoolsaturated](./runbook.md#dbpoolsaturated)               |

Майбутній follow-up (out of scope PR-13): додати `DbSlowPoolConnects`
alert на `rate(db_slow_pool_connects_total[10m]) > 0.1` як ще один
leading indicator. Для першої ітерації Sentry breadcrumb-и
прив'язуються до user-events і дають достатньо сигналу руками.

## Debugging slow `pool.connect()`

Коли бачиш Pino warn `db_pool_slow_connect` або Sentry breadcrumb
`db.pool.slow_connect`:

1. **Подивись `pool_waiting` у same-time payload-і.** Якщо `> 0` — pool
   реально вичерпаний. Йди у `DbPoolWaitingSustained` runbook.
2. **Якщо `pool_waiting == 0` — це не pool exhaustion.** Можливі причини:
   - TLS-handshake до Postgres повільний (Railway region issue, видно в
     network metrics їхньої панелі).
   - pgBouncer перевантажений сам по собі (`pgbouncer_*` метрики у
     `runbooks/database-connection-pooling.md`).
   - Cold-start replica після scale-up.
3. **Якщо проблема стабільна > 10хв** — підняти `PG_POOL_SIZE` НЕ допоможе
   (queue порожня); фокусуй на upstream connection-path.

## Як міняти `PG_POOL_SIZE`

1. Railway → Variables → `PG_POOL_SIZE` → новий integer.
2. Redeploy server. Pool re-init на boot, нова межа активується одразу.
3. Перевір що `db_pool_total` піднявся до нової межі під навантаженням
   (синтетичний тест: BullMQ `ai-memory-ingest` queue depth ≥ 50, або
   k6 perf-script коли він з'явиться у `scripts/perf/`).
4. Слідкуй за `db_errors_total{code="08006"}` (connection failure) — якщо
   піднявся, ти впав у Postgres `max_connections`. Rollback `PG_POOL_SIZE`
   і досліджуй upstream pool/DB capacity.

## Out of scope (наступні PR)

- Per-worker pool ізоляція (`PG_POOL_SIZE_HTTP` + `PG_POOL_SIZE_WORKER`).
  Worker-jobs тримають connection довше (3–10s на embedding write); коли
  буде явний contention — окремий PR.
- `DbSlowPoolConnects` Prometheus alert (див. вище).
- Read-replica pool sizing — у [`docs/runbooks/postgres-read-replica.md`](../runbooks/postgres-read-replica.md).
