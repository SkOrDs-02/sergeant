/**
 * IDB-backed durable store for cloud-sync bookkeeping (offline queue,
 * sync versions, dirty modules, last-modified timestamps). PR #009
 * from `docs/planning/storage-roadmap.md`; consolidated into the
 * shared `sergeant-db` connection by PR #010.
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
 * registry. The data lives in the `sync_meta` object store of the
 * shared `sergeant-db` (PR #010); the legacy `sergeant-sync-meta`
 * database is migrated lazily on the first read/write of this
 * session and then dropped.
 */
import {
  SERGEANT_STORE,
  dbDel,
  dbGet,
  dbSet,
  migrateLegacyDbOnce,
} from "../../../shared/lib/idb/sergeantDb";

export const SYNC_META_KEYS = {
  OFFLINE_QUEUE: "offline_queue",
  VERSIONS: "sync_versions",
  DIRTY_MODULES: "dirty_modules",
  MODULE_MODIFIED: "module_modified",
  /**
   * PR #040 — durable storage for entries that exceeded
   * `MAX_QUEUE_ATTEMPTS` consecutive failed replay batches and were
   * moved out of the live queue. Survives reloads via the same IDB
   * `sync_meta` object store as the live queue, so a dead-letter
   * built up on Tuesday is still around on Friday for the user (or a
   * future support workflow) to inspect.
   */
  DEAD_LETTER_QUEUE: "dead_letter_queue",
} as const;

export type SyncMetaKey = (typeof SYNC_META_KEYS)[keyof typeof SYNC_META_KEYS];

const LEGACY_DB_NAME = "sergeant-sync-meta";
const LEGACY_STORE_NAME = "v1";

const ensureMigrated = (): Promise<void> =>
  migrateLegacyDbOnce({
    legacyDbName: LEGACY_DB_NAME,
    copy: async (legacyDb, sergeantDb) => {
      if (!legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) return;
      const tx = legacyDb.transaction(LEGACY_STORE_NAME, "readonly");
      const store = tx.objectStore(LEGACY_STORE_NAME);
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const r = store.getAllKeys();
        r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result : []);
        r.onerror = () => reject(r.error);
      });
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result : []);
        r.onerror = () => reject(r.error);
      });
      const writeTx = sergeantDb.transaction(
        SERGEANT_STORE.SYNC_META,
        "readwrite",
      );
      const writeStore = writeTx.objectStore(SERGEANT_STORE.SYNC_META);
      for (let i = 0; i < keys.length; i++) {
        writeStore.put(values[i], keys[i]);
      }
      await new Promise<void>((resolve, reject) => {
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => reject(writeTx.error);
        writeTx.onabort = () => reject(writeTx.error);
      });
    },
  });

export async function getSyncMeta<T>(key: SyncMetaKey): Promise<T | undefined> {
  await ensureMigrated();
  return dbGet<T>(SERGEANT_STORE.SYNC_META, key);
}

export async function setSyncMeta<T>(
  key: SyncMetaKey,
  value: T,
): Promise<void> {
  await ensureMigrated();
  await dbSet(SERGEANT_STORE.SYNC_META, key, value);
}

export async function delSyncMeta(key: SyncMetaKey): Promise<void> {
  await ensureMigrated();
  await dbDel(SERGEANT_STORE.SYNC_META, key);
}

/**
 * Test-only reset of any module-scoped state. Vitest reuses module
 * instances across describe blocks; tests that mock `sergeantDb`
 * mid-suite call this to drop any cached handles.
 *
 * Currently a no-op — the shared sergeant-db connection itself
 * exposes `__resetSergeantDbForTests()` and that is the source of
 * truth. We keep this stub for backwards-compatible imports from
 * tests written against the pre-PR-#010 module layout.
 */
export function __resetSyncMetaStoreForTests(): void {
  /* no-op — see docstring above */
}
