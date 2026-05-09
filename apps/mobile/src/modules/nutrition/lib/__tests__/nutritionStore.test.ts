/**
 * Phase 7 / PR 3 — mobile nutrition storage foundation, rewired for
 * Stage 8 PR #057n-tombstone-mobile (`docs/planning/storage-roadmap.md`).
 *
 * The Nutrition `load*` / `save*` helpers no longer touch MMKV — every
 * slot (log / prefs / pantries / water / shopping list) now reads from
 * the SQLite warm cache and dual-writes through
 * `triggerNutritionDualWrite(prev, next)`. The suite seeds the cache
 * via `__setNutritionSqliteCacheForTests` and asserts that `save*`
 * never calls `safeWriteLS`.
 */
const mockSafeReadLS = jest.fn();
const mockSafeReadStringLS = jest.fn();
const mockSafeWriteLS = jest.fn();

jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeReadStringLS: (...args: unknown[]) => mockSafeReadStringLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
}));

const mockTriggerDualWrite = jest.fn();
const mockIsRegistered = jest.fn();

jest.mock("../dualWrite", () => ({
  triggerNutritionDualWrite: (...args: unknown[]) =>
    mockTriggerDualWrite(...args),
  isNutritionDualWriteRegistered: () => mockIsRegistered(),
}));

import {
  defaultNutritionPrefs,
  type NutritionLog,
  type ShoppingList,
  type WaterLog,
} from "@sergeant/nutrition-domain";

import {
  loadActivePantryId,
  loadNutritionLog,
  loadNutritionPrefs,
  loadPantries,
  loadShoppingList,
  loadWaterLog,
  saveActivePantryId,
  saveNutritionLog,
  saveNutritionPrefs,
  savePantries,
  saveShoppingList,
  saveWaterLog,
} from "../nutritionStore";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../sqliteReader";

beforeEach(() => {
  mockSafeReadLS.mockReset().mockReturnValue(null);
  mockSafeReadStringLS.mockReset().mockReturnValue(null);
  mockSafeWriteLS.mockReset().mockReturnValue(true);
  mockTriggerDualWrite.mockReset();
  // Default: dual-write is registered → save paths actually fire the
  // trigger. Individual tests flip this to `false` when they want to
  // verify the early-return guard.
  mockIsRegistered.mockReset().mockReturnValue(true);
  clearNutritionSqliteCache();
});

describe("mobile nutritionStore — log", () => {
  it("loadNutritionLog returns an empty log when the cache is cold", () => {
    expect(loadNutritionLog()).toEqual({});
    // No MMKV reads — the cache is the only source.
    expect(mockSafeReadLS).not.toHaveBeenCalled();
  });

  it("loadNutritionLog reads from the SQLite warm cache", () => {
    const seeded: NutritionLog = {
      "2024-01-15": {
        meals: [
          {
            id: "m1",
            name: "Сніданок",
            mealType: "breakfast",
            time: "08:00",
            label: "",
            source: "manual",
            macroSource: "manual",
            macros: null,
          },
        ],
      },
    } as unknown as NutritionLog;
    __setNutritionSqliteCacheForTests({ log: seeded });
    const out = loadNutritionLog();
    expect(out["2024-01-15"]!.meals).toHaveLength(1);
    expect(out["2024-01-15"]!.meals[0]!.id).toBe("m1");
  });

  it("saveNutritionLog dispatches a dual-write op and never touches MMKV", () => {
    const payload: NutritionLog = {
      "2024-01-15": {
        meals: [
          {
            id: "m1",
            name: "Сніданок",
            mealType: "breakfast",
            time: "08:00",
            label: "",
            source: "manual",
            macroSource: "manual",
            macros: null,
          },
        ],
      },
    } as unknown as NutritionLog;
    saveNutritionLog(payload);
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.meals).toHaveLength(1);
    expect(next.meals[0]).toMatchObject({ id: "m1", dateKey: "2024-01-15" });
  });

  it("saveNutritionLog with null sends an empty meals array", () => {
    saveNutritionLog(null);
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.meals).toEqual([]);
  });

  it("saveNutritionLog is a no-op when dual-write is not registered", () => {
    mockIsRegistered.mockReturnValue(false);
    expect(saveNutritionLog({ "2024-01-15": { meals: [] } })).toBe(true);
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
  });
});

describe("mobile nutritionStore — prefs", () => {
  it("loadNutritionPrefs returns defaults for an empty cache", () => {
    const out = loadNutritionPrefs();
    expect(out.goal).toBe("balanced");
    expect(out.waterGoalMl).toBe(2000);
    expect(mockSafeReadLS).not.toHaveBeenCalled();
  });

  it("loadNutritionPrefs reads custom values from the cache", () => {
    __setNutritionSqliteCacheForTests({
      prefs: { ...defaultNutritionPrefs(), waterGoalMl: 2500 },
    });
    expect(loadNutritionPrefs().waterGoalMl).toBe(2500);
  });

  it("saveNutritionPrefs dispatches a dual-write op", () => {
    const prefs = defaultNutritionPrefs();
    saveNutritionPrefs(prefs);
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.prefs?.prefsJson).toBe(JSON.stringify(prefs));
  });
});

