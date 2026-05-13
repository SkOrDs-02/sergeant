/**
 * Mobile sync v2 writer-runtime singleton.
 *
 * Mirrors `apps/web/src/core/syncEngine/singleton.ts` — same
 * `bootSyncEngineWriter` / `getSyncEngineWriter` surface so any code
 * that needs to nudge the writer (`runtime.notifyEnqueued()`,
 * status reads, etc.) can rely on a single boot path.
 *
 * Differences vs web:
 *   - Resolves the migration client through
 *     `getSqliteMigrationClient()` instead of
 *     `getSqliteDb().migrationClient()` (mobile exposes the migrate
 *     handle directly; see `apps/mobile/src/core/db/sqlite.ts`).
 *   - Uses the mobile `apiClient` instance from
 *     `@/api/apiClient` (web binds via `@shared/api`).
 *   - Sentry is the React Native SDK (`apps/mobile/src/lib/observability.ts`).
 *   - Reconnect listens via NetInfo (`createNetInfoEventTarget`)
 *     with `kind: 'online'` only — React Native has no
 *     `document.visibilityState` so the visibility branch from web
 *     would never fire.
 *
 * @see docs/planning/storage-roadmap.md (Stage 5 mobile writer wiring)
 */
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
  const eventTarget = netInfoBridge.createNetInfoEventTarget(
    netInfoModule.default,
  );

  // Per-tick userId resolver. The runtime itself is user-agnostic; the
  // drain wrapper closes over `authClient.getSession()` to scope reads
  // to the currently signed-in user (Hard finding T3#2). When no user
  // is signed in we return an empty drain — the next tick will retry.
  const resolveUserId = async (): Promise<string | null> => {
    const session = await authClient.getSession();
    return session.data?.user?.id ?? null;
  };

  return createSyncEngineWriterRuntime({
    pushDeps: {
      drain: async (drainOptions) => {
        const userId = await resolveUserId();
        if (!userId) return [];
        return dbSchema.drainSyncOpOutbox(client, { ...drainOptions, userId });
      },
      push: (ops, pushOptions) => apiClient.syncV2.pushV2(ops, pushOptions),
      markSuccess: (id) => dbSchema.markOutboxSuccess(client, id),
      markRetry: (id, plan) => dbSchema.markOutboxRetry(client, id, plan),
      markRejected: (id, reason) =>
        dbSchema.markOutboxRejected(client, id, reason),
      planRetry: dbSchema.planRetry,
      now: () => new Date(),
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
    intervalMs: 30_000,
    limit: 100,
  });
}
