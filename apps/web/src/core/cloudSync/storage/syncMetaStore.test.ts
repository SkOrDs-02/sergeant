// @vitest-environment jsdom
/**
 * Unit tests for the IDB-backed sync metadata store and the
 * `hydrateOfflineQueueFromDisk()` migration glue.  PR #009 in
 * `docs/planning/storage-roadmap.md` introduced syncMetaStore as a
 * dedicated `sergeant-sync-meta` IDB; PR #010 consolidates it into the
 * shared `sergeant-db` connection.
 *
 * jsdom does NOT ship IndexedDB.  We mock the shared sergeant-db
 * module directly with an in-memory map keyed by
 * `${storeName}:${key}`, so the wrapper's get/set/del paths run end
 * to end without `fake-indexeddb`.  The mock keeps the same shape as
 * the real module (`dbGet/dbSet/dbDel/openSergeantDb/migrateLegacyDbOnce`)
 * so the production module under test is exercised unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sharedStore = new Map<string, unknown>();
const cellKey = (storeName: string, key: IDBValidKey): string =>
  `${storeName}:${String(key)}`;

const dbGetMock = vi.fn(async (storeName: string, key: IDBValidKey) =>
  sharedStore.get(cellKey(storeName, key)),
);
const dbSetMock = vi.fn(
  async (storeName: string, key: IDBValidKey, value: unknown) => {
    sharedStore.set(cellKey(storeName, key), value);
  },
);
const dbDelMock = vi.fn(async (storeName: string, key: IDBValidKey) => {
  sharedStore.delete(cellKey(storeName, key));
});
const migrateLegacyDbOnceMock = vi.fn(async (_opts: unknown) => {
  /* no-op — tests that need migration semantics override this */
});
const openSergeantDbMock = vi.fn(async () => null);

vi.mock("../../../shared/lib/idb/sergeantDb", () => ({
  SERGEANT_STORE: {
    RQ_CACHE: "rq_cache",
    SYNC_META: "sync_meta",
    NUTRITION_RECIPES: "nutrition_recipes",
    NUTRITION_FOODS: "nutrition_foods",
    NUTRITION_BARCODES: "nutrition_barcodes",
    NUTRITION_MEAL_THUMBS: "nutrition_meal_thumbs",
    MIGRATION_META: "migration_meta",
  },
  dbGet: (storeName: string, key: IDBValidKey) => dbGetMock(storeName, key),
  dbSet: (storeName: string, key: IDBValidKey, value: unknown) =>
    dbSetMock(storeName, key, value),
  dbDel: (storeName: string, key: IDBValidKey) => dbDelMock(storeName, key),
  migrateLegacyDbOnce: (opts: unknown) => migrateLegacyDbOnceMock(opts),
  openSergeantDb: () => openSergeantDbMock(),
  __resetSergeantDbForTests: () => {
    /* mock-only no-op */
  },
}));

import { OFFLINE_QUEUE_KEY } from "../config";
import {
  __resetOfflineQueueCacheForTests,
  addToOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
  hydrateOfflineQueueFromDisk,
} from "../queue/offlineQueue";
import {
  SYNC_META_KEYS,
  __resetSyncMetaStoreForTests,
  delSyncMeta,
  getSyncMeta,
  setSyncMeta,
} from "./syncMetaStore";

beforeEach(() => {
  sharedStore.clear();
  dbGetMock.mockClear();
  dbSetMock.mockClear();
  dbDelMock.mockClear();
  migrateLegacyDbOnceMock.mockClear();
  openSergeantDbMock.mockClear();
  // Restore default mock implementations in case a test overrode
  // them with mockRejectedValueOnce / mockReturnValueOnce.
  dbGetMock.mockImplementation(async (storeName, key) =>
    sharedStore.get(cellKey(storeName, key)),
  );
  dbSetMock.mockImplementation(async (storeName, key, value) => {
    sharedStore.set(cellKey(storeName, key), value);
  });
  dbDelMock.mockImplementation(async (storeName, key) => {
    sharedStore.delete(cellKey(storeName, key));
  });
  migrateLegacyDbOnceMock.mockImplementation(async () => {});
  localStorage.clear();
  __resetOfflineQueueCacheForTests();
  __resetSyncMetaStoreForTests();
});
afterEach(() => {
  localStorage.clear();
});

