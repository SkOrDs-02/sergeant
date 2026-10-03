/**
 * Mobile sync v2 reader runtime.
 *
 * Mirrors `apps/web/src/core/syncEngine/syncEngineReader.ts` with one
 * mobile-specific adaptation: the visibility handler does not check
 * `document.visibilityState` (no DOM on React Native). Instead the
 * singleton passes an AppState-backed event target that fires
 * `"visibilitychange"` events whenever the app transitions to the
 * foreground (`AppState === "active"`).
 *
 * @see apps/web/src/core/syncEngine/syncEngineReader.ts
 */
import type { SyncV2PullOp, SyncV2PullResponse } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyPullOp } from "./applyPullOp";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor";
import { refreshCachesAfterPull } from "./refreshCachesAfterPull";

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

/**
 * Відхилений на застосуванні оп — у Sentry, а не в тишу.
 *
 * `rejected` на pull означає передусім «таблиці немає в
 * `CLIENT_PULL_SUPPORTED_TABLES` ЦЬОГО білда», тобто клієнт старший за
 * сервер. Курсор при цьому просувається СВІДОМО: такий оп не стане
 * застосовним ніколи, тож притримування курсора застрягло б на ньому
 * назавжди і пристрій перестав би тягнути взагалі все — повна зупинка
 * синку замість часткової.
 *
 * Ціна такого рішення — дані, що не доїхали, лишаються непоміченими. Саме
 * так і сталось двічі (`fizruk_custom_activities`, `fizruk_injuries`):
 * проблема була не в тому, що оп відхилили, а в тому, що цього ніхто не
 * бачив. Один `captureException` із `table`/`op` закрив би обидва випадки
 * в день появи.
 *
 * `row` навмисно не передається (Hard Rule #21). Дзеркалить
 * `apps/web/src/core/syncEngine/syncEngineReader.ts`.
 */
function reportPullRejection(
  deps: SyncEngineReaderDeps,
  op: SyncV2PullOp,
): void {
  if (!deps.captureException) return;
  try {
    deps.captureException(
      new Error(`sync pull op rejected: ${op.table}.${op.op}`),
      {
        scope: "sync-v2-pull-apply",
        tags: {
          area: "sync",
          sync_direction: "pull",
          sync_table: op.table,
          sync_op: op.op,
        },
        opId: op.id,
      },
    );
  } catch {
    /* обсервабіліті ніколи не має ламати шлях читання */
  }
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
            reportPullRejection(deps, op);
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

  // Mobile: no document.visibilityState. The singleton passes an
  // AppState-backed event target that fires "visibilitychange" on
  // foreground transitions — we just schedule a tick unconditionally.
  const onForeground = (): void => {
    scheduleTick();
  };

  return {
    start() {
      if (started) return;
      started = true;
      scheduleTick();
      intervalHandle = deps.setInterval(scheduleTick, deps.intervalMs);
      deps.eventTarget.addEventListener("visibilitychange", onForeground);
    },
    stop() {
      if (!started) return;
      started = false;
      if (intervalHandle !== null) {
        deps.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      deps.eventTarget.removeEventListener("visibilitychange", onForeground);
    },
    pullOnce,
  };
}
