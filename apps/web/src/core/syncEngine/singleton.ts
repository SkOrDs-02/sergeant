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
  ] = await Promise.all([
    import("../db/sqlite"),
    import("@shared/api"),
    import("../observability/sentry"),
    import("@sergeant/db-schema/sqlite"),
  ]);

  const db = await getSqliteDb();
  const client = db.migrationClient();

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
