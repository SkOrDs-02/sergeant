// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  SERGEANT_STORE,
  __resetSergeantDbForTests,
  dbGet,
  dbSet,
  openSergeantDb,
} from "../idb/sergeantDb";

/** Стори з `keyPath` приймають запис без зовнішнього ключа. */
async function putInline(
  store: (typeof SERGEANT_STORE)[keyof typeof SERGEANT_STORE],
  value: { id: string },
): Promise<void> {
  const db = await openSergeantDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db!.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

import {
  isAppOwnedLocalStorageKey,
  purgeAppOwnedLocalData,
  purgeAppOwnedLocalStorage,
  purgeAppOwnedSessionStorage,
} from "./purgeLocalData";

describe("isAppOwnedLocalStorageKey", () => {
  it("recognises app-owned keys via prefix and exact registry", () => {
    // Prefix families
    expect(isAppOwnedLocalStorageKey("finyk_tx_cache")).toBe(true);
    expect(isAppOwnedLocalStorageKey("nutrition_water_v1")).toBe(true);
    expect(isAppOwnedLocalStorageKey("hub_weekly_digest_2026-06-15")).toBe(
      true,
    );
    expect(isAppOwnedLocalStorageKey("fizruk-storage-monthly-plan")).toBe(true);
    expect(isAppOwnedLocalStorageKey("sergeant.profile.memory.open")).toBe(
      true,
    );
    // Exact non-prefixed registry keys
    expect(isAppOwnedLocalStorageKey("ios_install_banner_dismissed")).toBe(
      true,
    );
    expect(isAppOwnedLocalStorageKey("storageManager_ran_migrations")).toBe(
      true,
    );
    expect(isAppOwnedLocalStorageKey("sync_origin_device_id_v1")).toBe(true);
  });

  it("never matches foreign / third-party keys", () => {
    expect(isAppOwnedLocalStorageKey("ph_phc_abc_posthog")).toBe(false);
    expect(isAppOwnedLocalStorageKey("sentry_session")).toBe(false);
    expect(isAppOwnedLocalStorageKey("__better_auth_session")).toBe(false);
    expect(isAppOwnedLocalStorageKey("some_random_key")).toBe(false);
  });

  it("never matches the sqlite-wasm kvvfs backing store — isolation for that lives in wipeSqliteDb()'s row-level DELETE, not a wholesale key purge (see anonymous-local-first-persistence spec)", () => {
    expect(isAppOwnedLocalStorageKey("kvvfs-local-42")).toBe(false);
  });
});

describe("purgeAppOwnedLocalStorage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("removes only app-owned keys and reports the count", () => {
    localStorage.setItem("finyk_tx_cache", "[{tx}]");
    localStorage.setItem("nutrition_water_v1", "{}");
    localStorage.setItem("hub_dark_mode_v1", "true");
    localStorage.setItem("ph_phc_project", "id");
    localStorage.setItem("sentry_replay", "x");

    const removed = purgeAppOwnedLocalStorage();

    expect(removed).toBe(3);
    expect(localStorage.getItem("finyk_tx_cache")).toBeNull();
    expect(localStorage.getItem("nutrition_water_v1")).toBeNull();
    expect(localStorage.getItem("hub_dark_mode_v1")).toBeNull();
    // Foreign origins survive.
    expect(localStorage.getItem("ph_phc_project")).toBe("id");
    expect(localStorage.getItem("sentry_replay")).toBe("x");
  });

  it("стирає відкладений кінець ретро-тренування (data-37: слот тепер у localStorage)", () => {
    localStorage.setItem("fizruk_pending_retro_end_v1", "{}");
    localStorage.setItem("ph_phc_project", "id");

    expect(purgeAppOwnedLocalStorage()).toBe(1);

    expect(localStorage.getItem("fizruk_pending_retro_end_v1")).toBeNull();
    expect(localStorage.getItem("ph_phc_project")).toBe("id");
  });

  it("leaves the kvvfs backing store untouched — a shared, non-per-user physical store that wipeSqliteDb() scopes by user_id instead", () => {
    localStorage.setItem("kvvfs-local-0", "blob-0");
    localStorage.setItem("kvvfs-local-1", "blob-1");

    purgeAppOwnedLocalStorage();

    expect(localStorage.getItem("kvvfs-local-0")).toBe("blob-0");
    expect(localStorage.getItem("kvvfs-local-1")).toBe("blob-1");

    localStorage.removeItem("kvvfs-local-0");
    localStorage.removeItem("kvvfs-local-1");
  });

  it("is a no-op on an empty store", () => {
    expect(purgeAppOwnedLocalStorage()).toBe(0);
  });
});

