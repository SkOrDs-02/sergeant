import {
  resolveOriginDeviceId,
  sweepStaleTerminalOutbox,
} from "@sergeant/shared";
import type { RecoverDeadLetterSelector } from "@sergeant/db-schema/sqlite";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { webKVStore } from "@shared/lib/storage/storage";

// Статичний імпорт навмисно: `authClient` і так eager (статично тягнеться
// `AuthContext`-ом у entry-chunk). Подвійний static+dynamic імпорт змушував
// rolldown виносити `authClient` в окремий chunk із циклічною залежністю на
// entry — у Vercel-збірці це падало TDZ-крахом (`r is not a function`) і
// валило весь рендер у проді.
import { getSession } from "../auth/authClient";

import { classifyOutboxBootOutcome } from "./outboxBoot";
import {
  createSyncEngineWriterRuntime,
  type SyncEngineWriterRuntime,
} from "./syncEngineWriter";
import {
  createSyncEngineReaderRuntime,
  type SyncEngineReaderRuntime,
} from "./syncEngineReader";

type RuntimeFactory = () => Promise<SyncEngineWriterRuntime>;
type ReaderRuntimeFactory = () => Promise<SyncEngineReaderRuntime>;

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
  readerRuntime?.stop();
  readerRuntime = null;
  readerInFlight = null;
}

export interface BootSyncEngineReaderOptions {
  readonly createRuntime?: ReaderRuntimeFactory;
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
}

let readerRuntime: SyncEngineReaderRuntime | null = null;
let readerInFlight: Promise<SyncEngineReaderRuntime | null> | null = null;

export function getSyncEngineReader(): SyncEngineReaderRuntime | null {
  return readerRuntime;
}

export function bootSyncEngineReader(
  options: BootSyncEngineReaderOptions = {},
): Promise<SyncEngineReaderRuntime | null> {
  if (readerRuntime) return Promise.resolve(readerRuntime);
  if (readerInFlight) return readerInFlight;

  const createRuntime = options.createRuntime ?? createDefaultReaderRuntime;
  const captureException = options.captureException;

  readerInFlight = createRuntime()
    .then((created) => {
      readerRuntime = created;
      readerRuntime.start();
      return readerRuntime;
    })
    .catch((error: unknown) => {
      captureException?.(error, { scope: "sync-v2-reader-boot" });
      return null;
    })
    .finally(() => {
      readerInFlight = null;
    });

  return readerInFlight;
}

async function createDefaultReaderRuntime(): Promise<SyncEngineReaderRuntime> {
  const shared = await createSyncSharedContext();
  const pullIntervalMs = randomizeIntervalMs(60_000, 0.2);

  return createSyncEngineReaderRuntime({
    pull: (since, opts) =>
      shared.apiClient.syncV2.pullV2(since, {
        limit: opts.limit,
        originDeviceId: opts.originDeviceId,
      }),
    resolveClient: shared.resolveClient,
    resolveUserId: shared.resolveUserId,
    originDeviceId: shared.originDeviceId,
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
    eventTarget: window,
    intervalMs: pullIntervalMs,
    limit: 100,
    captureException: shared.captureException,
  });
}

interface SyncSharedContext {
  readonly resolveClient: () => Promise<SqliteMigrationClient>;
  readonly resolveUserId: () => Promise<string | null>;
  readonly originDeviceId: string;
  readonly apiClient: typeof import("@shared/api").apiClient;
  readonly dbSchema: typeof import("@sergeant/db-schema/sqlite");
  readonly captureException: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
  readonly addBreadcrumb: (
    breadcrumb: import("./syncEngineWriter.js").SentryBreadcrumb,
  ) => void;
  readonly onOutboxQuarantine: (event: {
    readonly id: number;
    readonly tableName: string;
    readonly op: string;
    readonly reason: string;
  }) => void;
  readonly writerIntervalMs: number;
}

