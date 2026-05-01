/**
 * React Query persister backed by MMKV.
 *
 * `@tanstack/query-sync-storage-persister` expects a storage object
 * with `getItem`/`setItem`/`removeItem` methods that return strings
 * synchronously. MMKV fits perfectly: all I/O is synchronous in-process
 * and values are flat strings, so the warm-start path is fast (no
 * `await` on every query rehydrate) and avoids the serialization
 * costs of the AsyncStorage-backed persister.
 *
 * We expose three entry points:
 *   - `createMMKVPersister()` — ready-to-pass `persister` option for
 *     `PersistQueryClientProvider`.
 *   - `mmkvSyncStorage` — raw storage adapter, re-usable for other
 *     persisted stores in the future (e.g. a Jotai store).
 *   - `shouldDehydrateQueryForPersistMobile` — selector for
 *     `dehydrateOptions.shouldDehydrateQuery`, mirrors the web
 *     persister's filter (no errors, no pre-success queries, and no
 *     sensitive auth/me/coach/sync/balance feeds — see PR #004 in
 *     `docs/planning/storage-roadmap.md`).
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";
import { isSensitiveQueryKey } from "@sergeant/shared";

import {
  _getMMKVInstance,
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@/lib/storage";
import { QUERY_CACHE_KEY } from "../config";

export const mmkvSyncStorage = {
  getItem: (key: string): string | null => safeReadStringLS(key),
  setItem: (key: string, value: string): void => {
    safeWriteLS(key, value);
  },
  removeItem: (key: string): void => {
    safeRemoveLS(key);
  },
};

export function createMMKVPersister() {
  return createSyncStoragePersister({
    storage: mmkvSyncStorage,
    key: QUERY_CACHE_KEY,
    // Throttle disk writes so a burst of query updates doesn't spam
    // MMKV. 1s matches TanStack's own default.
    throttleTime: 1000,
  });
}

/**
 * Mirror of `apps/web/src/shared/lib/queryClientPersister.ts ->
 * shouldDehydrateQueryForPersist`. Filters out:
 *
 *   - errored queries (a stale 401/500 would warm-start the next
 *     launch with a "red" UI before the network can correct it);
 *   - queries that haven't received a successful response yet
 *     (`dataUpdateCount === 0`) — saving a placeholder is just disk
 *     waste;
 *   - sensitive query-keys (auth / me / coach / sync / *balance*) —
 *     personally-identifying data must not survive on disk after
 *     logout. The persister is keyed by build-id, not user-id, so a
 *     handover of the same device to another user would warm-start
 *     the new session with the previous user's coach advice / mono
 *     balance / `module_data` JSONB. The shared block-list is in
 *     `@sergeant/shared` `isSensitiveQueryKey`.
 */
export function shouldDehydrateQueryForPersistMobile(query: Query): boolean {
  if (query.state.status === "error") return false;
  if (query.state.dataUpdateCount === 0) return false;
  if (isSensitiveQueryKey(query.queryKey)) return false;
  return true;
}

// Re-export to make it easy for tests / debug screens to poke at the
// underlying MMKV instance without reaching into `@/lib/storage`.
export { _getMMKVInstance };
