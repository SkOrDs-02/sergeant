// @vitest-environment jsdom
import { STORAGE_KEYS } from "@sergeant/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_MODULES_KEY,
  MODULE_MODIFIED_KEY,
  OFFLINE_QUEUE_KEY,
} from "../config";
import {
  applyModuleData,
  clearSyncManagedData,
  collectModuleData,
  hasLocalData,
} from "./moduleData";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

// PR #030 retired `fizruk`, PR #034 retired `nutrition` and PR #039
// retired `finyk` from SYNC_MODULES (storage-roadmap Stage 4); only
// `profile` (USER_PROFILE) remains. The collect/has/apply helpers
// reject unknown modules via `SYNC_MODULES[moduleName]` lookup, so
// fixtures here use `profile` as the live module and treat retired
// modules (`finyk`, `nutrition`, `fizruk`) as unknown.
describe("collectModuleData", () => {
  it("returns null for unknown module", () => {
    expect(collectModuleData("ghost")).toBeNull();
  });

  it("returns null for the retired finyk module (PR #039)", () => {
    // Even when legacy `finyk_*` LS rows exist, collectModuleData must
    // refuse to push them because finyk is no longer in SYNC_MODULES.
    localStorage.setItem(
      STORAGE_KEYS.FINYK_BUDGETS,
      JSON.stringify([{ id: 1 }]),
    );
    expect(collectModuleData("finyk")).toBeNull();
  });

  it("returns empty object when no LS keys are set for the module", () => {
    expect(collectModuleData("profile")).toEqual({});
  });

  it("collects only keys that are present", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify({ id: 1 }));
    const data = collectModuleData("profile");
    expect(data).not.toBeNull();
    expect(data).toHaveProperty(STORAGE_KEYS.USER_PROFILE);
    expect(
      (data as Record<string, unknown>)[STORAGE_KEYS.USER_PROFILE],
    ).toEqual({ id: 1 });
  });

  it("preserves raw string when value is not valid JSON", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, "not-json");
    const data = collectModuleData("profile") as Record<string, unknown>;
    expect(data[STORAGE_KEYS.USER_PROFILE]).toBe("not-json");
  });

  it("swallows getItem exceptions and returns the keys it could read", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify({ ok: 1 }));
    let firstCall = true;
    const original = Storage.prototype.getItem;
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(function (this: Storage, key: string) {
        if (firstCall) {
          firstCall = false;
          throw new Error("storage broken");
        }
        return original.call(this, key);
      });
    const data = collectModuleData("profile") as Record<string, unknown>;
    spy.mockRestore();
    // First key threw → not in output. Subsequent keys are read normally
    // (profile only has one key, so the swallow path is exercised even
    // when the module's first key is the one that throws).
    expect(data[STORAGE_KEYS.USER_PROFILE]).toBeUndefined();
  });
});

describe("hasLocalData", () => {
  it("returns false for unknown module", () => {
    expect(hasLocalData("ghost")).toBe(false);
  });

  it("returns false for the retired finyk module (PR #039)", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    expect(hasLocalData("finyk")).toBe(false);
  });

  it("returns false when no module key is set", () => {
    expect(hasLocalData("profile")).toBe(false);
  });

  it("returns true when at least one module key is set", () => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, "{}");
    expect(hasLocalData("profile")).toBe(true);
  });
});