describe("purgeAppOwnedLocalData", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("clears localStorage and resolves even without IndexedDB", async () => {
    localStorage.setItem("finyk_tx_cache", "[{tx}]");
    localStorage.setItem("ph_keep", "1");

    // jsdom has no `indexedDB`, so the persister-snapshot step no-ops; the
    // whole purge must still resolve without throwing.
    await expect(purgeAppOwnedLocalData()).resolves.toBeUndefined();

    expect(localStorage.getItem("finyk_tx_cache")).toBeNull();
    expect(localStorage.getItem("ph_keep")).toBe("1");
  });
});

describe("purgeAppOwnedLocalData — nutrition IndexedDB (data-09)", () => {
  const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
    __resetSergeantDbForTests();
  });
  afterEach(() => {
    if (originalIndexedDB === undefined) {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    } else {
      (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
    }
    __resetSergeantDbForTests();
  });

  it("стирає книгу рецептів, але лишає мініатюри страв (вони без серверної копії)", async () => {
    await putInline(SERGEANT_STORE.NUTRITION_RECIPES, { id: "rcp_x" });
    await dbSet(SERGEANT_STORE.NUTRITION_MEAL_THUMBS, "meal_x", "thumb");
    await putInline(SERGEANT_STORE.NUTRITION_FOODS, { id: "food_x" });

    await purgeAppOwnedLocalData();

    expect(
      await dbGet(SERGEANT_STORE.NUTRITION_RECIPES, "rcp_x"),
    ).toBeUndefined();
    // Мініатюри живуть лише локально: стерти їх означає втратити фото назавжди.
    expect(await dbGet(SERGEANT_STORE.NUTRITION_MEAL_THUMBS, "meal_x")).toBe(
      "thumb",
    );
    // Каталог продуктів не привʼязаний до акаунта й не стирається наосліп.
    expect(await dbGet(SERGEANT_STORE.NUTRITION_FOODS, "food_x")).toBeDefined();
  });
});

describe("purgeAppOwnedLocalData — sessionStorage (priv-16)", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("стирає кеш AI-пропозицій рецептів і лишає сторонні ключі", async () => {
    sessionStorage.setItem(
      "nutrition_recipes_cache_v1",
      JSON.stringify({ abc: { recipes: [{ title: "SECRET-X-suggest" }] } }),
    );
    sessionStorage.setItem("__sergeant_chunk_reload_at", "1000");
    sessionStorage.setItem("ph_session_marker", "1");

    await purgeAppOwnedLocalData();

    expect(sessionStorage.getItem("nutrition_recipes_cache_v1")).toBeNull();
    // Сторонні та неапповські ключі лишаються.
    expect(sessionStorage.getItem("ph_session_marker")).toBe("1");
    expect(sessionStorage.getItem("__sergeant_chunk_reload_at")).toBe("1000");
  });

  it("лишає маркер OAuth-реєстрації, який має пережити identity-wipe до читання", () => {
    sessionStorage.setItem(
      "sergeant.auth.pendingOAuthProvider",
      "google:1700000000000",
    );
    sessionStorage.setItem("sergeant.v2.routine.streakExposure", "{}");

    expect(purgeAppOwnedSessionStorage()).toBe(1);

    expect(sessionStorage.getItem("sergeant.auth.pendingOAuthProvider")).toBe(
      "google:1700000000000",
    );
    expect(
      sessionStorage.getItem("sergeant.v2.routine.streakExposure"),
    ).toBeNull();
  });

  it("є no-op на порожньому сховищі", () => {
    expect(purgeAppOwnedSessionStorage()).toBe(0);
  });
});
