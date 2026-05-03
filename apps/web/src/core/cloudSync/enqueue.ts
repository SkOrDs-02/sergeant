/**
 * Cloud-sync queue layer — single entry point for "a local change just
 * happened on web".
 *
 * This module is the explicit replacement for the old
 * `localStorage.setItem` monkey-patch that lived at `./storagePatch.ts`
 * before PR #008. The patch installed a one-time global wrapper around
 * `localStorage.setItem` / `removeItem` and called `enqueueChange(key)`
 * from inside it for any tracked sync key. That meant any code path
 * that touched `localStorage` — production helpers, tests, third-party
 * libraries — would auto-mark sync modules dirty whether the author
 * intended to opt into sync or not, and the only signal of opt-in was
 * a `__hubSyncPatched` flag on `window`.
 *
 * After PR #008 the contract is the opposite: only writes that go
 * through `syncedKV` (see `apps/web/src/shared/lib/storage/syncedKV.ts`
 * — wraps `webKVStore` via `createSyncedKVStore` from
 * `@sergeant/shared`) call `enqueueChange`. Direct `localStorage.setItem`
 * — which now lives only in cloud-sync internals (`state/moduleData.ts`
 * mirroring server pulls, `state/dirtyModules.ts`/`versions.ts`/
 * `migration.ts` writing meta keys, plus a few legacy non-sync helpers
 * in `apps/web/src/shared/lib/storage`) — does **not** auto-enqueue.
 * Callers that still need to mark a module dirty without a value to
 * write (e.g. consumers that mutate state via a side-effecting helper)
 * keep calling `notifySyncDirty(key)` directly; new code should use
 * `enqueueChange`.
 */
import { ALL_TRACKED_KEYS, keyToModule } from "./config";
import { updateDebugSnapshot } from "./debugState";
import { syncLog } from "./logger";
// Side-effect import: ensure `dirtyModules` evaluates before any caller
// can fire `enqueueChange`, so its cross-tab `storage` listener is
// registered against an initialized module graph. The historical
// invariant (the `storagePatch` module imported `dirtyModules` first)
// is preserved.
import "./state/dirtyModules";
import { markModuleDirty } from "./state/dirtyModules";
import { emitSyncEvent } from "./state/events";

/**
 * Raw `localStorage.removeItem` reference, captured at module load time
 * before any future global proxy could shadow it. Kept exported so
 * `clearSyncManagedData` (`state/moduleData.ts`) can wipe a previous
 * user's slice without re-firing `enqueueChange` for every key it
 * deletes — important for the user-switch flow inside
 * `hook/useInitialSyncOnUser.ts`.
 *
 * Once PR #008 removed the `setItem` monkey-patch this is technically
 * always equal to `localStorage.removeItem`, but keeping it as an
 * explicit import preserves the "the sync layer holds its own raw
 * handle" contract for any future helper that wraps `removeItem`.
 */
export const rawRemoveItem: (key: string) => void =
  typeof localStorage !== "undefined"
    ? localStorage.removeItem.bind(localStorage)
    : () => {};

/**
 * Public "a tracked key just changed" entry point.
 *
 * If the changed key belongs to a tracked sync module, mark that module
 * dirty (persisted through `DIRTY_MODULES_KEY`). Always dispatch the
 * `SYNC_EVENT` so the scheduler layer can debounce and fire a sync.
 * Keeping this as the one place that writes to the dirty map avoids
 * the duplication that existed earlier between the patched
 * `setItem`/`removeItem` and the public `notifySyncDirty` helper.
 */
export function enqueueChange(changedKey?: string): void {
  let module: string | null = null;
  if (changedKey && ALL_TRACKED_KEYS.has(changedKey)) {
    module = keyToModule(changedKey);
    if (module) markModuleDirty(module);
  }
  syncLog.enqueue({ key: changedKey, module });
  updateDebugSnapshot({ lastAction: "enqueue" });
  emitSyncEvent();
}

/**
 * Backward-compatibility alias — kept so existing consumers (tests in
 * `useCloudSync.behavior.test.ts`, `core/profile/memoryBank.ts`, etc.)
 * that import `notifySyncDirty` from the cloud-sync barrel keep working.
 * New code should call {@link enqueueChange} directly.
 */
export const notifySyncDirty = enqueueChange;
