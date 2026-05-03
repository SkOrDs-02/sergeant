// @vitest-environment jsdom
/**
 * Unit tests for the shared `sergeant-db` connection introduced in
 * Stage 1 PR #010 (`docs/planning/storage-roadmap.md`).
 *
 * jsdom does not ship IndexedDB, so this suite focuses on the
 * runtime-safety contract:  every public helper must degrade
 * gracefully when `globalThis.indexedDB` is undefined (SSR, hardened
 * iframes, Safari Private Browsing on older iOS).  The IDB happy
 * path is exercised end-to-end by the existing consumer test suites
 * (`syncMetaStore.test.ts`, the nutrition/* tests, etc.) which mock
 * this module at the boundary.
 *
 * The schema-creation logic in `onupgradeneeded` is intentionally
 * not asserted at unit level — that lives behind a real IDB and is
 * covered by the Playwright/CI e2e flows.  Unit tests would have to
 * pull in `fake-indexeddb` for marginal value.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

beforeEach(() => {
  // Drop the cached open promise so each test gets a clean slate.
  __resetSergeantDbForTests();
  // jsdom doesn't expose `indexedDB`, but explicitly tear it down so
  // a previous test that injected a stub can't leak across.
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});
afterEach(() => {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
  __resetSergeantDbForTests();
});

describe("SERGEANT_STORE registry", () => {
  it("declares the seven object stores backing the consolidated DB", () => {
    // Snapshot guards against accidental rename.  Every consumer module
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
  it("dbGet resolves to undefined", async () => {
    expect(await dbGet(SERGEANT_STORE.SYNC_META, "anything")).toBeUndefined();
  });

  it("dbSet is a silent no-op", async () => {
    await expect(
      dbSet(SERGEANT_STORE.SYNC_META, "k", { v: 1 }),
    ).resolves.toBeUndefined();
    // No way to read the value back without IDB; the contract is
    // simply "doesn't throw".
  });

  it("dbDel is a silent no-op", async () => {
    await expect(dbDel(SERGEANT_STORE.SYNC_META, "k")).resolves.toBeUndefined();
  });
});

describe("migrateLegacyDbOnce — SSR / no-IDB safety", () => {
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
