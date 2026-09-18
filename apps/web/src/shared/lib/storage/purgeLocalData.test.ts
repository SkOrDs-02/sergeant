// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isAppOwnedLocalStorageKey,
  purgeAppOwnedLocalData,
  purgeAppOwnedLocalStorage,
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