async function createSyncSharedContext(): Promise<SyncSharedContext> {
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

  // КРИТИЧНО: клієнт НЕ можна захопити один раз на boot. `main.tsx`
  // викликає `bootSyncEngineWriter` до того, як `AuthContext` резолвить
  // сесію, тож boot-овий `getSqliteDb()` відкриває **anon**-партицію.
  // Пізніше `setSqliteUser(userId)` ЗАКРИВАЄ цей handle і перемикає
  // синглтон на per-user БД — куди dual-write і кладе outbox-рядки.
  // Захоплений client лишався б навічно прикутим до закритої anon-БД:
  // drain читав би порожнечу (або кидав на закритому handle) і жоден
  // push не відбувався б. Тому кожна операція runtime-у резолвить
  // живий handle через `resolveClient()`; підготовка схеми (repair +
  // migrations + sweep) кешується per-handle у WeakMap і повторюється
  // лише після зміни партиції.
  const prepCache = new WeakMap<
    Awaited<ReturnType<typeof getSqliteDb>>,
    Promise<SqliteMigrationClient>
  >();

  const prepareClient = async (
    db: Awaited<ReturnType<typeof getSqliteDb>>,
  ): Promise<SqliteMigrationClient> => {
    const client = db.migrationClient();

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
          message:
            "sqlite: recovered sync_op_outbox from partial 002 migration",
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

    // Boot-time retention sweep: drop terminal `sync_op_outbox` rows
    // (dead_letter / rejected / quarantined) older than the TTL window so
    // the client DLQ cannot grow unbounded on a device that never
    // reconnects cleanly (docs/audits/2026-08-XX-sync-engine-roast.md).
    // Best-effort — `sweepStaleTerminalOutbox` swallows purge errors so a
    // maintenance failure never blocks the writer boot; a non-zero purge
    // emits a `sync_op_outbox.retention` breadcrumb for the Grafana
    // counter (same pattern as the quarantine breadcrumb below).
    await sweepStaleTerminalOutbox({
      purge: () =>
        dbSchema.purgeStaleTerminalOutbox(client, {
          olderThanDays: dbSchema.SYNC_OP_OUTBOX_STALE_TTL_DAYS,
        }),
      addBreadcrumb: sentry.addSentryBreadcrumb,
      captureException: (error, context) =>
        sentry.captureException(
          error,
          context !== undefined ? { extra: context } : undefined,
        ),
    });

    return client;
  };

  const resolveClient = (): Promise<SqliteMigrationClient> =>
    getSqliteDb().then((db) => {
      let prep = prepCache.get(db);
      if (!prep) {
        prep = prepareClient(db);
        prepCache.set(db, prep);
        // A failed prep must not poison the cache — drop it so the next
        // tick retries (mirrors the original "boot throws → next boot
        // retries" semantics, but per partition handle).
        prep.catch(() => prepCache.delete(db));
      }
      return prep;
    });

  // Boot-time prep keeps the original fail-fast contract: a broken
  // schema still rejects `createDefaultRuntime`, so the
  // `bootSyncEngineWriter` catch-all tags + reports it exactly as before.
  await resolveClient();

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

  // Stable per-install device id. Without this, every push lands on
  // the server with `origin_device_id = NULL`, and the pull/SSE filter
  // `WHERE origin_device_id IS DISTINCT FROM $3` with $3=NULL drops
  // every NULL-origin row (PG semantics: `NULL IS DISTINCT FROM NULL`
  // is FALSE). The id is persisted under
  // `STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID` via `webKVStore` so it
  // survives reloads, deploys, and the SQLite warm-cache hydration
  // (pre-bootstrap reads fall through to `localStorage`).
  const originDeviceId = resolveOriginDeviceId({ store: webKVStore });
  sentry.setSentryTag("sync.origin_device_id_present", "true");

  const writerIntervalMs = randomizeIntervalMs(30_000, 0.2);

  const onOutboxQuarantine = (event: {
    readonly id: number;
    readonly tableName: string;
    readonly op: string;
    readonly reason: string;
  }): void => {
    sentry.addSentryBreadcrumb({
      category: "sync",
      level: "warning",
      message: `sync_op_outbox.quarantine id=${event.id} table=${event.tableName} op=${event.op} reason=${event.reason}`,
    });
  };

  const captureException = (
    error: unknown,
    context?: Record<string, unknown>,
  ) =>
    sentry.captureException(
      error,
      context !== undefined ? { extra: context } : undefined,
    );

  return {
    resolveClient,
    resolveUserId,
    originDeviceId,
    apiClient,
    dbSchema,
    captureException,
    addBreadcrumb: sentry.addSentryBreadcrumb,
    onOutboxQuarantine,
    writerIntervalMs,
  };
}

async function createDefaultRuntime(): Promise<SyncEngineWriterRuntime> {
  const shared = await createSyncSharedContext();

  return createSyncEngineWriterRuntime({
    pushDeps: {
      drain: async (options) => {
        const userId = await shared.resolveUserId();
        if (!userId) return [];
        return shared.dbSchema.drainSyncOpOutbox(await shared.resolveClient(), {
          ...options,
          userId,
          onQuarantine: shared.onOutboxQuarantine,
        });
      },
      push: (ops, options) => shared.apiClient.syncV2.pushV2(ops, options),
      markSuccess: async (id) =>
        shared.dbSchema.markOutboxSuccess(await shared.resolveClient(), id),
      markRetry: async (id, plan) =>
        shared.dbSchema.markOutboxRetry(await shared.resolveClient(), id, plan),
      markRejected: async (id, reason) =>
        shared.dbSchema.markOutboxRejected(
          await shared.resolveClient(),
          id,
          reason,
        ),
      planRetry: shared.dbSchema.planRetry,
      now: () => new Date(),
      jitterMs: () => Math.random() * shared.dbSchema.SYNC_OP_JITTER_WINDOW_MS,
    },
    setInterval: (handler, ms) => window.setInterval(handler, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
    eventTarget: window,
    getStatus: async () =>
      shared.dbSchema.countOutboxByStatus(await shared.resolveClient()),
    recoverDeadLetter: async (selector: RecoverDeadLetterSelector) =>
      shared.dbSchema.recoverDeadLetter(await shared.resolveClient(), selector),
    addBreadcrumb: shared.addBreadcrumb,
    captureException: shared.captureException,
    intervalMs: shared.writerIntervalMs,
    limit: 100,
    originDeviceId: shared.originDeviceId,
    onTickComplete: (result) => {
      if (result.pushed > 0) {
        void bootSyncEngineReader().then((reader) => {
          void reader?.pullOnce();
        });
      }
    },
  });
}

/**
 * Returns `baseMs * (1 + uniform(-spread, +spread))`, clamped to a
 * positive integer. `spread=0.2` yields a value in `[baseMs*0.8,
 * baseMs*1.2]`. Used once per boot to desynchronize fleet-wide drain
 * ticks; not re-sampled across the lifetime of a runtime instance.
 */
function randomizeIntervalMs(baseMs: number, spread: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * spread;
  return Math.max(1, Math.floor(baseMs * factor));
}