describe("applyModuleData", () => {
  it("ignores non-object data", () => {
    applyModuleData("profile", null);
    applyModuleData("profile", "string");
    applyModuleData("profile", 42);
    expect(localStorage.length).toBe(0);
  });

  it("ignores unknown module", () => {
    applyModuleData("ghost", { x: 1 });
    expect(localStorage.length).toBe(0);
  });

  it("ignores the retired finyk module (PR #039)", () => {
    applyModuleData("finyk", {
      [STORAGE_KEYS.FINYK_BUDGETS]: [{ id: 1 }],
    });
    expect(localStorage.getItem(STORAGE_KEYS.FINYK_BUDGETS)).toBeNull();
  });

  it("writes only keys that belong to the module", () => {
    // PR #030 retired fizruk, PR #034 retired nutrition and PR #039
    // retired finyk — none of `STORAGE_KEYS.FIZRUK_WORKOUTS`,
    // `STORAGE_KEYS.NUTRITION_LOG`, or `STORAGE_KEYS.FINYK_BUDGETS`
    // is tracked by any module any more, so applyModuleData("profile",
    // …) must skip them the same way it skips truly unrelated keys.
    applyModuleData("profile", {
      [STORAGE_KEYS.USER_PROFILE]: { id: 1 },
      [STORAGE_KEYS.NUTRITION_LOG]: { leak: true },
      [STORAGE_KEYS.FIZRUK_WORKOUTS]: ["retired"],
      [STORAGE_KEYS.FINYK_BUDGETS]: ["retired"],
      unrelated: { x: 1 },
    });
    expect(localStorage.getItem(STORAGE_KEYS.USER_PROFILE)).toBe(
      JSON.stringify({ id: 1 }),
    );
    expect(localStorage.getItem(STORAGE_KEYS.NUTRITION_LOG)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.FIZRUK_WORKOUTS)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.FINYK_BUDGETS)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBeNull();
  });

  it("stores string values verbatim instead of double-encoding", () => {
    applyModuleData("profile", {
      [STORAGE_KEYS.USER_PROFILE]: "literal",
    });
    expect(localStorage.getItem(STORAGE_KEYS.USER_PROFILE)).toBe("literal");
  });

  it("swallows setItem exceptions", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() =>
      applyModuleData("profile", {
        [STORAGE_KEYS.USER_PROFILE]: { id: 1 },
      }),
    ).not.toThrow();
    spy.mockRestore();
  });
});

describe("clearSyncManagedData", () => {
  it("calls the supplied raw remover for every tracked module key", () => {
    // PR #030 retired fizruk, PR #034 retired nutrition and PR #039
    // retired finyk LS keys from sync tracking. Any rows still living
    // under `fizruk_*_v1` / `nutrition_*_v1` / `finyk_*` (legacy data
    // from before the cut-over) must NOT be removed by
    // clearSyncManagedData; the sweep is restricted to the currently-
    // tracked modules (`profile`).
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, "{}");
    localStorage.setItem(STORAGE_KEYS.NUTRITION_LOG, "{}");
    localStorage.setItem(STORAGE_KEYS.FIZRUK_WORKOUTS, "[]");
    localStorage.setItem(DIRTY_MODULES_KEY, "{}");
    localStorage.setItem(OFFLINE_QUEUE_KEY, "[]");
    localStorage.setItem(MODULE_MODIFIED_KEY, "{}");
    const removed: string[] = [];
    clearSyncManagedData((key) => {
      removed.push(key);
      localStorage.removeItem(key);
    });
    expect(removed).toEqual(
      expect.arrayContaining([STORAGE_KEYS.USER_PROFILE]),
    );
    expect(removed).not.toContain(STORAGE_KEYS.FIZRUK_WORKOUTS);
    expect(removed).not.toContain(STORAGE_KEYS.NUTRITION_LOG);
    expect(removed).not.toContain(STORAGE_KEYS.FINYK_BUDGETS);
    expect(localStorage.getItem(STORAGE_KEYS.FIZRUK_WORKOUTS)).toBe("[]");
    expect(localStorage.getItem(STORAGE_KEYS.NUTRITION_LOG)).toBe("{}");
    expect(localStorage.getItem(STORAGE_KEYS.FINYK_BUDGETS)).toBe("[]");
    // Sync-internal bookkeeping is wiped via the standard removeItem.
    expect(localStorage.getItem(DIRTY_MODULES_KEY)).toBeNull();
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
    expect(localStorage.getItem(MODULE_MODIFIED_KEY)).toBeNull();
  });

  it("swallows exceptions thrown by the supplied remover", () => {
    expect(() =>
      clearSyncManagedData(() => {
        throw new Error("nope");
      }),
    ).not.toThrow();
  });
});
