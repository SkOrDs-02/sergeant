import type { RecoverDeadLetterSelector } from "@sergeant/db-schema/sqlite";

import {
  createSyncEngineWriterRuntime,
  type SyncEngineWriterRuntime,
} from "./syncEngineWriter";

type RuntimeFactory = () => Promise<SyncEngineWriterRuntime>;

export interface BootSyncEngineWriterOptions {
  readonly createRuntime?: RuntimeFactory;
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
}

let runtime: SyncEngineWriterRuntime | null = null;
let inFlight: Promise<SyncEngineWriterRuntime | null> | null = null;

export function getSyncEngineWriter(): SyncEngineWriterRuntime | null {
  return runtime;
}

export function bootSyncEngineWriter(
  options: BootSyncEngineWriterOptions = {},
): Promise<SyncEngineWriterRuntime | null> {
  if (runtime) return Promise.resolve(runtime);
  if (inFlight) return inFlight;

  const createRuntime = options.createRuntime ?? createDefaultRuntime;
  const captureException = options.captureException;

  inFlight = createRuntime()
    .then((created) => {
      runtime = created;
      runtime.start();
      return runtime;
    })
    .catch((error: unknown) => {
      captureException?.(error, { scope: "sync-v2-writer-boot" });
      return null;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function __resetSyncEngineWriterForTests(): void {
  runtime?.stop();
  runtime = null;
  inFlight = null;
}

async function createDefaultRuntime(): Promise<SyncEngineWriterRuntime> {
  if (typeof window === "undefined") {
    throw new Error("sync v2 writer boot requires a browser window");
  }

  const [
    { getSqliteDb },
    { apiClient },
    sentry,
    dbSchema,
    { runMigrations },
    { createSqliteAdapter },
  ] = await Promise.all([
    import("../db/sqlite"),
    import("@shared/api"),
    import("../observability/sentry"),
    import("@sergeant/db-schema/sqlite"),
    import("@sergeant/db-schema/migrate/runner"),
    import("@sergeant/db-schema/migrate/sqlite"),
  ]);

  const db = await getSqliteDb();
  const client = db.migrationClient();

  // `sync_op_outbox` лежить у `ROUTINE_CLIENT_MIGRATIONS` (історично —
  // створене у `001_routine_spike.sql` як перша таблиця SPIKE-у). Раніше
  // воно матеріалізувалося лише після того, як юзер відкривав routine-tab
  // (там `migrateRoutine` бігає у `sqliteReadBoot`). Але `bootSyncEngineWriter`
  // фає 30s-інтервал `drain` із `main.tsx` ще до того, як юзер взагалі
  // зайде на сторінку — і `SELECT … FROM sync_op_outbox` валив `no such
  // table` у Sentry (WEB-A, 2026-05-07). Прогон міграцій тут — idempotent
  // (`__migrations` ledger), тож повторні виклики на вже-мігровану БД
  // — no-op. Тримаємо `await` всередині `createDefaultRuntime`, щоб
  // `bootSyncEngineWriter`-овий catch-all обгортав і цей шлях.
  //
  // Перед самим прогоном — `repairPartialOutboxMigration`. Audit
  // `docs/audits/2026-05-07-app-audit.md` §A1 показав, що частина
  // sqlite-wasm OPFS-клієнтів зависла у corrupted post-002 стейті
  // (`sync_op_outbox_legacy` лишився, `sync_op_outbox` зник). Звичайний
  // re-run runner-а на такому DB вилітає на першому ALTER 002-ї.
  // Helper — idempotent: на здоровій або свіжій БД — no-op.
  const repaired = await dbSchema.repairPartialOutboxMigration(client, {
    ledgerTable: dbSchema.ROUTINE_MIGRATIONS_TABLE,
  });
  if (repaired.recovered) {
    sentry.addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: "sqlite: recovered sync_op_outbox from partial 002 migration",
    });
  }

  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: dbSchema.ROUTINE_CLIENT_MIGRATIONS,
    tableName: dbSchema.ROUTINE_MIGRATIONS_TABLE,
  });

  // Post-migration smoke check: if `sync_op_outbox` is still missing
  // after the runner returned, something deeper than the
  // post-002 corruption is wrong (e.g. a brand-new failure mode in
  // sqlite-wasm). Throw a typed error here so the
  // `bootSyncEngineWriter`-owy catch-all routes it to Sentry with a
  // breadcrumb instead of letting the periodic drain surface a raw
  // `SQLITE_ERROR: no such table` 30s later (the original WEB-A
  // shape).
  const presentTables = await client.all<{ name: string }>(
    `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'sync_op_outbox'`,
  );
  if (presentTables.length === 0) {
    throw new Error(
      "sync_op_outbox missing after running ROUTINE_CLIENT_MIGRATIONS — " +
        "client SQLite did not converge on the expected schema",
    );
  }

  return createSyncEngineWriterRuntime({
    pushDeps: {
      drain: (options) => dbSchema.drainSyncOpOutbox(client, options),
      push: (ops, options) => apiClient.syncV2.pushV2(ops, options),
      markSuccess: (id) => dbSchema.markOutboxSuccess(client, id),
      markRetry: (id, plan) => dbSchema.markOutboxRetry(client, id, plan),
      markRejected: (id, reason) =>
        dbSchema.markOutboxRejected(client, id, reason),
      planRetry: dbSchema.planRetry,
      now: () => new Date(),
    },
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
    eventTarget: window,
    getStatus: () => dbSchema.countOutboxByStatus(client),
    recoverDeadLetter: (selector: RecoverDeadLetterSelector) =>
      dbSchema.recoverDeadLetter(client, selector),
    addBreadcrumb: sentry.addSentryBreadcrumb,
    captureException: (error, context) =>
      sentry.captureException(error, { extra: context }),
    intervalMs: 30_000,
    limit: 100,
  });
}
