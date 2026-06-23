// @vitest-environment jsdom
/**
 * Tests for the three built-in localStorage migrations registered as a
 * side-effect of importing `storageManager`:
 *   - finyk_001_rename_finto_keys
 *   - nutrition_001_migrate_legacy_pantry
 *   - routine_001_migrate_fizruk_pushups
 *
 * The API-level tests live in `storageManager.test.ts`; this file drives
 * the migration bodies with realistic legacy data so the rename / pantry /
 * pushup branches execute.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { storageManager } from "./storageManager";
import { webKVStore } from "./storage";

beforeEach(() => {
  localStorage.clear();
  storageManager.resetAll();
});

describe("built-in migration: finyk_001_rename_finto_keys", () => {
  it("renames legacy finto_* keys to finyk_* and removes the old ones", () => {
    webKVStore.setString("finto_token", "abc");
    webKVStore.setString("finto_tx_cache", "[]");
    webKVStore.setString("finto_tx_cache_last_good", "{}");

    storageManager.resetMigration("finyk_001_rename_finto_keys");
    storageManager.runAll();

    expect(webKVStore.getString("finyk_token")).toBe("abc");
    expect(webKVStore.getString("finyk_tx_cache")).toBe("[]");
    expect(webKVStore.getString("finyk_tx_cache_last_good")).toBe("{}");
    expect(webKVStore.getString("finto_token")).toBeNull();
    expect(webKVStore.getString("finto_tx_cache_last_good")).toBeNull();
  });

  it("does not overwrite an existing finyk_* value", () => {
    webKVStore.setString("finto_token", "old");
    webKVStore.setString("finyk_token", "new");

    storageManager.resetMigration("finyk_001_rename_finto_keys");
    storageManager.runAll();

    expect(webKVStore.getString("finyk_token")).toBe("new");
  });
});

describe("built-in migration: nutrition_001_migrate_legacy_pantry", () => {
  it("folds v0 items + text into the v1 pantries array", () => {
    webKVStore.setString(
      "nutrition_pantry_items_v0",
      JSON.stringify([{ name: "Молоко" }]),
    );
    webKVStore.setString("nutrition_pantry_text_v0", "нотатки");

    storageManager.resetMigration("nutrition_001_migrate_legacy_pantry");
    storageManager.runAll();

    const raw = webKVStore.getString("nutrition_pantries_v1");
    expect(raw).toBeTruthy();
    const pantries = JSON.parse(raw!);
    expect(Array.isArray(pantries)).toBe(true);
    expect(pantries[0].items).toHaveLength(1);
    expect(pantries[0].text).toBe("нотатки");
    expect(webKVStore.getString("nutrition_active_pantry_v1")).toBe("home");
    // legacy keys cleaned up
    expect(webKVStore.getString("nutrition_pantry_items_v0")).toBeNull();
  });

  it("skips when the v1 pantries array already has data", () => {
    webKVStore.setString(
      "nutrition_pantries_v1",
      JSON.stringify([
        { id: "home", name: "Дім", items: [{ x: 1 }], text: "" },
      ]),
    );
    webKVStore.setString(
      "nutrition_pantry_items_v0",
      JSON.stringify([{ name: "Ignore" }]),
    );

    storageManager.resetMigration("nutrition_001_migrate_legacy_pantry");
    storageManager.runAll();

    // legacy items NOT migrated (v1 already populated) so v0 stays untouched
    expect(webKVStore.getString("nutrition_pantry_items_v0")).toBeTruthy();
  });

  it("is a no-op when there is nothing to migrate", () => {
    storageManager.resetMigration("nutrition_001_migrate_legacy_pantry");
    storageManager.runAll();
    expect(webKVStore.getString("nutrition_pantries_v1")).toBeNull();
  });
});

describe("built-in migration: routine_001_migrate_fizruk_pushups", () => {
  it("merges the legacy pushup log into routine pushupsByDate", () => {
    webKVStore.setString(
      "fizruk_pushups_v1",
      JSON.stringify({ "2026-06-01": 20 }),
    );

    storageManager.resetMigration("routine_001_migrate_fizruk_pushups");
    storageManager.runAll();

    const raw = webKVStore.getString("hub_routine_v1");
    expect(raw).toBeTruthy();
    const state = JSON.parse(raw!);
    expect(state.pushupsByDate["2026-06-01"]).toBe(20);
    expect(webKVStore.getString("fizruk_pushups_v1")).toBeNull();
  });

  it("skips merge but cleans legacy key when routine already has pushups", () => {
    webKVStore.setString(
      "hub_routine_v1",
      JSON.stringify({ pushupsByDate: { "2026-05-01": 10 } }),
    );
    webKVStore.setString(
      "fizruk_pushups_v1",
      JSON.stringify({ "2026-06-01": 20 }),
    );

    storageManager.resetMigration("routine_001_migrate_fizruk_pushups");
    storageManager.runAll();

    const state = JSON.parse(webKVStore.getString("hub_routine_v1")!);
    expect(state.pushupsByDate["2026-05-01"]).toBe(10);
    expect(state.pushupsByDate["2026-06-01"]).toBeUndefined();
    expect(webKVStore.getString("fizruk_pushups_v1")).toBeNull();
  });

  it("is a no-op when no legacy pushup log exists", () => {
    storageManager.resetMigration("routine_001_migrate_fizruk_pushups");
    storageManager.runAll();
    expect(webKVStore.getString("hub_routine_v1")).toBeNull();
  });
});
