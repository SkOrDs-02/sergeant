import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { logger } from "./obs/logger.js";
import { env } from "./env.js";
import {
  dbErrorsTotal,
  dbQueryDurationMs,
  dbSlowQueriesTotal,
} from "./obs/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PG Pool with centralized configuration, health checks, and retry support.
 *
 * Features:
 * - Configurable via env.ts (PG_POOL_SIZE, PG_CONNECTION_TIMEOUT_MS, etc.)
 * - Statement timeout to prevent long-running queries
 * - Idle connection cleanup
 * - Connection validation before use
 *
 * Connection routing (PR #046 — pgBouncer pooling):
 *   `DATABASE_URL_POOL`, якщо заданий, — це pgBouncer / Supavisor / Neon
 *   pooler URL у transaction-mode. Runtime app-pool ходить туди, а
 *   `DATABASE_URL` лишається direct-connection і використовується
 *   тільки міграційним runner-ом (`apps/server/migrate.mjs` через
 *   `MIGRATE_DATABASE_URL` fallback) і session-mode воркерами, які
 *   ламаються в transaction-pooled режимі (advisory locks, named
 *   prepared statements, `LISTEN/NOTIFY`). Якщо `DATABASE_URL_POOL`
 *   порожній — pool fallback-ить на `DATABASE_URL` без зміни поведінки
 *   для single-URL деплоїв (Replit, docker-compose, локальний dev).
 *   Runbook: `docs/runbooks/database-connection-pooling.md`.
 */
const runtimeConnectionString = env.DATABASE_URL_POOL || env.DATABASE_URL;

/** Whether the runtime pool is routing through a pooler (pgBouncer). */
export const POOL_VIA_PGBOUNCER: boolean = Boolean(env.DATABASE_URL_POOL);

const pool = new pg.Pool({
  connectionString: runtimeConnectionString,
  max: env.PG_POOL_SIZE,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
  // Set statement_timeout on each connection to prevent runaway queries
  statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
});

if (POOL_VIA_PGBOUNCER) {
  logger.info({
    msg: "db_pool_via_pgbouncer",
    hint: "runtime pool uses DATABASE_URL_POOL; migrations stay on DATABASE_URL",
  });
}

interface PgErrorLike {
  message?: string;
  code?: string;
}

function pgErr(err: unknown): PgErrorLike {
  return (err && typeof err === "object" ? (err as PgErrorLike) : {}) ?? {};
}

pool.on("error", (err: Error) => {
  const e = pgErr(err);
  logger.error({
    msg: "db_pool_error",
    err: { message: e.message || String(err), code: e.code },
  });
  try {
    dbErrorsTotal.inc({ code: e.code || "unknown" });
  } catch {
    /* ignore */
  }
});

const SLOW_MS = env.SLOW_QUERY_THRESHOLD_MS;

type QueryText = string | { text: string; values?: unknown[] };

interface QueryMeta {
  op?: string;
  /** Skip retry logic (default: false). Set to true for mutations that shouldn't be retried. */
  noRetry?: boolean;
}

/** Коротке ім'я SQL для логів (перше слово + перші 120 символів, без параметрів). */
function sqlSummary(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Transient PG error codes that are safe to retry:
 * - 40001: serialization_failure (concurrent transaction conflict)
 * - 40P01: deadlock_detected
 * - 08006: connection_failure
 * - 08003: connection_does_not_exist
 * - 57P01: admin_shutdown (server restarting)
 */
const RETRYABLE_PG_CODES = new Set([
  "40001",
  "40P01",
  "08006",
  "08003",
  "57P01",
]);

function isRetryableError(err: unknown): boolean {
  const code = pgErr(err).code;
  return !!code && RETRYABLE_PG_CODES.has(code);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Обгортка над `pool.query` з логуванням повільних запитів, метриками,
 * retry для transient помилок і підрахунком помилок.
 *
 * Підпис збережено один-в-один з pg, щоб можна було поступово переводити
 * handler-и без зміни викликів.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: QueryText,
  values?: unknown[],
  meta?: QueryMeta,
): Promise<QueryResult<R>> {
  const op = meta?.op ?? "query";
  const noRetry = meta?.noRetry ?? false;
  const maxRetries = noRetry ? 0 : env.DB_MAX_RETRIES;
  const sqlText = typeof text === "string" ? text : text.text;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = process.hrtime.bigint();

    try {
      const result = await pool.query<R>(
        sqlText,
        values as unknown[] | undefined,
      );
      const ms = Number(process.hrtime.bigint() - start) / 1e6;

      try {
        dbQueryDurationMs.observe({ op }, ms);
      } catch {
        /* ignore */
      }

      if (ms >= SLOW_MS && env.LOG_SLOW_QUERIES) {
        try {
          dbSlowQueriesTotal.inc({ op });
        } catch {
          /* ignore */
        }
        logger.warn({
          msg: "db_slow",
          op,
          sql: sqlSummary(sqlText),
          ms: Math.round(ms),
          rows: result.rowCount,
        });
      }

      return result;
    } catch (err: unknown) {
      lastError = err;
      const e = pgErr(err);

      // Check if error is retryable and we have retries left
      if (attempt < maxRetries && isRetryableError(err)) {
        const delayMs = Math.min(100 * Math.pow(2, attempt), 2000);
        logger.warn({
          msg: "db_retry",
          op,
          sql: sqlSummary(sqlText),
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          code: e.code,
        });
        await sleep(delayMs);
        continue;
      }

      try {
        dbErrorsTotal.inc({ code: e.code || "unknown" });
      } catch {
        /* ignore */
      }

      logger.error({
        msg: "db_error",
        op,
        sql: sqlSummary(sqlText),
        err: { message: e.message || String(err), code: e.code },
        attempt: attempt + 1,
      });

      throw err;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Get database pool statistics for monitoring.
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    /** PR #046: chunked into health output so dashboards can split metrics by routing path. */
    routedThrough: POOL_VIA_PGBOUNCER
      ? ("pgbouncer" as const)
      : ("direct" as const),
  };
}

/**
 * Стабільний 64-бітний id для advisory-lock міграцій. Значення — статичне,
 * довільне, ключ — щоб два процеси `scripts/migrate.mjs` (паралельний
 * release-stage на різних репліках, ручний `npm run db:migrate` під час
 * деплою тощо) не стартували міграції одночасно й не зловили race на
 * `INSERT schema_migrations` або DDL-колізію. Lock session-scoped —
 * звільниться автоматично, якщо процес упаде.
 */
const MIGRATIONS_ADVISORY_LOCK_KEY = 7317483629462015n;

/**
 * Incremental SQL migrations from server/migrations/*.sql (lexicographic order).
 * Tracked in schema_migrations. schema_migrations itself is the only table
 * created inline — everything else is defined in migration files.
 *
 * `pg_advisory_lock` серіалізує паралельні виклики: другий claim буде
 * спати доти, доки перший не відпустить lock (у `ensureSchema.finally`).
 * Після розблокування другий увійде, побачить уже застосовані файли у
 * `schema_migrations` і тихо no-op-не.
 */
async function runPendingSqlMigrations(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_lock($1)", [
    MIGRATIONS_ADVISORY_LOCK_KEY.toString(),
  ]);

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  let files: string[];
  try {
    files = await fs.readdir(migrationsDir);
  } catch (e: unknown) {
    if (pgErr(e).code === "ENOENT") return;
    throw e;
  }

  // Forward-only runner: `.down.sql` — явні rollback-скрипти, які DBA
  // запускає руками (див. коментар у відповідному файлі). Виключаємо їх з
  // auto-apply, інакше `006_push_devices.down.sql` відкотив би міграцію
  // одразу після її застосування.
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of sqlFiles) {
    const { rows } = await client.query(
      "SELECT 1 AS ok FROM schema_migrations WHERE name = $1",
      [file],
    );
    if (rows.length > 0) continue;

    const fullPath = path.join(migrationsDir, file);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `file` comes from `fs.readdir(migrationsDir)`, not user input; path is server-controlled.
    const sql = (await fs.readFile(fullPath, "utf8")).trim();
    if (!sql) continue;

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      logger.info({ msg: "migration_applied", file });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
}

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await runPendingSqlMigrations(client);
  } finally {
    // Best-effort відпускання advisory-lock. Якщо pg_advisory_lock ніколи
    // не викликався (наприклад, connect впав), unlock поверне false і не
    // кине. Release клієнта — окремо у finally, щоб lock не "зависнув"
    // поки pg не задетектить дропнуту сесію.
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [
        MIGRATIONS_ADVISORY_LOCK_KEY.toString(),
      ]);
    } catch {
      /* сесія однаково release-ається нижче */
    }
    client.release();
  }
}

export { pool };
export default pool;
