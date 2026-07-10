import type { SyncV2PullResponse } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyPullOp } from "./applyPullOp.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";
import { refreshCachesAfterPull } from "./refreshCachesAfterPull.js";

export interface SyncEnginePullResult {
  readonly pulled: number;
  readonly applied: number;
  readonly skipped: number;
  readonly rejected: number;
  readonly lastOpId: number;
}

export interface SyncEngineReaderRuntime {
  start(): void;
  stop(): void;
  pullOnce(): Promise<SyncEnginePullResult>;
}

export interface SyncEngineReaderDeps {
  readonly pull: (
    since: number,
    options: { limit: number; originDeviceId: string },
  ) => Promise<SyncV2PullResponse>;
  readonly resolveClient: () => Promise<SqliteMigrationClient>;
  readonly resolveUserId: () => Promise<string | null>;
  readonly originDeviceId: string;
  readonly setInterval: (handler: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  readonly eventTarget: {
    addEventListener: (
      type: string,
      listener: () => void,
      options?: { passive?: boolean },
    ) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };
  readonly intervalMs: number;
  readonly limit: number;
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
}

export function createSyncEngineReaderRuntime(
  deps: SyncEngineReaderDeps,
): SyncEngineReaderRuntime {
  let intervalHandle: unknown = null;
  let inflight: Promise<SyncEnginePullResult> | null = null;
  let started = false;

  const pullOnce = async (): Promise<SyncEnginePullResult> => {
    if (inflight) return inflight;

    inflight = (async () => {
      const userId = await deps.resolveUserId();
      if (!userId) {
        return {
          pulled: 0,
          applied: 0,
          skipped: 0,
          rejected: 0,
          lastOpId: 0,
        };
      }

      const client = await deps.resolveClient();
      let since = await readPullSinceCursor(client);
      let pulled = 0;
      let applied = 0;
      let skipped = 0;
      let rejected = 0;
      let maxOpId = since;
      const affectedTables = new Set<string>();

      for (;;) {
        const page = await deps.pull(since, {
          limit: deps.limit,
          originDeviceId: deps.originDeviceId,
        });

        for (const op of page.ops) {
          pulled += 1;
          maxOpId = Math.max(maxOpId, op.id);
          const outcome = await applyPullOp(
            client,
            op,
            userId,
            deps.originDeviceId,
          );
          if (outcome === "applied") {
            applied += 1;
            affectedTables.add(op.table);
          } else if (outcome === "skipped") {
            skipped += 1;
          } else {
            rejected += 1;
          }
        }

        if (page.ops.length > 0) {
          since = maxOpId;
          await writePullSinceCursor(client, maxOpId);
        }

        if (page.next_cursor === null) break;
        since = page.next_cursor;
      }

      if (applied > 0) {
        await refreshCachesAfterPull(client, userId, affectedTables);
      }

      return {
        pulled,
        applied,
        skipped,
        rejected,
        lastOpId: maxOpId,
      };
    })()
      .catch((error: unknown) => {
        deps.captureException?.(error, { scope: "sync-v2-pull-tick" });
        throw error;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  };

  const scheduleTick = (): void => {
    void pullOnce().catch(() => {
      /* errors routed via captureException */
    });
  };

  const onVisibility = (): void => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      scheduleTick();
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      scheduleTick();
      intervalHandle = deps.setInterval(scheduleTick, deps.intervalMs);
      deps.eventTarget.addEventListener("visibilitychange", onVisibility);
    },
    stop() {
      if (!started) return;
      started = false;
      if (intervalHandle !== null) {
        deps.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      deps.eventTarget.removeEventListener("visibilitychange", onVisibility);
    },
    pullOnce,
  };
}
