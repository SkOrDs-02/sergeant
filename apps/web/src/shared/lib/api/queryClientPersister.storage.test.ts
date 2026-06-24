// @vitest-environment jsdom
/**
 * Tests for the `idbKeyvalStorage` AsyncStorage adapter that backs the
 * web React Query persister, plus the lazy legacy `sergeant-rq-cache`
 * → `sergeant-db` migration the adapter triggers on its first access.
 *
 * Coverage here is complementary to `queryClientPersister.test.ts` /
 * `queryClientPersister.dehydrate.test.ts`, which exercise the
 * `shouldDehydrateQuery` selector and `createWebPersistOptions` shape —
 * neither touches the storage round-trip or the migration path.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  SERGEANT_STORE,
  __resetSergeantDbForTests,
  dbGet,
  openSergeantDb,
} from "../idb/sergeantDb";
import { createWebPersister, idbKeyvalStorage } from "./queryClientPersister";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function installFakeIDB(): IDBFactory {
  const factory = new IDBFactory();
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = factory;
  return factory;
}

function restoreIDB(): void {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
}

/**
 * Seed a legacy `sergeant-rq-cache` DB (single store "v1") with rows so
 * the lazy migration has something to copy into the shared store.
 */
function seedLegacyRqDb(
  factory: IDBFactory,
  rows: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open("sergeant-rq-cache", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("v1");
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("v1", "readwrite");
      const store = tx.objectStore("v1");
      for (const [k, v] of Object.entries(rows)) store.put(v, k);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe("idbKeyvalStorage adapter", () => {
  beforeEach(() => {
    installFakeIDB();
    __resetSergeantDbForTests();
  });

  afterEach(() => {
    __resetSergeantDbForTests();
    restoreIDB();
  });

  it("round-trips a value through setItem/getItem", async () => {
    await idbKeyvalStorage.setItem("k", "cached-payload");
    expect(await idbKeyvalStorage.getItem("k")).toBe("cached-payload");
    // Lands in the shared rq_cache store, not a dedicated DB.
    expect(await dbGet<string>(SERGEANT_STORE.RQ_CACHE, "k")).toBe(
      "cached-payload",
    );
  });

  it("returns null for a missing key", async () => {
    expect(await idbKeyvalStorage.getItem("never-written")).toBeNull();
  });

  it("removeItem deletes the value", async () => {
    await idbKeyvalStorage.setItem("k", "v");
    await idbKeyvalStorage.removeItem("k");
    expect(await idbKeyvalStorage.getItem("k")).toBeNull();
  });

  it("migrates rows from the legacy sergeant-rq-cache DB on first access", async () => {
    const factory = installFakeIDB();
    __resetSergeantDbForTests();
    await seedLegacyRqDb(factory, {
      "web:query_cache_v1": "legacy-snapshot",
    });

    // First read triggers the lazy LS→IDB migration before the lookup.
    const value = await idbKeyvalStorage.getItem("web:query_cache_v1");
    expect(value).toBe("legacy-snapshot");

    // After migration the legacy DB is dropped.
    const dbs = await factory.databases();
    expect(dbs.some((d) => d.name === "sergeant-rq-cache")).toBe(false);
  });

  it("no-ops gracefully when there is no legacy DB to migrate", async () => {
    // Fresh install: nothing seeded. getItem must still resolve (null).
    expect(await idbKeyvalStorage.getItem("anything")).toBeNull();
    // The shared DB is opened and usable afterwards.
    expect(await openSergeantDb()).not.toBeNull();
  });
});

describe("createWebPersister", () => {
  beforeEach(() => {
    installFakeIDB();
    __resetSergeantDbForTests();
  });

  afterEach(() => {
    __resetSergeantDbForTests();
    restoreIDB();
  });

  it("returns a persister bound to the idb-backed storage", () => {
    const persister = createWebPersister();
    expect(typeof persister.persistClient).toBe("function");
    expect(typeof persister.restoreClient).toBe("function");
    expect(typeof persister.removeClient).toBe("function");
  });
});