describe("syncMetaStore", () => {
  it("get/set/del roundtrip routes through the shared sergeant-db 'sync_meta' store", async () => {
    await setSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE, [{ a: 1 }]);
    expect(dbSetMock).toHaveBeenCalledWith("sync_meta", "offline_queue", [
      { a: 1 },
    ]);
    expect(await getSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE)).toEqual([{ a: 1 }]);

    await delSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE);
    expect(dbDelMock).toHaveBeenCalledWith("sync_meta", "offline_queue");
    expect(await getSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE)).toBeUndefined();
  });

  it("invokes the lazy LS→IDB migration once per call before touching the store", async () => {
    await getSyncMeta(SYNC_META_KEYS.VERSIONS);
    await setSyncMeta(SYNC_META_KEYS.VERSIONS, { finyk: 1 });
    await delSyncMeta(SYNC_META_KEYS.VERSIONS);
    expect(migrateLegacyDbOnceMock).toHaveBeenCalledTimes(3);
    // Migration descriptor names the legacy DB so the shim knows
    // which connection to drain.
    const firstArg = migrateLegacyDbOnceMock.mock.calls[0]?.[0] as
      | { legacyDbName?: string }
      | undefined;
    expect(firstArg?.legacyDbName).toBe("sergeant-sync-meta");
  });

  it("exposes the five documented keys (offline queue + 3 sync-meta slots + dead-letter)", () => {
    // Snapshot the registry so renaming a key in the wrapper without
    // updating production callers gets caught at test time. PR #040
    // (storage-roadmap Stage 5) added `DEAD_LETTER_QUEUE` for queue
    // entries that exceeded `MAX_QUEUE_ATTEMPTS` consecutive failures.
    expect(SYNC_META_KEYS).toEqual({
      OFFLINE_QUEUE: "offline_queue",
      VERSIONS: "sync_versions",
      DIRTY_MODULES: "dirty_modules",
      MODULE_MODIFIED: "module_modified",
      DEAD_LETTER_QUEUE: "dead_letter_queue",
    });
  });
});

describe("hydrateOfflineQueueFromDisk", () => {
  it("hydrates the in-memory cache from IDB when IDB has data", async () => {
    const idbQueue = [
      {
        type: "push",
        modules: { finyk: { data: {} } },
        ts: "2026-04-01T00:00:00.000Z",
      },
    ];
    sharedStore.set(cellKey("sync_meta", "offline_queue"), idbQueue);

    await hydrateOfflineQueueFromDisk();
    expect(getOfflineQueue()).toEqual(idbQueue);
  });

  it("falls back to LS and migrates legacy data into IDB when IDB is empty", async () => {
    const lsQueue = [
      {
        type: "push",
        modules: { nutrition: { data: {} } },
        ts: "2026-04-01T00:00:00.000Z",
      },
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(lsQueue));

    await hydrateOfflineQueueFromDisk();

    // The cache should now reflect LS contents...
    expect(getOfflineQueue()).toEqual(lsQueue);
    // ...and IDB should have been populated as a one-shot migration
    // so future cold-boots no longer depend on LS.
    expect(sharedStore.get(cellKey("sync_meta", "offline_queue"))).toEqual(
      lsQueue,
    );
    expect(dbSetMock).toHaveBeenCalledWith(
      "sync_meta",
      "offline_queue",
      lsQueue,
    );
  });

  it("hydrates to an empty queue when neither IDB nor LS have data", async () => {
    await hydrateOfflineQueueFromDisk();
    expect(getOfflineQueue()).toEqual([]);
  });

  it("is robust to IDB throwing (Safari Private Browsing, quota) — falls back to LS", async () => {
    dbGetMock.mockRejectedValueOnce(new Error("quota exceeded"));
    const lsQueue = [{ type: "evt", payload: 1, ts: "2026-04-01T00:00:00Z" }];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(lsQueue));

    await hydrateOfflineQueueFromDisk();
    expect(getOfflineQueue()).toEqual(lsQueue);
  });
});

describe("offline queue end-to-end with IDB", () => {
  it("addToOfflineQueue dual-writes to IDB while the queue is small", async () => {
    addToOfflineQueue({
      type: "push",
      modules: { finyk: { data: { v: 1 } } },
    } as never);

    // IDB write is fire-and-forget (`void setSyncMeta(…)`).  The mock
    // pipeline crosses several microtask boundaries (ensureMigrated
    // → dbSet), so we need to flush the queue before asserting.
    await new Promise((r) => setTimeout(r, 0));

    expect(dbSetMock).toHaveBeenCalled();
    const lastCall = dbSetMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("sync_meta");
    expect(lastCall?.[1]).toBe(SYNC_META_KEYS.OFFLINE_QUEUE);
    expect((lastCall?.[2] as { type: string }[])[0]?.type).toBe("push");

    // LS dual-write also happens for small queues.
    const lsRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    expect(lsRaw).not.toBeNull();
  });

  it("clearOfflineQueue removes the row from IDB AND localStorage", async () => {
    addToOfflineQueue({
      type: "push",
      modules: { finyk: { data: { v: 1 } } },
    } as never);
    expect(getOfflineQueue()).toHaveLength(1);

    clearOfflineQueue();
    // `delSyncMeta` is also fire-and-forget — flush microtasks.
    await new Promise((r) => setTimeout(r, 0));

    expect(getOfflineQueue()).toEqual([]);
    expect(dbDelMock).toHaveBeenCalledWith("sync_meta", "offline_queue");
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
  });
});
