/**
 * Mobile sync v2 writer + reader runtime singletons.
 *
 * Mirrors `apps/web/src/core/syncEngine/singleton.ts` — same
 * `bootSyncEngineWriter` / `getSyncEngineWriter` and
 * `bootSyncEngineReader` / `getSyncEngineReader` surface so any code
 * that needs to nudge the writer (`runtime.notifyEnqueued()`,
 * status reads, etc.) or trigger a pull can rely on a single boot path.
 *
 * Differences vs web:
 *   - Resolves the migration client through
 *     `getSqliteMigrationClient()` instead of
 *     `getSqliteDb().migrationClient()`.
 *   - Uses the mobile `apiClient` instance from `@/api/apiClient`.
 *   - Sentry is the React Native SDK (`apps/mobile/src/lib/observability.ts`).
 *   - Writer reconnect listens via NetInfo (`createNetInfoEventTarget`)
 *     with `kind: 'online'` only.
 *   - Reader foreground listens via an AppState-backed event target that
 *     emits `"visibilitychange"` when `AppState === "active"` (replaces
 *     `document.visibilityState` from the web version).
 *
 * @see docs/planning/storage-roadmap.md (Stage 5 mobile writer wiring)
 */
import {
  resolveOriginDeviceId,
  sweepStaleTerminalOutbox,
} from "@sergeant/shared";
import type { RecoverDeadLetterSelector } from "@sergeant/db-schema/sqlite";

import { mobileKVStore } from "@/lib/storage";

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

export function __resetSyncEngineWriterForTests(): void {
  runtime?.stop();
  runtime = null;
  inFlight = null;
  readerRuntime?.stop();
  readerRuntime = null;
  readerInFlight = null;
}

async function createDefaultReaderRuntime(): Promise<SyncEngineReaderRuntime> {
  const [
    { getSqliteMigrationClient },
    { apiClient },
    observability,
    { authClient },
    AppStateModule,
  ] = await Promise.all([
    import("@/core/db/sqlite"),
    import("@/api/apiClient"),
    import("@/lib/observability"),
    import("@/auth/authClient"),
    import("react-native"),
  ]);

  const client = await getSqliteMigrationClient();

  const resolveUserId = async (): Promise<string | null> => {
    const session = await authClient.getSession();
    return session.data?.user?.id ?? null;
  };

  const originDeviceId = resolveOriginDeviceId({ store: mobileKVStore });
  const pullIntervalMs = randomizeIntervalMs(60_000, 0.2);

  // AppState-backed event target: fires "visibilitychange" when the app
  // transitions to foreground ("active"). This replaces
  // `document.visibilityState` from the web version and gives the
  // reader a foreground-trigger pull in addition to the periodic timer.
  const appStateTarget = createAppStateEventTarget(AppStateModule.AppState);

  return createSyncEngineReaderRuntime({
    pull: (since, opts) =>
      apiClient.syncV2.pullV2(since, {
        limit: opts.limit,
        originDeviceId: opts.originDeviceId,
      }),
    resolveClient: async () => client,
    resolveUserId,
    originDeviceId,
    setInterval: (handler, ms) =>
      (globalThis.setInterval as (h: () => void, ms: number) => unknown)(
        handler,
        ms,
      ),
    clearInterval: (handle) =>
      (globalThis.clearInterval as (h: unknown) => void)(handle),
    eventTarget: appStateTarget,
    intervalMs: pullIntervalMs,
    limit: 100,
    captureException: (error, context) =>
      observability.captureError(error, context),
  });
}

