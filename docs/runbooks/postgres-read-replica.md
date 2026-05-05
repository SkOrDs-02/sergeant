# Postgres read replica — runbook (PR #047)

> **Last validated:** 2026-05-05 by Devin. **Next review:** 2026-08-05.
> **Status:** Active

> Закриває Stage 6 PR #047 із [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md):
> deploy-shape для **streaming-replication read replica** Postgres у Railway
> production-tier, ENV-перемикач `DATABASE_URL_REPLICA`, та правила, які
> запити мають право ходити в replica.
>
> Cross-link:
> [`docs/runbooks/database-connection-pooling.md`](./database-connection-pooling.md)
> (replica + pgBouncer — комбінуються, але незалежні),
> [`docs/runbooks/database-backup-restore.md`](./database-backup-restore.md)
> (replica ≠ backup — він не захищає від logical corruption).

## TL;DR

- `DATABASE_URL` — primary Postgres. Усі writes, транзакції,
  read-after-write reads.
- `DATABASE_URL_POOL` — pgBouncer перед primary. Runtime app-pool ходить
  туди (див. [pgBouncer runbook](./database-connection-pooling.md)).
- `DATABASE_URL_REPLICA` — **новий** опційний URL до streaming-replication
  read-replica. Opt-in caller-и (`growth_*` / `seo_*` analytics SELECT-и)
  ходять через `apps/server/src/dbReplica.ts` → `queryReplica()`.
- Empty / unset → `queryReplica()` прозоро fallback-ить на primary pool.
  Single-URL deploy-и (Replit, dev, docker-compose) працюють без змін.

`REPLICA_ENABLED` (експорт із `dbReplica.ts`) і `getReplicaPoolStats()`
(`{ enabled: false }` або pool-counters) — джерело правди для health-check
endpoint-а та дашбордів.

## Архітектура

```
                                    ┌─► Postgres primary
                                    │   • усі writes
                                    │   • read-after-write SELECT-и
                 ┌─ DATABASE_URL ───┤   • migrations / advisory locks
                 │                  │   • Better Auth, /api/v2/sync/push
HTTP request ────┤
                 │  ┌─ DATABASE_URL_POOL ─► pgBouncer ─► (та сама primary)
                 │
                 └─ DATABASE_URL_REPLICA ─► Postgres replica (streaming)
                     • analytics SELECT (queryReplica)
                     • lag-tolerant endpoint-и (≤ 5s p99)
                     • тільки read-only — Postgres сам кине помилку на write
```

Replica відстає від primary на 0–5s (нормальні умови). Усі запити до
replica повинні бути толерантні до stale reads ≤ 10s.

## Чому окремий пул, а не route у тому самому `db.ts`

1. **Конфіг ізольований.** Replica може мати інший `statement_timeout`
   (analytics — довше), іншу `max` (більше long-runner-ів), іншу
   `idleTimeoutMillis`. Окремий `pg.Pool` дозволяє це без розгалуження
   `db.ts`.

2. **Прозорий fallback не ламає primary.** `queryReplica()` ловить
   будь-яку помилку (connect refused, statement_timeout, replica down)
   і робить retry на primary. Якби це жило в `db.ts`, ми б ризикували
   подвійним лог-ентрі / подвійним метричним підрахунком.

3. **Опціональність зашита у конструктор.** `replicaPool: pg.Pool | null`
   — якщо `DATABASE_URL_REPLICA` порожній, ми взагалі не створюємо
   `pg.Pool`, і нічого не висить idle-conn-ом.

## Які запити сидять на replica

Сьогодні (PR #047): `GET /api/internal/seo/keywords` (active keyword
list — analytics-style read, толерує лаг).

Майбутнє розширення (з низьким рівнем ризику):

- Решта `GET /api/internal/seo/*` lookup-и (snapshot listing, ranks-by-day).
- Analytics digest endpoint-и для `growth_events` / `growth_metrics_daily`.
- Будь-який endpoint з префіксом `/api/insights/*`, який повертає
  агрегати з `seo_*` / `growth_*` без read-after-write вимог.

Як додати новий endpoint у replica:

```ts
import { queryReplica } from "../../dbReplica.js";

const { rows } = await queryReplica<RowShape>(
  `SELECT … FROM seo_… WHERE …`,
  [param1, param2],
  { op: "seo_my_analytic" },
);
```

Не використовувати `queryReplica()` для:

- write-after-read (UPSERT з conditional на свіже значення);
- межі транзакції з `BEGIN…COMMIT` (для multi-statement read-only —
  `withReplicaClient()`);
- low-traffic admin endpoint-ів — простіше залишити на primary;
- запитів, де UI робить mutation і одразу re-read (chat, hub).

## Railway deploy shape