describe("mobile nutritionStore — pantries", () => {
  it("loadActivePantryId defaults to `home` when the cache is cold", () => {
    expect(loadActivePantryId()).toBe("home");
    expect(mockSafeReadStringLS).not.toHaveBeenCalled();
  });

  it("loadActivePantryId returns the cached id", () => {
    __setNutritionSqliteCacheForTests({ activePantryId: "work" });
    expect(loadActivePantryId()).toBe("work");
  });

  it("saveActivePantryId dispatches a dual-write op with the new id", () => {
    saveActivePantryId("work");
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.prefs?.activePantryId).toBe("work");
  });

  it("loadPantries returns an in-memory default pantry on a cold cache", () => {
    const out = loadPantries();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("home");
    // No MMKV write for the seed default — Stage 8 PR #057n-tombstone
    // promotes pantry creation to the dual-write path.
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
  });

  it("loadPantries reads existing pantries from the cache", () => {
    __setNutritionSqliteCacheForTests({
      pantries: [
        { id: "home", name: "Дім", items: [], text: "" },
        { id: "work", name: "Робота", items: [], text: "" },
      ],
    });
    const out = loadPantries();
    expect(out.map((p) => p.id)).toEqual(["home", "work"]);
  });

  it("savePantries dispatches a dual-write op with snapshots + active id", () => {
    savePantries([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.pantries).toEqual([
      expect.objectContaining({ id: "home", name: "Дім" }),
    ]);
    expect(next.prefs?.activePantryId).toBe("home");
  });

  it("savePantries is a no-op when dual-write is not registered", () => {
    mockIsRegistered.mockReturnValue(false);
    expect(
      savePantries([{ id: "home", name: "Дім", items: [], text: "" }]),
    ).toBe(true);
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
  });
});

describe("mobile nutritionStore — water", () => {
  it("loadWaterLog returns an empty object when the cache is cold", () => {
    expect(loadWaterLog()).toEqual({});
    // No MMKV read — the cache is the only source.
    expect(mockSafeReadLS).not.toHaveBeenCalled();
  });

  it("loadWaterLog reads from the SQLite warm cache and drops stale entries", () => {
    const seeded: WaterLog = {
      "2024-01-15": 1500,
      "not-a-date": 999,
      "2024-01-16": -5,
    } as unknown as WaterLog;
    __setNutritionSqliteCacheForTests({ waterLog: seeded });
    expect(loadWaterLog()).toEqual({ "2024-01-15": 1500 });
  });

  it("saveWaterLog dispatches a dual-write op and never touches MMKV", () => {
    saveWaterLog({ "2024-01-15": 1500, "bad-key": 999 });
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.waterLog).toEqual({ "2024-01-15": 1500 });
  });

  it("saveWaterLog is a no-op when dual-write is not registered", () => {
    mockIsRegistered.mockReturnValue(false);
    expect(saveWaterLog({ "2024-01-15": 1500 })).toBe(true);
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
  });
});

describe("mobile nutritionStore — shopping list", () => {
  it("loadShoppingList returns empty categories when the cache is cold", () => {
    expect(loadShoppingList()).toEqual({ categories: [] });
    expect(mockSafeReadLS).not.toHaveBeenCalled();
  });

  it("loadShoppingList reads + normalises from the SQLite warm cache", () => {
    const seeded: ShoppingList = {
      categories: [
        {
          name: "Овочі",
          items: [
            {
              id: "a",
              name: "Морква",
            } as unknown as ShoppingList["categories"][number]["items"][number],
            {
              id: "b",
              name: "",
            } as unknown as ShoppingList["categories"][number]["items"][number],
          ],
        },
      ],
    };
    __setNutritionSqliteCacheForTests({ shoppingList: seeded });
    const out = loadShoppingList();
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]!.items).toHaveLength(1);
    expect(out.categories[0]!.items[0]!.name).toBe("Морква");
  });

  it("saveShoppingList dispatches a dual-write op and never touches MMKV", () => {
    saveShoppingList({
      categories: [{ name: "Овочі", items: [{ id: "a", name: "Морква" }] }],
    });
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
    expect(mockTriggerDualWrite).toHaveBeenCalledTimes(1);
    const [, next] = mockTriggerDualWrite.mock.calls[0]!;
    expect(next.shoppingList).toBeTruthy();
    const parsed = JSON.parse(next.shoppingList!.dataJson);
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0].name).toBe("Овочі");
  });

  it("saveShoppingList is a no-op when dual-write is not registered", () => {
    mockIsRegistered.mockReturnValue(false);
    expect(saveShoppingList({ categories: [] })).toBe(true);
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
    expect(mockSafeWriteLS).not.toHaveBeenCalled();
  });
});
