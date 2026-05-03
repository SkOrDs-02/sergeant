import { describe, it, expect } from "vitest";

import { STORAGE_KEYS } from "../../lib/storageKeys";
import {
  ALL_TRACKED_KEYS,
  MAX_OFFLINE_QUEUE,
  SYNC_EVENT,
  SYNC_MODULES,
  SYNC_STATUS_EVENT,
  keyToModule,
  type ModuleName,
} from "../modules";

describe("SYNC_MODULES registry", () => {
  it("exposes the expected module names", () => {
    expect(Object.keys(SYNC_MODULES).sort()).toEqual([
      "finyk",
      "fizruk",
      "nutrition",
      "profile",
    ]);
  });

  it("snapshot of finyk keys (closes drift bug — every key must be listed)", () => {
    expect(SYNC_MODULES.finyk.keys).toEqual([
      STORAGE_KEYS.FINYK_HIDDEN,
      STORAGE_KEYS.FINYK_BUDGETS,
      STORAGE_KEYS.FINYK_SUBS,
      STORAGE_KEYS.FINYK_ASSETS,
      STORAGE_KEYS.FINYK_DEBTS,
      STORAGE_KEYS.FINYK_RECV,
      STORAGE_KEYS.FINYK_HIDDEN_TXS,
      STORAGE_KEYS.FINYK_MONTHLY_PLAN,
      STORAGE_KEYS.FINYK_TX_CATS,
      STORAGE_KEYS.FINYK_MONO_DEBT_LINKED,
      STORAGE_KEYS.FINYK_NETWORTH_HISTORY,
      STORAGE_KEYS.FINYK_TX_SPLITS,
      STORAGE_KEYS.FINYK_CUSTOM_CATS,
      STORAGE_KEYS.FINYK_TX_CACHE,
      STORAGE_KEYS.FINYK_INFO_CACHE,
      STORAGE_KEYS.FINYK_TX_CACHE_LAST_GOOD,
      STORAGE_KEYS.FINYK_SHOW_BALANCE,
      STORAGE_KEYS.FINYK_MANUAL_EXPENSES,
      STORAGE_KEYS.FINYK_TX_FILTERS,
    ]);
  });

  it("snapshot of fizruk keys (closes drift bug — every key must be listed)", () => {
    expect(SYNC_MODULES.fizruk.keys).toEqual([
      STORAGE_KEYS.FIZRUK_WORKOUTS,
      STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES,
      STORAGE_KEYS.FIZRUK_MEASUREMENTS,
      STORAGE_KEYS.FIZRUK_TEMPLATES,
      STORAGE_KEYS.FIZRUK_SELECTED_TEMPLATE,
      STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT,
      STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM,
      STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE,
      STORAGE_KEYS.FIZRUK_MONTHLY_PLAN,
      STORAGE_KEYS.FIZRUK_WELLBEING,
      STORAGE_KEYS.FIZRUK_DAILY_LOG,
    ]);
  });

  it("snapshot of nutrition keys", () => {
    expect(SYNC_MODULES.nutrition.keys).toEqual([
      STORAGE_KEYS.NUTRITION_LOG,
      STORAGE_KEYS.NUTRITION_PANTRIES,
      STORAGE_KEYS.NUTRITION_ACTIVE_PANTRY,
      STORAGE_KEYS.NUTRITION_PREFS,
      STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
    ]);
  });

  it("snapshot of profile keys", () => {
    expect(SYNC_MODULES.profile.keys).toEqual([STORAGE_KEYS.USER_PROFILE]);
  });

  it("does NOT include sync-bookkeeping keys (those are metadata, not payload)", () => {
    const trackedValues = ALL_TRACKED_KEYS;
    expect(trackedValues.has(STORAGE_KEYS.SYNC_VERSIONS)).toBe(false);
    expect(trackedValues.has(STORAGE_KEYS.SYNC_DIRTY_MODULES)).toBe(false);
    expect(trackedValues.has(STORAGE_KEYS.SYNC_OFFLINE_QUEUE)).toBe(false);
    expect(trackedValues.has(STORAGE_KEYS.SYNC_MIGRATION_DONE)).toBe(false);
    expect(trackedValues.has(STORAGE_KEYS.MOBILE_SYNC_VERSIONS)).toBe(false);
    expect(trackedValues.has(STORAGE_KEYS.MOBILE_SYNC_DIRTY_MODULES)).toBe(
      false,
    );
    expect(trackedValues.has(STORAGE_KEYS.MOBILE_SYNC_OFFLINE_QUEUE)).toBe(
      false,
    );
  });

  it("does NOT include the Monobank token (server-only — see PR #002)", () => {
    expect(ALL_TRACKED_KEYS.has(STORAGE_KEYS.FINYK_TOKEN)).toBe(false);
  });

  it("ALL_TRACKED_KEYS contains exactly the union of every module's keys", () => {
    const expected = new Set<string>();
    for (const config of Object.values(SYNC_MODULES)) {
      for (const k of config.keys) expected.add(k);
    }
    expect(new Set(ALL_TRACKED_KEYS)).toEqual(expected);
    // No accidental duplicate keys across modules — the count of the
    // flat list equals the size of the deduped set.
    const flat = Object.values(SYNC_MODULES).flatMap((m) => m.keys);
    expect(flat.length).toBe(expected.size);
  });

  describe("keyToModule", () => {
    it("returns the owning module for tracked keys", () => {
      expect(keyToModule(STORAGE_KEYS.FINYK_BUDGETS)).toBe("finyk");
      expect(keyToModule(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBe("fizruk");
      expect(keyToModule(STORAGE_KEYS.NUTRITION_SAVED_RECIPES)).toBe(
        "nutrition",
      );
      expect(keyToModule(STORAGE_KEYS.USER_PROFILE)).toBe("profile");
    });

    it("returns null for unknown keys", () => {
      expect(keyToModule("hub_routine_v1")).toBeNull();
      expect(keyToModule("totally_made_up_key")).toBeNull();
      expect(keyToModule("")).toBeNull();
    });

    it("returns null for sync metadata keys (they are not payload)", () => {
      expect(keyToModule(STORAGE_KEYS.SYNC_VERSIONS)).toBeNull();
      expect(keyToModule(STORAGE_KEYS.SYNC_DIRTY_MODULES)).toBeNull();
      expect(keyToModule(STORAGE_KEYS.MOBILE_SYNC_VERSIONS)).toBeNull();
    });

    it("ModuleName covers every literal key of SYNC_MODULES", () => {
      // Compile-time check that the type stays in sync with the
      // value. If a module is added to SYNC_MODULES but the type is
      // not regenerated, this assignment would fail to typecheck.
      const allModules: ModuleName[] = [
        "finyk",
        "fizruk",
        "nutrition",
        "profile",
      ];
      expect(allModules.sort()).toEqual(Object.keys(SYNC_MODULES).sort());
    });
  });

  describe("event + cap constants", () => {
    it("SYNC_EVENT is the historical web event name", () => {
      expect(SYNC_EVENT).toBe("hub-cloud-sync-dirty");
    });

    it("SYNC_STATUS_EVENT is the historical status event name", () => {
      expect(SYNC_STATUS_EVENT).toBe("hub-cloud-sync-status");
    });

    it("MAX_OFFLINE_QUEUE keeps the documented cap", () => {
      expect(MAX_OFFLINE_QUEUE).toBe(50);
    });
  });
});