```
Railway Project: Sergeant Production
├── Service: postgres-primary (плагін Postgres або власний)
│   • DATABASE_URL = postgres://… → primary
│   • Backup retention: 7 днів (PITR — див. backup-restore runbook)
│
├── Service: postgres-replica (Postgres-replica plugin)
│   • Stream from primary (Railway primary-replica linkage)
│   • DATABASE_URL_REPLICA = postgres://ro:…@replica.railway.internal:5432/…
│   • Read-only role (`ALTER USER ro WITH NOSUPERUSER`)
│   • monitoring: Railway dashboard → replica lag
│
└── Service: api (apps/server)
    • DATABASE_URL = postgres://…@primary.railway.internal:5432/…
    • DATABASE_URL_POOL = postgres://…@pgbouncer.railway.internal:6432/… (PR #046)
    • DATABASE_URL_REPLICA = ⏎ те, що вище ⏎
    • PG_POOL_SIZE = 10 (з'являється у both primary і replica pool)
    • startup лог: `db_replica_enabled` повинен з'явитись один раз на boot
```

### Replica role (минимальные привилегии)

```sql
-- Виконати ОДИН РАЗ на primary (наслідується на replica)
CREATE ROLE ro_analytics LOGIN PASSWORD '<random-32-byte-hex>';
GRANT CONNECT ON DATABASE sergeant TO ro_analytics;
GRANT USAGE ON SCHEMA public TO ro_analytics;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ro_analytics;

-- Future-proof: новостворені таблиці автоматично доступні для SELECT
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO ro_analytics;
```

Це гарантує, що навіть якщо хтось у майбутньому випадково передасть
write-запит у `queryReplica()`, Postgres відмовить permission-error-ом
не replica-status-error-ом.

## Верифікація після деплою

1. **Startup-лог:**

   ```bash
   railway logs --service api | grep db_replica
   # → {"level":"info","msg":"db_replica_enabled","hint":"analytics SELECTs route via DATABASE_URL_REPLICA; writes stay on primary"}
   ```

2. **Health-check:** додай `getReplicaPoolStats()` у `/healthz`-payload (або
   `/api/observability/db-replica`, якщо такий маршрут з'явиться).
   Очікувана відповідь:

   ```json
   {
     "replica": {
       "enabled": true,
       "totalCount": 0,
       "idleCount": 0,
       "waitingCount": 0
     }
   }
   ```

   `totalCount` зросте після першого `queryReplica()` виклику.

3. **Manual smoke:**

   ```bash
   curl -fsS -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
     https://api.sergeant.app/api/internal/seo/keywords?onlyActive=1 \
     | jq '.keywords | length'
   # → число > 0; у логах сервера op="seo_keywords_list" з replica-pool метрикою
   ```

4. **Lag check (Postgres-side, з primary):**
   ```sql
   SELECT
     application_name,
     state,
     EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()) AS lag_seconds
   FROM pg_stat_replication;
   -- очікуємо lag_seconds < 5
   ```

## Rollback

Прибрати `DATABASE_URL_REPLICA` зі змінних середовища server-сервісу
(або задати порожній рядок). Restart server. Жодних schema-мутацій,
жодних data-loss-ризиків — `queryReplica()` миттєво повернеться до
primary.

Якщо replica сильно відстав (≥ 60s) і блокує analytics на свіжих
даних — можна вимкнути `DATABASE_URL_REPLICA` тимчасово, поки Railway
re-syncs replica зі snapshot-у primary.

## Алерти

| Метрика                                         | Поріг       | Дія                                                              |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `pg_stat_replication.lag_seconds` p99           | > 5s        | Розслідувати primary write-load; підняти replica resources       |
| `db_replica_query_failed_fallback_primary` rate | > 1/min     | Replica down або statement_timeout — перевірити replica health   |
| `replicaPool.totalCount` constant 0             | > 5min      | Перевірити чи `DATABASE_URL_REPLICA` доходить до server-сервісу  |
| `pg_stat_replication.state`                     | ≠ streaming | Replication broken — оновити Railway service / re-create replica |

## Caveats

1. **Replica ≠ backup.** Logical corruption (помилка у міграції,
   випадковий `DELETE` без `WHERE`) реплікується миттєво. Backup +
   PITR — окремий механізм; див. `database-backup-restore.md`.

2. **Schema-changes лаг.** Під час deploy-у міграції viконуються на
   primary, а replica підхоплює зміни через replication-stream. У
   проміжку (<5s) replica може бути на старій схемі — `queryReplica()`
   на нову колонку поверне `column "..." does not exist`. Для
   safety: всі нові SELECT-и через replica повинні читати тільки
   колонки, які існували у попередньому релізі (= те саме правило, що
   й для blue-green; див. AGENTS.md hard-rule #4).

3. **Read-only enforcement.** На рівні TypeScript нічого не заважає
   написати `INSERT` через `queryReplica()`. Ми покладаємось на:
   - `ro_analytics` role (permission-error від Postgres);
   - PR-review (grep `queryReplica.*INSERT|UPDATE|DELETE` як CI-gate
     — followup task).

4. **pgBouncer + replica.** Якщо у майбутньому з'явиться окремий
   pgBouncer перед replica — `DATABASE_URL_REPLICA` має вказувати на
   нього (transaction-mode). Поки що достатньо connect напряму до
   replica через Railway internal DNS.
