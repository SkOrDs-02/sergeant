/**
 * Phase 7 / PR 3 — mobile nutrition storage foundation.
 *
 * Verifies that every `load*` / `save*` helper in `nutritionStore.ts`
 * routes through `safeReadLS` / `safeWriteLS` (→ MMKV) and delegates
 * normalization to `@sergeant/nutrition-domain`. Storage primitives
 * are mocked so the suite stays pure — we never touch real MMKV.
 */
const mockSafeReadLS = jest.fn();
const mockSafeReadStringLS = jest.fn();
const mockSafeWriteLS = jest.fn();

jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeReadStringLS: (...args: unknown[]) => mockSafeReadStringLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
}));

import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  SHOPPING_LIST_KEY,
  WATER_LOG_KEY,
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

beforeEach(() => {
  mockSafeReadLS.mockReset().mockReturnValue(null);
  mockSafeReadStringLS.mockReset().mockReturnValue(null);
  mockSafeWriteLS.mockReset().mockReturnValue(true);
});

describe("mobile nutritionStore — log", () => {
  it("loadNutritionLog normalises missing data into an empty log", () => {
    const out = loadNutritionLog();
    expect(mockSafeReadLS).toHaveBeenCalledWith(NUTRITION_LOG_KEY, null);
    expect(out).toEqual({});
  });

  it("loadNutritionLog normalises one well-formed day", () => {
    mockSafeReadLS.mockReturnValueOnce({
      "2024-01-15": {
        meals: [{ id: "m1", name: "Сніданок", mealType: "breakfast" }],
      },
    });
    const out = loadNutritionLog();
    expect(out["2024-01-15"]!.meals).toHaveLength(1);
    expect(out["2024-01-15"]!.meals[0]!.id).toBe("m1");
  });

  it("saveNutritionLog writes to the canonical key", () => {
    saveNutritionLog({ "2024-01-15": { meals: [] } });
    expect(mockSafeWriteLS).toHaveBeenCalledWith(NUTRITION_LOG_KEY, {
      "2024-01-15": { meals: [] },
    });
  });

  it("saveNutritionLog with null writes an empty object (not null)", () => {
    saveNutritionLog(null);
    expect(mockSafeWriteLS).toHaveBeenCalledWith(NUTRITION_LOG_KEY, {});
  });
});

describe("mobile nutritionStore — prefs", () => {
  it("loadNutritionPrefs returns defaults for missing input", () => {
    const out = loadNutritionPrefs();
    expect(mockSafeReadLS).toHaveBeenCalledWith(NUTRITION_PREFS_KEY, null);
    expect(out.goal).toBe("balanced");
    expect(out.waterGoalMl).toBe(2000);
  });

  it("loadNutritionPrefs normalises custom water goal", () => {
    mockSafeReadLS.mockReturnValueOnce({ waterGoalMl: 2500 });
    expect(loadNutritionPrefs().waterGoalMl).toBe(2500);
  });

  it("saveNutritionPrefs persists provided prefs", () => {
    const prefs = { goal: "cut" } as Parameters<typeof saveNutritionPrefs>[0];
    saveNutritionPrefs(prefs);
    expect(mockSafeWriteLS).toHaveBeenCalledWith(NUTRITION_PREFS_KEY, prefs);
  });
});

describe("mobile nutritionStore — pantries", () => {
  it("loadActivePantryId defaults to `home` when nothing is stored", () => {
    expect(loadActivePantryId()).toBe("home");
    expect(mockSafeReadStringLS).toHaveBeenCalledWith(
      NUTRITION_ACTIVE_PANTRY_KEY,
      null,
    );
  });

  it("loadActivePantryId returns stored id", () => {
    mockSafeReadStringLS.mockReturnValueOnce("work");
    expect(loadActivePantryId()).toBe("work");
  });

  it("saveActivePantryId persists under the active key", () => {
    saveActivePantryId("work");
    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      NUTRITION_ACTIVE_PANTRY_KEY,
      "work",
    );
  });

  it("loadPantries seeds the default pantry on first launch", () => {
    const out = loadPantries();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("home");
    // Seeded default also writes the active pointer.
    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      NUTRITION_ACTIVE_PANTRY_KEY,
      "home",
    );
  });

  it("loadPantries normalises existing pantries", () => {
    mockSafeReadLS.mockReturnValueOnce([
      { id: "home", name: "Дім", items: [], text: "" },
      { id: "work", name: "Робота", items: [], text: "" },
    ]);
    const out = loadPantries();
    expect(out.map((p) => p.id)).toEqual(["home", "work"]);
  });

  it("savePantries writes pantries + optional active id", () => {
    savePantries([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    expect(mockSafeWriteLS).toHaveBeenCalledWith(NUTRITION_PANTRIES_KEY, [
      { id: "home", name: "Дім", items: [], text: "" },
    ]);
    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      NUTRITION_ACTIVE_PANTRY_KEY,
      "home",
    );
  });

  it("savePantries skips active-id write when none provided", () => {
    savePantries([{ id: "home", name: "Дім", items: [], text: "" }]);
    const writtenKeys = mockSafeWriteLS.mock.calls.map((c) => c[0]);
    expect(writtenKeys).toContain(NUTRITION_PANTRIES_KEY);
    expect(writtenKeys).not.toContain(NUTRITION_ACTIVE_PANTRY_KEY);
  });
});

describe("mobile nutritionStore — water", () => {
  it("loadWaterLog returns an empty object on missing data", () => {
    expect(loadWaterLog()).toEqual({});
    expect(mockSafeReadLS).toHaveBeenCalledWith(WATER_LOG_KEY, null);
  });

  it("loadWaterLog keeps only positive ISO-date entries", () => {
    mockSafeReadLS.mockReturnValueOnce({
      "2024-01-15": 1500,
      "not-a-date": 999,
      "2024-01-16": -5,
    });
    expect(loadWaterLog()).toEqual({ "2024-01-15": 1500 });
  });

  it("saveWaterLog normalises before persisting", () => {
    saveWaterLog({ "2024-01-15": 1500, "bad-key": 1 });
    expect(mockSafeWriteLS).toHaveBeenCalledWith(WATER_LOG_KEY, {
      "2024-01-15": 1500,
    });
  });
});

describe("mobile nutritionStore — shopping list", () => {
  it("loadShoppingList returns empty categories on missing data", () => {
    expect(loadShoppingList()).toEqual({ categories: [] });
    expect(mockSafeReadLS).toHaveBeenCalledWith(SHOPPING_LIST_KEY, null);
  });

  it("loadShoppingList normalises categories + items", () => {
    mockSafeReadLS.mockReturnValueOnce({
      categories: [
        {
          name: "Овочі",
          items: [
            { id: "a", name: "Морква" },
            { id: "b", name: "" },
          ],
        },
      ],
    });
    const out = loadShoppingList();
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]!.items).toHaveLength(1);
    expect(out.categories[0]!.items[0]!.name).toBe("Морква");
  });

  it("saveShoppingList normalises before persisting", () => {
    saveShoppingList({ categories: [] });
    expect(mockSafeWriteLS).toHaveBeenCalledWith(SHOPPING_LIST_KEY, {
      categories: [],
    });
  });
});
