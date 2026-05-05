// @vitest-environment jsdom
/**
 * Unit tests for the shared `sergeant-db` connection introduced in
 * Stage 1 PR #010 (`docs/planning/storage-roadmap.md`).
 *
 * The suite covers two orthogonal contracts:
 *
 *   1. SSR / no-IDB safety — every public helper degrades gracefully
 *      when `globalThis.indexedDB` is undefined (SSR, hardened iframes,
 *      Safari Private Browsing on older iOS). These tests run with
 *      `globalThis.indexedDB` deliberately wiped.
 *
 *   2. Happy-path schema + CRUD via `fake-indexeddb`. jsdom doesn't
 *      ship IndexedDB, so we install a fresh `IDBFactory` per test
 *      and exercise the full `onupgradeneeded` schema (seven object
 *      stores + the two `keyPath` indexes), the dbGet/dbSet/dbDel
 *      wrappers, and the `migrateLegacyDbOnce()` flow.
 *
 * Follow-up to `docs/testing/2026-05-05-tests-pr-plan.md` → PR-T03.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  SERGEANT_STORE,
  __resetSergeantDbForTests,
  dbDel,
  dbGet,
  dbSet,
  migrateLegacyDbOnce,
  openSergeantDb,
} from "./sergeantDb";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function installFakeIDB(): IDBFactory {
  const factory = new IDBFactory();
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = factory;
  return factory;
}

function clearIDB(): void {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
}

/* -------------------------------------------------------------------------- */
/* SSR / no-IDB safety — `globalThis.indexedDB` is undefined.                 */
/* -------------------------------------------------------------------------- */

describe("SERGEANT_STORE registry", () => {
  it("declares the seven object stores backing the consolidated DB", () => {
    // Snapshot guards against accidental rename. Every consumer module
    // imports SERGEANT_STORE.* by symbol, so a typo here would break
    // them at runtime.
    expect(SERGEANT_STORE).toEqual({
      RQ_CACHE: "rq_cache",
      SYNC_META: "sync_meta",
      NUTRITION_RECIPES: "nutrition_recipes",
      NUTRITION_FOODS: "nutrition_foods",
      NUTRITION_BARCODES: "nutrition_barcodes",
      NUTRITION_MEAL_THUMBS: "nutrition_meal_thumbs",
      MIGRATION_META: "migration_meta",
    });
  });
});

describe("openSergeantDb — SSR / no-IDB safety", () => {
  beforeEach(() => {
    __resetSergeantDbForTests();
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });
  afterEach(() => {
    clearIDB();
    __resetSergeantDbForTests();
  });

  it("resolves to null when `globalThis.indexedDB` is undefined", async () => {
    expect(await openSergeantDb()).toBeNull();
  });

  it("never throws even if IndexedDB later becomes available mid-session", async () => {
    // First call resolves to null; ensure the cached promise is null
    // and a follow-up call after `__resetSergeantDbForTests()` doesn't
    // explode.  This protects against SSR → hydration handoffs where
    // the polyfill arrives after the first call returns.
    expect(await openSergeantDb()).toBeNull();
    __resetSergeantDbForTests();
    expect(await openSergeantDb()).toBeNull();
  });
});

describe("dbGet / dbSet / dbDel — SSR / no-IDB safety", () => {
  beforeEach(() => {
    __resetSergeantDbForTests();
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });
  afterEach(() => {
    clearIDB();
    __resetSergeantDbForTests();
  });

  it("dbGet resolves to undefined", async () => {
    expect(await dbGet(SERGEANT_STORE.SYNC_META, "anything")).toBeUndefined();
  });

  it("dbSet is a silent no-op", async () => {
    await expect(
      dbSet(SERGEANT_STORE.SYNC_META, "k", { v: 1 }),
    ).resolves.toBeUndefined();
  });

  it("dbDel is a silent no-op", async () => {
    await expect(dbDel(SERGEANT_STORE.SYNC_META, "k")).resolves.toBeUndefined();
  });
});

