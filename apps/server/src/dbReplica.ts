/**
 * Read-replica routing helpers (PR #047 — Stage 6 storage roadmap).
 *
 * Створює окремий `pg.Pool` поверх `DATABASE_URL_REPLICA`, якщо він
 * заданий, і експортує тонкі helper-и для analytics-style read-only
 * запитів (`growth_*`, `seo_*` таблиці), які толерують реплікаційний
 * лаг (< 5s p99 — alert threshold у runbook-у).
 *
 * Дизайн:
 *
 * - **Opt-in.** Жоден існуючий handler не міняється автоматично — поки
 *   call-сайт не перейде на `queryReplica()`, він далі ходить у primary.
 *   Це безпечно: ми ніколи мовчки не міняємо where read-after-write
 *   semantic-у виконує існуючий код.
 *
 * - **Прозорий fallback.** Якщо `DATABASE_URL_REPLICA` не заданий, або
 *   replica pool кинув помилку (connection refused, statement_timeout,
 *   replica down) — `queryReplica()` повертається до primary pool.
 *   Тому single-URL деплоїменти (Replit, dev, docker-compose) працюють
 *   1:1, а production з replica down — деградує по latency, але не по
 *   правильності.
 *
 * - **Інкремент / спостереження.** `getReplicaPoolStats()` віддає
 *   `enabled` + `pg.Pool`-counters (як `getPoolStats()` для primary), і
 *   `routedThroughReplica` мітку у `query()`-логах через `op` префікс.
 *
 * Caveats:
 *
 * 1. **Lag.** Streaming replication у Railway обіцяє ≤ 5s p99 за
 *    нормальних умов. Endpoint-и, що використовують replica, повинні
 *    бути толерантні до stale-reads ≤ 10s.
 *
 * 2. **Read-only.** Це не enforced на рівні TypeScript — runtime буде
 *    кидати `cannot execute INSERT/UPDATE/DELETE in a read-only
 *    transaction` від самого Postgres, якщо хтось спробує писати в
 *    replica. У `queryReplica()` додано explicit warning в логах при
 *    fallback-у на primary через write-error (rare; малоймовірно
 *    через UI-shape).
 *
 * 3. **Транзакції.** `queryReplica()` навмисно НЕ підтримує `BEGIN…
 *    COMMIT` — для multi-statement read-only транзакцій є
 *    `withReplicaClient()` (отримує `PoolClient` з replica або
 *    primary, fall-through аналогічно).
 *
 * Runbook: `docs/runbooks/postgres-read-replica.md`.
 */

import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { logger } from "./obs/logger.js";
import { env } from "./env.js";
import pool from "./db.js";

/** Чи увімкнений read-replica routing у цьому процесі. */
export const REPLICA_ENABLED: boolean = Boolean(env.DATABASE_URL_REPLICA);

/**
 * Окремий `pg.Pool` для replica або `null`, якщо `DATABASE_URL_REPLICA`
 * не заданий. Експортується для health-check-ів (`/healthz`) — в
 * основному коді користуйся `queryReplica()` / `withReplicaClient()`.
 */
const replicaPool: pg.Pool | null = REPLICA_ENABLED
  ? new pg.Pool({
      connectionString: env.DATABASE_URL_REPLICA,
      max: env.PG_POOL_SIZE,
      idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
      statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
    })
  : null;

if (replicaPool) {
  replicaPool.on("error", (err: Error) => {
    logger.error({
      msg: "db_replica_pool_error",
      err: { message: err.message },
    });
  });

  logger.info({
    msg: "db_replica_enabled",
    hint: "analytics SELECTs route via DATABASE_URL_REPLICA; writes stay on primary",
  });
}

/**
 * Мінімальний контракт для primary-pool override-а, який тести і router
 * factory-и можуть пробросити в `queryReplica()`. Повертається `unknown`,
 * тому що `pg.Pool.query` має багато overload-ів — ми робимо runtime-cast
 * на `QueryResult<R>` нижче (це безпечно: pg повертає саме той shape,
 * який каркасується generic-параметром).
 */
type PrimaryPoolLike = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

interface QueryReplicaOpts {
  /** Tag для логів / метрик. */
  op?: string;
  /**
   * Override для primary pool, який використовується як fallback. За
   * замовчуванням — module-level `pool` з `db.ts`. Дозволяє тестам та
   * router factory-ам (`createSeoInternalRouter({ pool })`) пробросити
   * свій pool без розгалуження helper-а.
   */
  primary?: PrimaryPoolLike;
}

interface PgErrorLike {
  message?: string;
  code?: string;
}

function pgErr(err: unknown): PgErrorLike {
  return (err && typeof err === "object" ? (err as PgErrorLike) : {}) ?? {};
}

/**
 * Read-only query, який бажано виконати на replica. Якщо replica
 * недоступний (не сконфігурований, помилка конекту, statement timeout)
 * — повертається до primary pool.
 *
 * Викликати **тільки** для запитів, які толерантні до replication lag
 * (< 5s p99). Для read-after-write використовуй `query()` з `db.ts`.
 */
export async function queryReplica<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
  opts?: QueryReplicaOpts,
): Promise<QueryResult<R>> {
  const op = opts?.op ?? "query_replica";
  const primary = opts?.primary ?? pool;

  if (replicaPool) {
    try {
      return await replicaPool.query<R>(text, values as unknown[] | undefined);
    } catch (err: unknown) {
      const e = pgErr(err);
      logger.warn({
        msg: "db_replica_query_failed_fallback_primary",
        op,
        code: e.code,
        err: { message: e.message },
      });
      // Fall through до primary pool — see jsdoc § Caveats.
    }
  }

  // primary.query повертає Promise<unknown> (PrimaryPoolLike contract);
  // у production це pg.Pool, у тестах — vitest-mock із того самого
  // shape. Cast безпечний — generic <R> поширюється з caller-сайту.
  const result = await primary.query(text, values as unknown[] | undefined);
  return result as QueryResult<R>;
}

/**
 * Виконати read-only коллбек з `PoolClient` від replica, з fallback до
 * primary, якщо replica не сконфігурований чи відмовив.
 *
 * Використання — для multi-statement read-only сценаріїв (наприклад,
 * `BEGIN; ...; COMMIT;` для consistent snapshot з кількох SELECT-ів).
 */
export async function withReplicaClient<T>(
  fn: (client: PoolClient) => Promise<T>,
  opts?: { op?: string },
): Promise<T> {
  const op = opts?.op ?? "with_replica_client";

  if (replicaPool) {
    let client: PoolClient | null = null;
    try {
      client = await replicaPool.connect();
      return await fn(client);
    } catch (err: unknown) {
      const e = pgErr(err);
      logger.warn({
        msg: "db_replica_client_failed_fallback_primary",
        op,
        code: e.code,
        err: { message: e.message },
      });
    } finally {
      client?.release();
    }
  }

  const primaryClient = await pool.connect();
  try {
    return await fn(primaryClient);
  } finally {
    primaryClient.release();
  }
}

/**
 * Pool-counters для replica або `enabled: false`, якщо replica не
 * сконфігурований. Формат сумісний із `getPoolStats()` для primary,
 * щоб дашборди могли мерджити.
 */
export function getReplicaPoolStats() {
  if (!replicaPool) {
    return { enabled: false as const };
  }
  return {
    enabled: true as const,
    totalCount: replicaPool.totalCount,
    idleCount: replicaPool.idleCount,
    waitingCount: replicaPool.waitingCount,
  };
}

/** Експорт для tests — не використовувати у production-коді. */
export const __replicaPoolForTests = replicaPool;
