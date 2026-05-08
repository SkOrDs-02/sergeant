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
    // PR #030 retired `fizruk`, PR #034 retired `nutrition`, and
    // PR #039 retired `finyk` from the cross-platform `module_data`
    // cloud-sync registry (storage-roadmap Stage 4). Per-table
    // SQLite mirror + op-log carry workouts / measurements / meals /
    // pantries / recipes / budgets / subscriptions / transactions /
    // Mono cache now. Only `profile` (USER_PROFILE) remains as a
    // legacy module_data payload — the LS-only PWA install flag.
    expect(Object.keys(SYNC_MODULES).sort()).toEqual(["profile"]);
  });

  it("does NOT include the retired finyk module keys (PR #039)", () => {
    // PR #039 retirement guard — none of the nineteen historical
    // `module_data.finyk` LS/MMKV keys are tracked any more.
    const finykKeys = [
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
    ];
    for (const key of finykKeys) {
      expect(ALL_TRACKED_KEYS.has(key)).toBe(false);
      expect(keyToModule(key)).toBeNull();
    }
  });

  it("does NOT include the retired fizruk module keys (PR #030)", () => {
    // PR #030 retirement guard — none of the eleven historical
    // `module_data.fizruk` LS/MMKV keys are tracked any more.
    const fizrukKeys = [
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
    ];
    for (const key of fizrukKeys) {
      expect(ALL_TRACKED_KEYS.has(key)).toBe(false);
      expect(keyToModule(key)).toBeNull();
    }
  });

  it("does NOT include the retired nutrition module keys (PR #034)", () => {
    // PR #034 retirement guard — none of the five historical
    // `module_data.nutrition` LS/MMKV keys are tracked any more.
    const nutritionKeys = [
      STORAGE_KEYS.NUTRITION_LOG,
      STORAGE_KEYS.NUTRITION_PANTRIES,
      STORAGE_KEYS.NUTRITION_ACTIVE_PANTRY,
      STORAGE_KEYS.NUTRITION_PREFS,
      STORAGE_KEYS.NUTRITION_SAVED_RECIPES,
    ];
    for (const key of nutritionKeys) {
      expect(ALL_TRACKED_KEYS.has(key)).toBe(false);
      expect(keyToModule(key)).toBeNull();
    }
  });

  it("snapshot of profile keys", () => {
    // PR (biometrics) — the profile module also carries the hub-level
    // biometric parameters store (`hub_biometrics_v1`) so height /
    // birth-date / sex / activity-level / current-weight ride the same
    // CloudSync LWW path as the memory bank (`hub_user_profile_v1`).
    expect(SYNC_MODULES.profile.keys).toEqual([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.HUB_BIOMETRICS,
    ]);
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
      expect(keyToModule(STORAGE_KEYS.USER_PROFILE)).toBe("profile");
      expect(keyToModule(STORAGE_KEYS.HUB_BIOMETRICS)).toBe("profile");
    });

    it("returns null for unknown / retired keys", () => {
      // routine — retired in PR #026 (storage-roadmap Stage 4).
      expect(keyToModule("hub_routine_v1")).toBeNull();
      // fizruk — retired in PR #030 (storage-roadmap Stage 4).
      expect(keyToModule(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBeNull();
      expect(keyToModule(STORAGE_KEYS.FIZRUK_WORKOUTS)).toBeNull();
      // nutrition — retired in PR #034 (storage-roadmap Stage 4).
      expect(keyToModule(STORAGE_KEYS.NUTRITION_LOG)).toBeNull();
      expect(keyToModule(STORAGE_KEYS.NUTRITION_SAVED_RECIPES)).toBeNull();
      // finyk — retired in PR #039 (storage-roadmap Stage 4).
      expect(keyToModule(STORAGE_KEYS.FINYK_BUDGETS)).toBeNull();
      expect(keyToModule(STORAGE_KEYS.FINYK_NETWORTH_HISTORY)).toBeNull();
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
      // PR #030 retired `fizruk`, PR #034 retired `nutrition` and
      // PR #039 retired `finyk` (storage-roadmap Stage 4); only
      // `profile` remains.
      const allModules: ModuleName[] = ["profile"];
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

    it("MAX_OFFLINE_QUEUE keeps the documented cap (raised to 10 000 in PR #009 once web moved to IDB)", () => {
      expect(MAX_OFFLINE_QUEUE).toBe(10_000);
    });
  });
});
