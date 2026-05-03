import { useCallback, useState } from "react";
import { initialSync } from "../engine/initialSync";
import { pullAll } from "../engine/pull";
import { pushAll, pushDirty } from "../engine/push";
import { uploadLocalData } from "../engine/upload";
import { markMigrationDone } from "../state/migration";
import type { CurrentUser, EngineArgs, SyncCallbacks } from "../types";
import { useEngineArgs } from "./useEngineArgs";
import { useInitialSyncOnUser } from "./useInitialSyncOnUser";
import { useSyncRetry } from "./useSyncRetry";

/**
 * Cloud-sync orchestrator. Three clearly-separated layers, read top-down:
 *
 *   1. Queue (where changes accumulate)
 *      Handled outside this hook — explicit writes through `syncedKV`
 *      (see `apps/web/src/shared/lib/storage/syncedKV.ts`) call
 *      `enqueueChange` after every write to a tracked key. That writes
 *      the dirty map and dispatches `SYNC_EVENT`. Until PR #008 the
 *      same plumbing was implemented as a one-time `localStorage.setItem`
 *      monkey-patch in `./storagePatch.ts`; the patch was removed in
 *      favor of the explicit hook.
 *
 *   2. Scheduler (when to run a sync)
 *      `useSyncRetry` wires three triggers — online / change-event /
 *      periodic timer — to the executor below.
 *
 *   3. Executor (how to actually call the API)
 *      The `run*` callbacks below each wrap one engine entry point in
 *      `runExclusive`, which combines the in-flight guard with freshly
 *      sync-id-bound lifecycle callbacks. This is what prevents a
 *      preempted engine (see `runUploadLocal`) from overwriting state
 *      belonging to a newer sync.
 *
 * Public state surface:
 *   - `state`       new explicit state-machine value
 *   - `isSyncing`   (legacy alias: `syncing`) — derived from `state`
 *   - `lastSyncAt`  (legacy alias: `lastSync`)
 *   - `hasError`    derived from `state`; legacy alias `syncError` still
 *                   exposes the raw message and `syncErrorDetail` exposes
 *                   the structured { type, retryable } shape.
 *   - `migrationPending` drives the first-run migration modal.
 */
export function useCloudSync(user: CurrentUser | null | undefined) {
  const [migrationPending, setMigrationPending] = useState(false);
  const { engineArgs, lifecycle } = useEngineArgs(user);
  const {
    isSyncing,
    lastSyncAt,
    hasError,
    syncing,
    lastSync,
    syncError,
    state,
    syncErrorDetail,
    runExclusive,
    runBypassed,
  } = lifecycle;

  // --- 3. Executor: API calls, each serialized through the in-flight
  // guard and invoked with sync-id-bound callbacks that no-op if a newer
  // sync supersedes this one.

  const withCb = useCallback(
    (cb: SyncCallbacks): EngineArgs => ({ ...engineArgs, ...cb }),
    [engineArgs],
  );

  const runSync = useCallback(
    () => runExclusive((cb) => pushDirty(withCb(cb)), undefined),
    [withCb, runExclusive],
  );

  const runPushAll = useCallback(
    () => runExclusive((cb) => pushAll(withCb(cb)), undefined),
    [withCb, runExclusive],
  );

  const runPullAll = useCallback(
    () => runExclusive((cb) => pullAll(withCb(cb)), false),
    [withCb, runExclusive],
  );

  const runInitialSync = useCallback(
    (): Promise<boolean> =>
      runExclusive(
        (cb) =>
          initialSync({
            ...withCb(cb),
            onNeedMigration: () => setMigrationPending(true),
          }),
        false,
      ),
    [withCb, runExclusive],
  );

  const runUploadLocal = useCallback(async () => {
    if (!user?.id) return;
    // Intentionally bypasses the in-flight guard: this is user-initiated
    // from the migration modal and must proceed even if a background
    // retry is mid-flight. `runBypassed` pairs the force-claim with a
    // fresh sync-id so stale callbacks from the preempted retry can't
    // overwrite the upload's lifecycle state.
    await runBypassed((cb) =>
      uploadLocalData({
        ...withCb(cb),
        onMigrated: () => setMigrationPending(false),
      }),
    );
  }, [user, withCb, runBypassed]);

  const skipMigration = useCallback(() => {
    if (!user?.id) return;
    markMigrationDone(user.id);
    setMigrationPending(false);
  }, [user]);

  const clearMigrationPending = useCallback(
    () => setMigrationPending(false),
    [],
  );

  // --- 2. Scheduler: subscribe the executor to online/change/periodic.

  useInitialSyncOnUser(user, runInitialSync, clearMigrationPending);
  useSyncRetry(!!user, runSync);

  return {
    // Explicit state names.
    isSyncing,
    lastSyncAt,
    hasError,
    state,
    syncErrorDetail,
    // Legacy aliases kept so existing consumers (App.tsx, tests) compile.
    syncing,
    lastSync,
    syncError,
    pushAll: runPushAll,
    pullAll: runPullAll,
    migrationPending,
    uploadLocalData: runUploadLocal,
    skipMigration,
  };
}
