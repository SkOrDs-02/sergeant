// @vitest-environment jsdom
/**
 * Unit tests for the IDB-backed sync metadata store and the
 * `hydrateOfflineQueueFromDisk()` migration glue. PR #009 in
 * `docs/planning/storage-roadmap.md`.
 *
 * jsdom does NOT ship IndexedDB, so we mock `idb-keyval` with an
 * in-memory map. That gives us deterministic get/set/del semantics
 * without pulling `fake-indexeddb` into the dependency graph; the
 * store wrapper itself is thin enough that exercising it through the
 * mock catches the real bugs (key naming, IDB-unavailable fallback,
 * LS migration handoff).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const idbStore = new Map<string, unknown>();
const idbGetMock = vi.fn(async (key: string) => idbStore.get(key));
const idbSetMock = vi.fn(async (key: string, value: unknown) => {
  idbStore.set(key, value);
});
const idbDelMock = vi.fn(async (key: string) => {
  idbStore.delete(key);
});
const idbCreateStoreMock = vi.fn(
  (..._args: unknown[]) => ({ __mock: true }) as unknown,
);

vi.mock("idb-keyval", () => ({
  createStore: (dbName: string, storeName: string) =>
    idbCreateStoreMock(dbName, storeName),
  get: (key: string, _store: unknown) => idbGetMock(key),
  set: (key: string, value: unknown, _store: unknown) => idbSetMock(key, value),
  del: (key: string, _store: unknown) => idbDelMock(key),
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
  // Reset shared mutable state before every test.
  idbStore.clear();
  idbGetMock.mockClear();
  idbSetMock.mockClear();
  idbDelMock.mockClear();
  idbCreateStoreMock.mockClear();
  localStorage.clear();
  __resetOfflineQueueCacheForTests();
  __resetSyncMetaStoreForTests();

  // jsdom doesn't ship IndexedDB. Provide a stub so the
  // `idbAvailable()` short-circuit in syncMetaStore.ts treats the env
  // as IDB-capable and routes to our `idb-keyval` mock above.
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
});
afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

describe("syncMetaStore", () => {
  it("get/set/del roundtrip uses the dedicated 'sergeant-sync-meta' DB and 'v1' store", async () => {
    await setSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE, [{ a: 1 }]);
    expect(idbCreateStoreMock).toHaveBeenCalledWith("sergeant-sync-meta", "v1");
    expect(idbSetMock).toHaveBeenCalledWith("offline_queue", [{ a: 1 }]);
    expect(await getSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE)).toEqual([{ a: 1 }]);

    await delSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE);
    expect(idbDelMock).toHaveBeenCalledWith("offline_queue");
    expect(await getSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE)).toBeUndefined();
  });

  it("get returns undefined and set/del are no-ops when IndexedDB is unavailable", async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;

    expect(await getSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE)).toBeUndefined();
    await setSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE, [{ a: 1 }]);
    await delSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE);

    // None of the underlying idb-keyval helpers should have been
    // touched — short-circuit kicked in at the wrapper level.
    expect(idbGetMock).not.toHaveBeenCalled();
    expect(idbSetMock).not.toHaveBeenCalled();
    expect(idbDelMock).not.toHaveBeenCalled();
  });

  it("exposes the four documented keys (offline queue + 3 sync-meta slots)", () => {
    // Snapshot the registry so renaming a key in the wrapper without
    // updating production callers gets caught at test time.
    expect(SYNC_META_KEYS).toEqual({
      OFFLINE_QUEUE: "offline_queue",
      VERSIONS: "sync_versions",
      DIRTY_MODULES: "dirty_modules",
      MODULE_MODIFIED: "module_modified",
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
    idbStore.set(SYNC_META_KEYS.OFFLINE_QUEUE, idbQueue);

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
    expect(idbStore.get(SYNC_META_KEYS.OFFLINE_QUEUE)).toEqual(lsQueue);
    expect(idbSetMock).toHaveBeenCalledWith("offline_queue", lsQueue);
  });

  it("hydrates to an empty queue when neither IDB nor LS have data", async () => {
    await hydrateOfflineQueueFromDisk();
    expect(getOfflineQueue()).toEqual([]);
  });

  it("is robust to IDB throwing (Safari Private Browsing, quota) — falls back to LS", async () => {
    idbGetMock.mockRejectedValueOnce(new Error("quota exceeded"));
    const lsQueue = [{ type: "evt", payload: 1, ts: "2026-04-01T00:00:00Z" }];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(lsQueue));

    await hydrateOfflineQueueFromDisk();
    expect(getOfflineQueue()).toEqual(lsQueue);
  });
});

describe("offline queue end-to-end with IDB", () => {
  it("addToOfflineQueue dual-writes to IDB while the queue is small", () => {
    addToOfflineQueue({
      type: "push",
      modules: { finyk: { data: { v: 1 } } },
    } as never);

    // IDB write is fire-and-forget but with awaited mocks it fires
    // synchronously enough that the call is observable.
    expect(idbSetMock).toHaveBeenCalled();
    const lastCall = idbSetMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(SYNC_META_KEYS.OFFLINE_QUEUE);
    expect((lastCall?.[1] as { type: string }[])[0]?.type).toBe("push");

    // LS dual-write also happens for small queues.
    const lsRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    expect(lsRaw).not.toBeNull();
  });

  it("clearOfflineQueue removes the row from IDB AND localStorage", () => {
    addToOfflineQueue({
      type: "push",
      modules: { finyk: { data: { v: 1 } } },
    } as never);
    expect(getOfflineQueue()).toHaveLength(1);

    clearOfflineQueue();
    expect(getOfflineQueue()).toEqual([]);
    expect(idbDelMock).toHaveBeenCalledWith(SYNC_META_KEYS.OFFLINE_QUEUE);
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
  });
});
