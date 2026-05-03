/**
 * IDB-backed durable store for cloud-sync bookkeeping (offline queue,
 * sync versions, dirty modules, last-modified timestamps). PR #009
 * from `docs/planning/storage-roadmap.md`.
 *
 * Why IDB instead of localStorage:
 *   - LS has a 5–10 MB per-origin cap; with `MAX_OFFLINE_QUEUE` raised
 *     to 10k entries, even a single coalesced push for a power user
 *     can cross that limit and fail with QuotaExceededError. IDB has
 *     no such practical cap (browser-imposed, but multi-GB).
 *   - LS writes block the main thread on JSON.stringify; IDB writes
 *     are async and off-thread.
 *
 * Why we still keep an in-memory cache + LS dual-write:
 *   - Existing call sites (`getOfflineQueue`, `addToOfflineQueue`, …)
 *     are sync. Rewriting every consumer to async would touch dozens
 *     of files; instead the cache becomes the sync source of truth and
 *     IDB becomes the durable mirror behind it (writes are
 *     fire-and-forget; reads come from cache).
 *   - LS dual-write is a best-effort backup for two niche cases:
 *       1. Safari Private Browsing — IDB is allowed but flushes on
 *          tab close; LS lasts until the session ends.
 *       2. Cold-start hydration before `hydrateFromIDB()` resolves —
 *          the first synchronous `getOfflineQueue()` after page load
 *          can read from LS instead of returning an empty queue.
 *     If the LS write hits QuotaExceededError it's swallowed by
 *     `safeWriteLS`; IDB remains authoritative.
 *
 * Key naming: keys live in a private namespace (`SYNC_META_*`) so
 * future additions don't collide with the wider `STORAGE_KEYS`
 * registry. The DB name is intentionally distinct from
 * `sergeant-rq-cache` (React Query persister) and from the upcoming
 * unified `sergeant` DB (PR #010) — keeping them separate while #010
 * is in flight isolates failure modes.
 */
import {
  createStore,
  get as idbGet,
  set as idbSet,
  del as idbDel,
} from "idb-keyval";

const DB_NAME = "sergeant-sync-meta";
const STORE_NAME = "v1";

export const SYNC_META_KEYS = {
  OFFLINE_QUEUE: "offline_queue",
  VERSIONS: "sync_versions",
  DIRTY_MODULES: "dirty_modules",
  MODULE_MODIFIED: "module_modified",
} as const;

export type SyncMetaKey = (typeof SYNC_META_KEYS)[keyof typeof SYNC_META_KEYS];

// Lazy `Store` — `createStore` does NOT open the DB; the open happens
// on the first get/set/del call. This keeps SSR / unit-test bootstrap
// fast and lets us avoid wrapping every test in fake-indexeddb when we
// only need to mock the four exported functions below.
let store: ReturnType<typeof createStore> | null = null;
function getStore(): ReturnType<typeof createStore> {
  if (!store) store = createStore(DB_NAME, STORE_NAME);
  return store;
}

/**
 * `true` when the runtime exposes IndexedDB (browsers, Electron). In
 * Node-based unit tests under jsdom we may run without IDB; in Safari
 * Private Browsing on older versions IDB is also stubbed out. In both
 * cases we short-circuit get/set/del so the caller's `await` resolves
 * to `undefined` instead of leaking unhandled rejections / pending
 * IndexedDB transactions across the test runner heap.
 */
function idbAvailable(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== "undefined"
  );
}

export async function getSyncMeta<T>(key: SyncMetaKey): Promise<T | undefined> {
  if (!idbAvailable()) return undefined;
  return idbGet<T>(key, getStore());
}

export async function setSyncMeta<T>(
  key: SyncMetaKey,
  value: T,
): Promise<void> {
  if (!idbAvailable()) return;
  await idbSet(key, value, getStore());
}

export async function delSyncMeta(key: SyncMetaKey): Promise<void> {
  if (!idbAvailable()) return;
  await idbDel(key, getStore());
}

/**
 * Test-only reset of the cached store handle. Vitest reuses module
 * instances across describe blocks; this lets a test that mocks
 * `idb-keyval` swap the implementation cleanly without retaining a
 * stale `Store` from a previous suite.
 */
export function __resetSyncMetaStoreForTests(): void {
  store = null;
}