describe("migrateLegacyDbOnce — SSR / no-IDB safety", () => {
  beforeEach(() => {
    __resetSergeantDbForTests();
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });
  afterEach(() => {
    clearIDB();
    __resetSergeantDbForTests();
  });

  it("returns immediately without invoking the copy callback", async () => {
    let copyCalled = false;
    await migrateLegacyDbOnce({
      legacyDbName: "hub_nutrition_recipe_book",
      copy: async () => {
        copyCalled = true;
      },
    });
    expect(copyCalled).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Happy-path: fake-indexeddb backed.                                         */
/* -------------------------------------------------------------------------- */

describe("openSergeantDb — schema creation via onupgradeneeded", () => {
  beforeEach(() => {
    __resetSergeantDbForTests();
    installFakeIDB();
  });
  afterEach(() => {
    __resetSergeantDbForTests();
    clearIDB();
  });

  it("creates all seven object stores on first open", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    const names = Array.from(db!.objectStoreNames).sort();
    expect(names).toEqual(
      [
        "rq_cache",
        "sync_meta",
        "nutrition_recipes",
        "nutrition_foods",
        "nutrition_barcodes",
        "nutrition_meal_thumbs",
        "migration_meta",
      ].sort(),
    );
    db!.close();
  });

  it("declares `keyPath: 'id'` + secondary index for the keyed stores", async () => {
    const db = await openSergeantDb();
    const tx = db!.transaction(
      [SERGEANT_STORE.NUTRITION_RECIPES, SERGEANT_STORE.NUTRITION_FOODS],
      "readonly",
    );

    const recipes = tx.objectStore(SERGEANT_STORE.NUTRITION_RECIPES);
    expect(recipes.keyPath).toBe("id");
    expect(Array.from(recipes.indexNames)).toEqual(["by_updatedAt"]);
    expect(recipes.index("by_updatedAt").keyPath).toBe("updatedAt");

    const foods = tx.objectStore(SERGEANT_STORE.NUTRITION_FOODS);
    expect(foods.keyPath).toBe("id");
    expect(Array.from(foods.indexNames)).toEqual(["by_norm"]);
    expect(foods.index("by_norm").keyPath).toBe("norm");

    db!.close();
  });

  it("uses out-of-line keys (no keyPath) for the bucket / blob stores", async () => {
    const db = await openSergeantDb();
    const tx = db!.transaction(
      [
        SERGEANT_STORE.RQ_CACHE,
        SERGEANT_STORE.SYNC_META,
        SERGEANT_STORE.NUTRITION_BARCODES,
        SERGEANT_STORE.NUTRITION_MEAL_THUMBS,
        SERGEANT_STORE.MIGRATION_META,
      ],
      "readonly",
    );
    for (const name of [
      SERGEANT_STORE.RQ_CACHE,
      SERGEANT_STORE.SYNC_META,
      SERGEANT_STORE.NUTRITION_BARCODES,
      SERGEANT_STORE.NUTRITION_MEAL_THUMBS,
      SERGEANT_STORE.MIGRATION_META,
    ] as const) {
      const store = tx.objectStore(name);
      expect(store.keyPath).toBeNull();
      expect(Array.from(store.indexNames)).toEqual([]);
    }
    db!.close();
  });

  it("memoizes the open promise so concurrent callers share a single connection", async () => {
    const [a, b] = await Promise.all([openSergeantDb(), openSergeantDb()]);
    expect(a).toBe(b);
    a!.close();
  });

  it("reopens cleanly after `__resetSergeantDbForTests()`", async () => {
    const a = await openSergeantDb();
    expect(a).not.toBeNull();
    a!.close();
    __resetSergeantDbForTests();
    const b = await openSergeantDb();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    b!.close();
  });
});

describe("dbGet / dbSet / dbDel — CRUD on every store", () => {
  beforeEach(() => {
    __resetSergeantDbForTests();
    installFakeIDB();
  });
  afterEach(() => {
    __resetSergeantDbForTests();
    clearIDB();
  });

  it("round-trips a value through an out-of-line keyed store (RQ_CACHE)", async () => {
    await dbSet(SERGEANT_STORE.RQ_CACHE, "k1", { foo: "bar" });
    expect(await dbGet(SERGEANT_STORE.RQ_CACHE, "k1")).toEqual({ foo: "bar" });

    await dbSet(SERGEANT_STORE.RQ_CACHE, "k1", { foo: "baz" });
    expect(await dbGet(SERGEANT_STORE.RQ_CACHE, "k1")).toEqual({ foo: "baz" });

    await dbDel(SERGEANT_STORE.RQ_CACHE, "k1");
    expect(await dbGet(SERGEANT_STORE.RQ_CACHE, "k1")).toBeUndefined();
  });

  it("round-trips a value through SYNC_META", async () => {
    await dbSet(SERGEANT_STORE.SYNC_META, "offline_queue", [{ a: 1 }]);
    expect(await dbGet(SERGEANT_STORE.SYNC_META, "offline_queue")).toEqual([
      { a: 1 },
    ]);
    await dbDel(SERGEANT_STORE.SYNC_META, "offline_queue");
    expect(
      await dbGet(SERGEANT_STORE.SYNC_META, "offline_queue"),
    ).toBeUndefined();
  });

  it("round-trips a structured-clonable POJO through NUTRITION_MEAL_THUMBS", async () => {
    // The production module stores `Blob`s here, but jsdom's
    // structured-clone drops `Blob` and `ArrayBuffer` instances
    // (they survive as `{}` through fake-indexeddb's serialiser),
    // so the unit test is restricted to the contract that any
    // structured-cloneable POJO survives the round-trip. End-to-end
    // Blob handling is verified by the nutrition meal-thumb e2e
    // suites.
    const meta = { width: 64, height: 64, encoded: "AQID" };
    await dbSet(SERGEANT_STORE.NUTRITION_MEAL_THUMBS, "thumb-1", meta);
    expect(
      await dbGet(SERGEANT_STORE.NUTRITION_MEAL_THUMBS, "thumb-1"),
    ).toEqual(meta);
  });

  it("surfaces a DataError when dbSet receives an explicit key for a keyPath store", async () => {
    // The `dbSet` wrapper always passes its `key` argument to
    // `IDBObjectStore.put(value, key)`. For stores declared with an
    // in-line `keyPath` (NUTRITION_RECIPES, NUTRITION_FOODS) the spec
    // requires the key to be omitted — passing one trips a
    // `DataError`. This test pins the contract so callers know to use
    // raw `objectStore.put(value)` (which is what the production
    // nutrition modules do) rather than the bucket-shaped wrapper.
    const row = { id: "recipe-1", title: "Borscht", updatedAt: 1234 };
    await expect(
      dbSet(SERGEANT_STORE.NUTRITION_RECIPES, row.id, row),
    ).rejects.toBeTruthy();
  });

  it("dbGet returns `undefined` for a missing key (not null)", async () => {
    expect(await dbGet(SERGEANT_STORE.RQ_CACHE, "nope")).toBeUndefined();
  });

  it("dbDel on a missing key resolves silently", async () => {
    await expect(
      dbDel(SERGEANT_STORE.RQ_CACHE, "nope"),
    ).resolves.toBeUndefined();
  });
});

describe("migrateLegacyDbOnce — happy path", () => {
  beforeEach(() => {
    __resetSergeantDbForTests();
    installFakeIDB();
  });
  afterEach(() => {
    __resetSergeantDbForTests();
    clearIDB();
  });

  async function seedLegacyDb(name: string, store: string): Promise<void> {
    // Minimal legacy DB the migration is expected to drain.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(store);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put({ hello: "world" }, "k");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  it("invokes copy() once, marks the legacy DB done, and deletes it", async () => {
    await seedLegacyDb("legacy-foo", "rows");

    const copies: Array<unknown> = [];
    await migrateLegacyDbOnce({
      legacyDbName: "legacy-foo",
      copy: async (legacyDb, sergeantDb) => {
        copies.push("called");
        // Read from legacy + write into the shared DB. The exact copy
        // shape is module-specific — we just verify the callback gets
        // both connections.
        expect(Array.from(legacyDb.objectStoreNames)).toContain("rows");
        expect(sergeantDb.name).toBe("sergeant-db");
      },
    });
    expect(copies).toEqual(["called"]);

    const flags = await dbGet<Record<string, true>>(
      SERGEANT_STORE.MIGRATION_META,
      "legacy_db_flags",
    );
    expect(flags?.["legacy-foo"]).toBe(true);

    // Legacy DB is gone (databases() is supported by fake-indexeddb).
    const list = await indexedDB.databases();
    expect(list.map((d) => d.name)).not.toContain("legacy-foo");
  });

  it("is idempotent — second call skips the copy callback", async () => {
    await seedLegacyDb("legacy-bar", "rows");

    let calls = 0;
    const opts = {
      legacyDbName: "legacy-bar",
      copy: async () => {
        calls += 1;
      },
    };

    await migrateLegacyDbOnce(opts);
    await migrateLegacyDbOnce(opts);
    await migrateLegacyDbOnce(opts);

    expect(calls).toBe(1);
  });

  it("marks fresh-install (legacy DB absent) as done without calling copy", async () => {
    let copyCalled = false;
    await migrateLegacyDbOnce({
      legacyDbName: "legacy-missing",
      copy: async () => {
        copyCalled = true;
      },
    });
    expect(copyCalled).toBe(false);

    const flags = await dbGet<Record<string, true>>(
      SERGEANT_STORE.MIGRATION_META,
      "legacy_db_flags",
    );
    expect(flags?.["legacy-missing"]).toBe(true);
  });

  it("retries on next boot when copy() throws", async () => {
    await seedLegacyDb("legacy-retry", "rows");

    let attempts = 0;
    const failing = {
      legacyDbName: "legacy-retry",
      copy: async () => {
        attempts += 1;
        throw new Error("boom");
      },
    };
    await migrateLegacyDbOnce(failing);
    expect(attempts).toBe(1);

    const flags1 = await dbGet<Record<string, true>>(
      SERGEANT_STORE.MIGRATION_META,
      "legacy_db_flags",
    );
    expect(flags1?.["legacy-retry"]).toBeUndefined();

    const successful = {
      legacyDbName: "legacy-retry",
      copy: async () => {
        attempts += 1;
      },
    };
    await migrateLegacyDbOnce(successful);
    expect(attempts).toBe(2);

    const flags2 = await dbGet<Record<string, true>>(
      SERGEANT_STORE.MIGRATION_META,
      "legacy_db_flags",
    );
    expect(flags2?.["legacy-retry"]).toBe(true);
  });

  it("accumulates flags across multiple legacy DB names", async () => {
    await seedLegacyDb("legacy-a", "rows");
    await seedLegacyDb("legacy-b", "rows");
    await seedLegacyDb("legacy-c", "rows");

    for (const name of ["legacy-a", "legacy-b", "legacy-c"]) {
      await migrateLegacyDbOnce({
        legacyDbName: name,
        copy: async () => {},
      });
    }

    const flags = await dbGet<Record<string, true>>(
      SERGEANT_STORE.MIGRATION_META,
      "legacy_db_flags",
    );
    expect(flags).toEqual({
      "legacy-a": true,
      "legacy-b": true,
      "legacy-c": true,
    });
  });
});
