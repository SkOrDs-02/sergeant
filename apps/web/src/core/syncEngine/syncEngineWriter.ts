import {
  createSyncEngineFlushOnReconnect,
  createSyncEnginePushScheduler,
  type SyncEngineEventTarget,
  type SyncEngineFlushOnReconnect,
  type SyncEnginePushDeps,
  type SyncEnginePushResult,
  type SyncEnginePushScheduler,
  type SyncEnginePushSchedulerDeps,
  type SyncEnginePushSchedulerOptions,
} from "@sergeant/api-client";
import type {
  RecoverDeadLetterResult,
  RecoverDeadLetterSelector,
  SyncOpOutboxStatusCounts,
} from "@sergeant/db-schema/sqlite";

export interface SentryBreadcrumb {
  readonly category: string;
  readonly level: "debug" | "info" | "warning" | "error";
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

export interface SyncEngineWriterRuntime {
  start(): void;
  stop(): void;
  flushNow(): Promise<SyncEnginePushResult>;
  notifyEnqueued(): void;
  getStatus(): Promise<SyncOpOutboxStatusCounts>;
  recoverAllDeadLetters(): Promise<RecoverDeadLetterResult>;
}

export interface SyncEngineWriterDeps {
  readonly pushDeps: SyncEnginePushDeps;
  readonly setInterval: (handler: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  readonly eventTarget: SyncEngineEventTarget;
  readonly getStatus: () => Promise<SyncOpOutboxStatusCounts>;
  readonly recoverDeadLetter: (
    selector: RecoverDeadLetterSelector,
  ) => Promise<RecoverDeadLetterResult>;
  readonly addBreadcrumb?: (breadcrumb: SentryBreadcrumb) => void;
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
  readonly createScheduler?: (
    deps: SyncEnginePushSchedulerDeps,
    options: SyncEnginePushSchedulerOptions,
  ) => SyncEnginePushScheduler;
  readonly createReconnect?: (
    deps: {
      readonly target: SyncEngineEventTarget;
      readonly scheduler: Pick<SyncEnginePushScheduler, "flushNow">;
      readonly onFlushError?: (err: unknown) => void;
      readonly onFlushComplete?: (result: SyncEnginePushResult) => void;
      readonly isDocumentVisible?: () => boolean;
    },
    options: { readonly kind: "both" },
  ) => SyncEngineFlushOnReconnect;
  readonly intervalMs: number;
  readonly limit: number;
  readonly originDeviceId?: string;
}

export function createSyncEngineWriterRuntime(
  deps: SyncEngineWriterDeps,
): SyncEngineWriterRuntime {
  let scheduler: SyncEnginePushScheduler | null = null;
  let reconnect: SyncEngineFlushOnReconnect | null = null;
  let started = false;

  const addBreadcrumb = deps.addBreadcrumb;
  const captureException = deps.captureException;

  const onTickComplete = (result: SyncEnginePushResult) => {
    addBreadcrumb?.({
      category: "sync.v2.push",
      level: "info",
      message: "sync v2 push tick complete",
      data: toBreadcrumbData(result),
    });
  };

  const onTickError = (error: unknown) => {
    captureException?.(error, { scope: "sync-v2-push-tick" });
  };

  const onSkippedTick = () => {
    addBreadcrumb?.({
      category: "sync.v2.push",
      level: "debug",
      message: "sync v2 push tick skipped while in flight",
    });
  };

  const ensureScheduler = (): SyncEnginePushScheduler => {
    if (scheduler) return scheduler;
    const createScheduler =
      deps.createScheduler ?? createSyncEnginePushScheduler;
    const options: SyncEnginePushSchedulerOptions =
      deps.originDeviceId === undefined
        ? { intervalMs: deps.intervalMs, limit: deps.limit }
        : {
            intervalMs: deps.intervalMs,
            limit: deps.limit,
            originDeviceId: deps.originDeviceId,
          };
    scheduler = createScheduler(
      {
        push: deps.pushDeps,
        setInterval: deps.setInterval,
        clearInterval: deps.clearInterval,
        onTickComplete,
        onTickError,
        onSkippedTick,
      },
      options,
    );
    return scheduler;
  };

  const ensureReconnect = (): SyncEngineFlushOnReconnect => {
    if (reconnect) return reconnect;
    const createReconnect =
      deps.createReconnect ?? createSyncEngineFlushOnReconnect;
    reconnect = createReconnect(
      {
        target: deps.eventTarget,
        scheduler: ensureScheduler(),
        onFlushError: (error) =>
          captureException?.(error, { scope: "sync-v2-flush-on-reconnect" }),
        onFlushComplete: onTickComplete,
        isDocumentVisible: () =>
          typeof document !== "undefined" &&
          document.visibilityState === "visible",
      },
      { kind: "both" },
    );
    return reconnect;
  };

  const flushAndReport = (scope: string): void => {
    ensureScheduler()
      .flushNow()
      .catch((error: unknown) => {
        captureException?.(error, { scope });
      });
  };

  return {
    start(): void {
      if (started) return;
      started = true;
      ensureScheduler().start();
      ensureReconnect();
    },
    stop(): void {
      if (!started) return;
      started = false;
      scheduler?.stop();
      reconnect?.dispose();
      reconnect = null;
    },
    flushNow(): Promise<SyncEnginePushResult> {
      return ensureScheduler().flushNow();
    },
    notifyEnqueued(): void {
      flushAndReport("sync-v2-push-on-enqueue");
    },
    getStatus(): Promise<SyncOpOutboxStatusCounts> {
      return deps.getStatus();
    },
    async recoverAllDeadLetters(): Promise<RecoverDeadLetterResult> {
      const result = await deps.recoverDeadLetter({ all: true });
      await ensureScheduler().flushNow();
      return result;
    },
  };
}

function toBreadcrumbData(
  result: SyncEnginePushResult,
): Record<string, number> {
  return {
    drained: result.drained,
    pushed: result.pushed,
    retried: result.retried,
    rejected: result.rejected,
  };
}
