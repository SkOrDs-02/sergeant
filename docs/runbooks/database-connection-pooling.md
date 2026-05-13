# Database connection pooling — runbook (PR #046)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

> Закриває Stage 6 PR #046 із [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md):
> deploy-shape для **pgBouncer connection pooler** перед Railway Postgres,
> ENV-перемикач `DATABASE_URL_POOL`, та правила, які API-маршрути / cron / міграції
> ходять через який URL.
>
> Cross-link: [`docs/security/disaster-recovery.md`](../security/disaster-recovery.md)
> (як pooler впливає на RTO) і
> [`docs/runbooks/database-backup-restore.md`](./database-backup-restore.md)
> (`DATABASE_URL_PUBLIC` для restore-on-staging — теж direct, не pooled).

## TL;DR

- `DATABASE_URL` — direct Postgres connection. Завжди потрібен. Migrations,
  cron-воркери, advisory locks і будь-який майбутній `LISTEN/NOTIFY`-consumer
  ходять сюди.
- `DATABASE_URL_POOL` — необов'язковий pgBouncer / Supavisor / Neon-proxy URL у
  **transaction-mode**. Якщо заданий — runtime app-pool (`apps/server/src/db.ts`)
  routes через нього.
- Empty / unset → fallback на `DATABASE_URL` (legacy single-URL behaviour, нічого
  не ламається на dev / Replit / docker-compose).

`POOL_VIA_PGBOUNCER` (експортний boolean із `db.ts`) і
`getPoolStats().routedThrough` (`"pgbouncer" | "direct"`) — джерело правди для
дашбордів і алертів про деградовану топологію.

## Архітектура

```
                 ┌─ DATABASE_URL ─────────► Postgres (direct)
                 │   • migrations (`apps/server/migrate.mjs`)
                 │   • advisory locks (`runPendingSqlMigrations`)
                 │   • cron / batch-воркери, які тримають session-state
                 │   • будь-який майбутній `LISTEN/NOTIFY`-consumer
HTTP request ────┤
                 │
                 └─ DATABASE_URL_POOL ────► pgBouncer (txn-mode) ─► Postgres
                     • runtime app-pool (`apps/server/src/db.ts`)
                     • усі API-handler-и через `query()` / `pool.connect()`
                     • SSE стрім (`syncV2Stream`) — pull queries
                     • Better Auth handler-и
```

## Чому transaction-mode (а не session-mode)

| Mode          | Pros                            | Cons                                                                                                                                       |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `session`     | повна сумісність з pg / Drizzle | втрачаємо левову частку економії: client тримає backend на весь life-time pool-connection-у                                                |
| `transaction` | ratio backend:client ≈ 1:5–10   | заборонені prepared statements з іменем, advisory locks per-session, `LISTEN/NOTIFY`, deferred constraints, set-and-read session variables |
| `statement`   | максимальний throughput         | заборонені будь-які мульти-statement транзакції — ламає Sergeant повністю                                                                  |

Ми використовуємо **transaction-mode** + ці правила:

- Sergeant викликає `pool.query()` через бібліотеку `pg`, яка за замовчуванням
  передає запити **без імені** (`query.name === undefined`) — pgBouncer їх не
  кешує per-backend, тому `routine`/`fizruk`/`finyk`/`nutrition` apply-fn-и
  працюють штатно. Жоден код під `apps/server/src/**` сьогодні не ставить
  `name:` в `QueryConfig`. Pre-merge-страховка — grep-rule в
  `scripts/check-imports.mjs` (TODO відкрити окремий followup).
- Усі transactional flow-и тримаються всередині одного `pool.connect()` ↔ `BEGIN`
  ↔ `COMMIT` (`syncV2.ts`, `mono/webhook.ts`, `sync.ts`). pgBouncer трактує `BEGIN`
  як старт виключеної транзакції — та сама backend-сесія тримається до `COMMIT` /
  `ROLLBACK`. Жодних cross-transaction `SET session_var = …` ми не робимо.
- Migrations і advisory locks залишаються на direct `DATABASE_URL` через
  `MIGRATE_DATABASE_URL` fallback в `apps/server/migrate.mjs` (Pre-Deploy-job
  на Railway, окремо від runtime pool).

## Railway-deploy шейп