async function createDefaultRuntime(): Promise<SyncEngineWriterRuntime> {
  const [
    { getSqliteMigrationClient },
    { apiClient },
    observability,
    dbSchema,
    netInfoModule,
    netInfoBridge,
    { authClient },
  ] = await Promise.all([
    import("@/core/db/sqlite"),
    import("@/api/apiClient"),
    import("@/lib/observability"),
    import("@sergeant/db-schema/sqlite"),
    import("@react-native-community/netinfo"),
    import("./netInfoEventTarget"),
    import("@/auth/authClient"),
  ]);

  const client = await getSqliteMigrationClient();

  await sweepStaleTerminalOutbox({
    purge: () =>
      dbSchema.purgeStaleTerminalOutbox(client, {
        olderThanDays: dbSchema.SYNC_OP_OUTBOX_STALE_TTL_DAYS,
      }),
    addBreadcrumb: observability.addSentryBreadcrumb,
    captureException: (error, context) =>
      observability.captureError(error, context),
  });

  const eventTarget = netInfoBridge.createNetInfoEventTarget(
    netInfoModule.default,
  );

  const resolveUserId = async (): Promise<string | null> => {
    const session = await authClient.getSession();
    return session.data?.user?.id ?? null;
  };

  const originDeviceId = resolveOriginDeviceId({ store: mobileKVStore });
  const intervalMs = randomizeIntervalMs(30_000, 0.2);

  const onOutboxQuarantine = (event: {
    readonly id: number;
    readonly tableName: string;
    readonly op: string;
    readonly reason: string;
  }): void => {
    observability.addSentryBreadcrumb({
      category: "sync",
      level: "warning",
      message: `sync_op_outbox.quarantine id=${event.id} table=${event.tableName} op=${event.op} reason=${event.reason}`,
    });
  };

  return createSyncEngineWriterRuntime({
    pushDeps: {
      drain: async (drainOptions) => {
        const userId = await resolveUserId();
        if (!userId) return [];
        return dbSchema.drainSyncOpOutbox(client, {
          ...drainOptions,
          userId,
          onQuarantine: onOutboxQuarantine,
        });
      },
      push: (ops, pushOptions) => apiClient.syncV2.pushV2(ops, pushOptions),
      markSuccess: (id) => dbSchema.markOutboxSuccess(client, id),
      markRetry: (id, plan) => dbSchema.markOutboxRetry(client, id, plan),
      markRejected: (id, reason) =>
        dbSchema.markOutboxRejected(client, id, reason),
      planRetry: dbSchema.planRetry,
      now: () => new Date(),
      jitterMs: () => Math.random() * dbSchema.SYNC_OP_JITTER_WINDOW_MS,
    },
    setInterval: (handler, ms) =>
      (globalThis.setInterval as (h: () => void, ms: number) => unknown)(
        handler,
        ms,
      ),
    clearInterval: (handle) =>
      (globalThis.clearInterval as (h: unknown) => void)(handle),
    eventTarget,
    getStatus: () => dbSchema.countOutboxByStatus(client),
    recoverDeadLetter: (selector: RecoverDeadLetterSelector) =>
      dbSchema.recoverDeadLetter(client, selector),
    addBreadcrumb: observability.addSentryBreadcrumb,
    captureException: (error, context) =>
      observability.captureError(error, context),
    intervalMs,
    limit: 100,
    originDeviceId,
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
 * Minimal AppState-backed event target for the reader.
 * Fires "visibilitychange" listeners when the app becomes active
 * (foreground), mirroring `document.visibilityState === "visible"` on web.
 */
function createAppStateEventTarget(AppState: {
  addEventListener: (
    type: "change",
    listener: (state: string) => void,
  ) => { remove: () => void };
}): {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
} {
  const visibilityListeners = new Set<() => void>();
  let subscription: { remove: () => void } | null = null;

  const ensureSubscription = (): void => {
    if (subscription !== null) return;
    subscription = AppState.addEventListener("change", (state: string) => {
      if (state === "active" && visibilityListeners.size > 0) {
        for (const listener of [...visibilityListeners]) {
          try {
            listener();
          } catch {
            /* listener faults must not break siblings */
          }
        }
      }
    });
  };

  const teardownIfIdle = (): void => {
    if (visibilityListeners.size === 0 && subscription !== null) {
      subscription.remove();
      subscription = null;
    }
  };

  return {
    addEventListener(type: string, listener: () => void): void {
      if (type !== "visibilitychange") return;
      visibilityListeners.add(listener);
      ensureSubscription();
    },
    removeEventListener(type: string, listener: () => void): void {
      if (type !== "visibilitychange") return;
      visibilityListeners.delete(listener);
      teardownIfIdle();
    },
  };
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
