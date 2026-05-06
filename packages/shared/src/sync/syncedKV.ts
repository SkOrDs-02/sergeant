/**
 * `createSyncedKVStore` — explicit replacement for the web `localStorage`
 * monkey-patch.
 *
 * Why this exists
 * ---------------
 * Until this module landed, web's cloud-sync layer relied on a one-time
 * patch installed at `apps/web/src/core/cloudSync/storagePatch.ts` that
 * mutated the global `localStorage.setItem` / `removeItem` so any write
 * to a tracked sync key would auto-call `enqueueChange(key)`. The patch
 * was invisible — call sites looked like ordinary `localStorage`
 * accesses, which made it both easy to add new sync-tracked writes (you
 * just had to know which keys were tracked) and easy to silently break
 * sync by reaching into `localStorage` after the patch was uninstalled
 * (e.g. in a vitest module that imported the cloud-sync barrel only on
 * demand). It also leaked a `__hubSyncPatched` global onto `window`.
 *
 * `createSyncedKVStore` collapses the two-step "write + enqueue" into a
 * single explicit `setString` / `remove` so any code path that wants
 * automatic dirty-marking has to opt in by holding a `KVStore` reference
 * — there is no global side-channel to forget about. It mirrors mobile's
 * `useSyncedStorage` (`apps/mobile/src/sync/useSyncedStorage.ts`) but
 * exposes a `KVStore`-shaped API so platform-agnostic helpers in
 * `@sergeant/shared/lib/*` can take it and write through it.
 *
 * Pattern recap
 * -------------
 *   ┌──────────────┐    setString(key,v)    ┌────────────┐
 *   │ caller (web) │ ─────────────────────► │ syncedKV   │
 *   └──────────────┘                        │ (this fn)  │
 *                                           └─────┬──────┘
 *                                                 │ base.setString(key,v)
 *                                                 ▼
 *                                        ┌────────────────┐
 *                                        │ webKVStore     │
 *                                        │ (localStorage) │
 *                                        └────────────────┘
 *                                                 │ if (isTracked(key))
 *                                                 ▼
 *                                          onChange(key)  → enqueueChange
 *
 * The factory is platform-agnostic — wire it with the web KV adapter
 * + cloud-sync `enqueueChange` on web, and (when mobile drops its
 * own ad-hoc `useSyncedStorage`) with the MMKV adapter + mobile
 * `enqueueChange` on mobile. Tests can pass `createMemoryKVStore()`
 * + a vi.fn().
 */
import type { KVStore, Unsubscribe } from "../storage/kv";

export interface SyncedKVOptions {
  /**
   * Called after a successful `setString` / `remove` on a tracked key.
   * Receives the key that changed; implementations are expected to
   * fire whatever sync-side bookkeeping is needed (mark module dirty,
   * emit `SYNC_EVENT`, etc.). Untracked keys never trigger this
   * callback — see {@link SyncedKVOptions.isTracked}.
   *
   * Implementations must be safe (swallow their own errors). The
   * factory does not wrap the call in try/catch so a throw here will
   * propagate to the caller — historically the web monkey-patch had
   * the same contract, since swallowing in `localStorage.setItem`
   * proxies hides real bugs (a sync layer that crashes on every
   * write is a louder failure than one that silently stops syncing).
   */
  onChange: (key: string) => void;
  /**
   * Returns `true` when writes to `key` should fire `onChange`. On web
   * and mobile this is `(key) => ALL_TRACKED_KEYS.has(key)` — see
   * `./modules.ts`. Untracked writes still go through to the base store
   * but do not trigger sync bookkeeping (the equivalent of the old
   * monkey-patch's `if (ALL_TRACKED_KEYS.has(key))` guard).
   */
  isTracked: (key: string) => boolean;
}

/**
 * Wraps a base `KVStore` so that `setString` / `remove` on tracked keys
 * additionally fires `opts.onChange(key)` after the underlying write
 * completes. `getString` and `onChange` (cross-tab subscription) are
 * passed through unchanged.
 *
 * The wrapping order matters: the base write fires first, then the
 * sync callback. This preserves the historical invariant that by the
 * time `enqueueChange` runs, the new value is already persisted —
 * the next push pass that reads the LS slot will see the latest data.
 *
 * @example
 *   const syncedKV = createSyncedKVStore(webKVStore, {
 *     onChange: enqueueChange,
 *     isTracked: (k) => ALL_TRACKED_KEYS.has(k),
 *   });
 *   syncedKV.setString(STORAGE_KEYS.NUTRITION_LOG, JSON.stringify(log));
 *   // ↑ writes localStorage; if NUTRITION_LOG is tracked, marks
 *   //   `nutrition` dirty and emits SYNC_EVENT.
 */
export function createSyncedKVStore(
  base: KVStore,
  opts: SyncedKVOptions,
): KVStore {
  return {
    getString(key: string): string | null {
      return base.getString(key);
    },
    setString(key: string, value: string): void {
      base.setString(key, value);
      if (opts.isTracked(key)) opts.onChange(key);
    },
    remove(key: string): void {
      base.remove(key);
      if (opts.isTracked(key)) opts.onChange(key);
    },
    listKeys(): string[] {
      return base.listKeys();
    },
    onChange(
      key: string,
      listener: (next: string | null) => void,
    ): Unsubscribe {
      return base.onChange(key, listener);
    },
  };
}