1. Створити окремий Railway-сервіс `pgbouncer` із image
   [`edoburu/pgbouncer`](https://hub.docker.com/r/edoburu/pgbouncer).
2. Service variables (мінімально):

   ```env
   DATABASES_HOST=${{ Postgres.PGHOST }}
   DATABASES_PORT=${{ Postgres.PGPORT }}
   DATABASES_USER=${{ Postgres.PGUSER }}
   DATABASES_PASSWORD=${{ Postgres.PGPASSWORD }}
   DATABASES_DBNAME=${{ Postgres.PGDATABASE }}
   POOL_MODE=transaction
   MAX_CLIENT_CONN=2000
   DEFAULT_POOL_SIZE=20
   AUTH_TYPE=scram-sha-256
   IGNORE_STARTUP_PARAMETERS=extra_float_digits,application_name
   ```

   `MAX_CLIENT_CONN` = очікувана кількість одночасних HTTP-конекшенів × N replicas.
   `DEFAULT_POOL_SIZE` = 20 співмірно з `PG_POOL_SIZE=10` × ~2 replicas — pool size
   у самому pgBouncer не повинен перевищувати `max_connections` Postgres мінус
   зарезервовані під migrations / superuser (~5).

3. Експозиція: pgBouncer слухає на `0.0.0.0:6432` усередині приватної мережі;
   зовні не публікуємо. Internal DNS автоматично робить
   `pgbouncer.railway.internal:6432` доступним для server-сервісу.
4. На server-сервісі додати:

   ```env
   DATABASE_URL=${{ Postgres.DATABASE_URL }}              # direct, для migrations
   DATABASE_URL_POOL=postgresql://${{ Postgres.PGUSER }}:${{ Postgres.PGPASSWORD }}@pgbouncer.railway.internal:6432/${{ Postgres.PGDATABASE }}?sslmode=disable
   ```

   `sslmode=disable` свідомо: трафік pgBouncer↔Postgres усередині приватної мережі
   Railway вже не виходить за межі VPC. Вмикайте TLS лише якщо переходите на
   зовнішній pooler-host.

5. Залишити `MIGRATE_DATABASE_URL=${{ Postgres.DATABASE_PUBLIC_URL }}` без змін —
   pre-deploy-міграційний контейнер ходить через public proxy, як і раніше
   (`apps/server/migrate.mjs`).

## Верифікація

1. Логи server-сервісу при старті повинні містити рядок із `msg: "db_pool_via_pgbouncer"`
   (`logger.info`-call із `apps/server/src/db.ts`).
2. `GET /healthz`:

   ```json
   {
     "status": "healthy",
     "checks": {
       "database": {
         "status": "healthy",
         "details": {
           "latencyMs": 4,
           "totalCount": 0,
           "idleCount": 0,
           "waitingCount": 0,
           "routedThrough": "pgbouncer"
         }
       }
     }
   }
   ```

3. На Postgres: `SELECT count(*), application_name FROM pg_stat_activity GROUP BY application_name;`
   має показати **одну backend-connection per pool-slot** з `application_name = 'pgbouncer'`,
   а не N×replicas як до перемикання.

## Rollback

Видалити `DATABASE_URL_POOL` (або задати рівним `DATABASE_URL`) → restart server-сервіс.
`POOL_VIA_PGBOUNCER` повертається до `false`, runtime app-pool ходить напряму.
Жодних schema-мутацій, тому rollback повністю forward-compatible.

## Алерти

- `db_pool_via_pgbouncer` має з'являтися рівно один раз на старт сервісу. Спам цього
  лог-рядка → перезавантаження пула в runtime, що означає або memory leak, або
  hot-reload-bug.
- `pg_stat_activity.count` на Postgres-боці повинно тримати `≤ DEFAULT_POOL_SIZE`
  після стабілізації під навантаженням. Перевищення → pgBouncer pool-mode не
  встановлений у `transaction`, або `MAX_CLIENT_CONN` перевищує реальну ємність
  Postgres.
- `routedThrough: "direct"` у `/healthz` після того, як `DATABASE_URL_POOL` був
  виставлений → pool fail-back через помилку URL-парсингу (treat as deploy-blocker).

## Cross-link

- Runtime пул: `apps/server/src/db.ts` (`POOL_VIA_PGBOUNCER`, `getPoolStats`).
- Migration runner: `apps/server/migrate.mjs` (`MIGRATE_DATABASE_URL` має пріоритет
  над `DATABASE_URL`).
- Storage roadmap: [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md) Stage 6.
