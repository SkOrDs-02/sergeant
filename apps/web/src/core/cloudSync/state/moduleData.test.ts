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

describe("collectModuleData", () => {
  it("returns null for unknown module", () => {
    expect(collectModuleData("ghost")).toBeNull();
  });

  it("returns empty object when no LS keys are set for the module", () => {
    expect(collectModuleData("finyk")).toEqual({});
  });

  it("collects only keys that are present", () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_BUDGETS,
      JSON.stringify([{ id: 1 }]),
    );
    const data = collectModuleData("finyk");
    expect(data).not.toBeNull();
    expect(data).toHaveProperty(STORAGE_KEYS.FINYK_BUDGETS);
    expect(
      (data as Record<string, unknown>)[STORAGE_KEYS.FINYK_BUDGETS],
    ).toEqual([{ id: 1 }]);
  });

  it("preserves raw string when value is not valid JSON", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "not-json");
    const data = collectModuleData("finyk") as Record<string, unknown>;
    expect(data[STORAGE_KEYS.FINYK_BUDGETS]).toBe("not-json");
  });

  it("swallows getItem exceptions and returns the keys it could read", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, JSON.stringify({ ok: 1 }));
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
    const data = collectModuleData("finyk") as Record<string, unknown>;
    spy.mockRestore();
    // First key threw → not in output. Subsequent keys are read normally.
    expect(data[STORAGE_KEYS.FINYK_BUDGETS]).toEqual({ ok: 1 });
  });
});

describe("hasLocalData", () => {
  it("returns false for unknown module", () => {
    expect(hasLocalData("ghost")).toBe(false);
  });

  it("returns false when no module key is set", () => {
    expect(hasLocalData("finyk")).toBe(false);
  });

  it("returns true when at least one module key is set", () => {
    localStorage.setItem(STORAGE_KEYS.FINYK_BUDGETS, "[]");
    expect(hasLocalData("finyk")).toBe(true);
  });
});

describe("applyModuleData", () => {
  it("ignores non-object data", () => {
    applyModuleData("finyk", null);
    applyModuleData("finyk", "string");
    applyModuleData("finyk", 42);
    expect(localStorage.length).toBe(0);
  });

  it("ignores unknown module", () => {
    applyModuleData("ghost", { x: 1 });
    expect(localStorage.length).toBe(0);
  });

  it("writes only keys that belong to the module", () => {
    // PR #030 retired fizruk and PR #034 retired nutrition — neither
    // `STORAGE_KEYS.FIZRUK_WORKOUTS` nor `STORAGE_KEYS.NUTRITION_LOG`
    // is tracked by any module any more, so applyModuleData("finyk", …)
    // must skip them the same way it skips truly unrelated keys.
    applyModuleData("finyk", {
      [STORAGE_KEYS.FINYK_BUDGETS]: [{ id: 1 }],
      [STORAGE_KEYS.NUTRITION_LOG]: { leak: true },
      [STORAGE_KEYS.FIZRUK_WORKOUTS]: ["retired"],
      unrelated: { x: 1 },
    });
    expect(localStorage.getItem(STORAGE_KEYS.FINYK_BUDGETS)).toBe(
      JSON.stringify([{ id: 1 }]),
    );
    expect(localStorage.getItem(STORAGE_KEYS.NUTRITION_LOG)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.FIZRUK_WORKOUTS)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBeNull();
  });

  it("stores string values verbatim instead of double-encoding", () => {
    applyModuleData("finyk", {
      [STORAGE_KEYS.FINYK_BUDGETS]: "literal",
    });
    expect(localStorage.getItem(STORAGE_KEYS.FINYK_BUDGETS)).toBe("literal");
  });

  it("swallows setItem exceptions", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() =>
      applyModuleData("finyk", {
        [STORAGE_KEYS.FINYK_BUDGETS]: [{ id: 1 }],
      }),
    ).not.toThrow();
    spy.mockRestore();
  });
});

describe("clearSyncManagedData", () => {
  it("calls the supplied raw remover for every tracked module key", () => {
    // PR #030 retired fizruk and PR #034 retired nutrition LS keys
    // from sync tracking. Any rows still living under
    // `fizruk_*_v1` / `nutrition_*_v1` (legacy data from before the
    // cut-over) must NOT be removed by clearSyncManagedData; the
    // sweep is restricted to the currently-tracked modules
    // (`finyk`, `profile`).
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
      expect.arrayContaining([
        STORAGE_KEYS.FINYK_BUDGETS,
        STORAGE_KEYS.USER_PROFILE,
      ]),
    );
    expect(removed).not.toContain(STORAGE_KEYS.FIZRUK_WORKOUTS);
    expect(removed).not.toContain(STORAGE_KEYS.NUTRITION_LOG);
    expect(localStorage.getItem(STORAGE_KEYS.FIZRUK_WORKOUTS)).toBe("[]");
    expect(localStorage.getItem(STORAGE_KEYS.NUTRITION_LOG)).toBe("{}");
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
