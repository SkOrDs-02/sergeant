import type { RecoverDeadLetterSelector } from "@sergeant/db-schema/sqlite";

import { classifyOutboxBootOutcome } from "./outboxBoot";
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
    { getSession },
  ] = await Promise.all([
    import("../db/sqlite"),
    import("@shared/api"),
    import("../observability/sentry"),
    import("@sergeant/db-schema/sqlite"),
    import("@sergeant/db-schema/migrate/runner"),
    import("@sergeant/db-schema/migrate/sqlite"),
    import("../auth/authClient"),
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
  //
  // Кожен boot тегує `outbox.boot.outcome` у Sentry
  // (`fresh|already_present|repaired|failed`) + `outbox.boot.legacy_seen`
  // — це робить регресію SERGEANT-WEB-A прямо filter-able у saved
  // search-і навіть якщо помилка прилітає не у самому boot-у, а
  // через 30 секунд у періодичному drain-і (тег глобальний, тож
  // успадковується усіма наступними events у сесії).

  // Pre-state snapshot: перед першим write-ом у схему фіксуємо що
  // саме було на диску. Розрізняємо "вже-мігрована БД" vs "свіжий
  // user" vs "post-002 corruption" — інакше всі три зливаються
  // в один тег і diagnostic value губиться.
  let hadLegacy = false;
  try {
    const initialTables = await client.all<{ name: string }>(
      `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('sync_op_outbox', 'sync_op_outbox_legacy')`,
    );
    const hadOutbox = initialTables.some((r) => r.name === "sync_op_outbox");
    hadLegacy = initialTables.some((r) => r.name === "sync_op_outbox_legacy");

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

    sentry.setSentryTag(
      "outbox.boot.outcome",
      classifyOutboxBootOutcome({ hadOutbox, recovered: repaired.recovered }),
    );
    sentry.setSentryTag("outbox.boot.legacy_seen", String(hadLegacy));
  } catch (err) {
    // Tagging *before* re-throwing is intentional: the
    // `bootSyncEngineWriter` catch arm forwards to
    // `captureException`, and the global tag we set here ends up on
    // that event (and any later events in the same session). Saved
    // search `outbox.boot.outcome:failed` therefore catches both the
    // direct boot exception and any downstream
    // `no such table: sync_op_outbox` surfaced by callers that ran
    // before this boot resolved.
    sentry.setSentryTag("outbox.boot.outcome", "failed");
    sentry.setSentryTag("outbox.boot.legacy_seen", String(hadLegacy));
    throw err;
  }

  // Per-tick userId resolver. The runtime itself is user-agnostic; the
  // drain wrapper closes over `authClient.getSession()` to scope reads
  // to the currently signed-in user (Hard finding T3#2: prevents
  // shared-device session-swap from pushing user A's queued ops under
  // user B's session cookie). When no user is signed in we return an
  // empty drain — the next tick will try again.
  const resolveUserId = async (): Promise<string | null> => {
    const session = await getSession();
    return session.data?.user?.id ?? null;
  };

  return createSyncEngineWriterRuntime({
    pushDeps: {
      drain: async (options) => {
        const userId = await resolveUserId();
        if (!userId) return [];
        return dbSchema.drainSyncOpOutbox(client, { ...options, userId });
      },
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
