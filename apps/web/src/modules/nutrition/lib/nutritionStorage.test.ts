import { beforeEach, describe, expect, it } from "vitest";
import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  defaultNutritionPrefs,
  loadActivePantryId,
  loadNutritionLog,
  loadNutritionPrefs,
  loadPantries,
  normalizeNutritionLog,
  normalizePantries,
  persistPantries,
} from "./nutritionStorage";
import { storageManager } from "@shared/lib/storage/storageManager";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string): string | null =>
      store.has(String(k)) ? (store.get(String(k)) ?? null) : null,
    setItem: (k: string, v: string): void =>
      void store.set(String(k), String(v)),
    removeItem: (k: string): void => void store.delete(String(k)),
    clear: (): void => void store.clear(),
    _dump: (): Record<string, string> => Object.fromEntries(store.entries()),
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock() as unknown as Storage;
});

describe("loadActivePantryId", () => {
  it("returns home by default", () => {
    expect(loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY)).toBe("home");
  });
});

describe("loadPantries", () => {
  it("loads stored pantries when present", () => {
    globalThis.localStorage.setItem(
      NUTRITION_PANTRIES_KEY,
      JSON.stringify([{ id: "home", name: "Дім", items: [], text: "x" }]),
    );
    const pantries = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.text).toBe("x");
  });

  it("migrates from legacy keys when new key missing", () => {
    globalThis.localStorage.setItem(
      "nutrition_pantry_items_v0",
      JSON.stringify([{ name: "яйця", qty: 2, unit: "шт", notes: null }]),
    );
    globalThis.localStorage.setItem("nutrition_pantry_text_v0", "яйця");
    storageManager.resetMigration("nutrition_001_migrate_legacy_pantry");
    storageManager.runAll();
    const pantries = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.items).toHaveLength(1);
    expect(pantries[0]!.text).toBe("яйця");
    expect(globalThis.localStorage.getItem(NUTRITION_ACTIVE_PANTRY_KEY)).toBe(
      "home",
    );
  });
});

describe("persistPantries", () => {
  it("persists pantries and active id", () => {
    persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      [{ id: "a", name: "A", items: [], text: "" }],
      "a",
    );
    const raw = globalThis.localStorage.getItem(NUTRITION_PANTRIES_KEY);
    expect(JSON.parse(raw!)).toHaveLength(1);
    expect(globalThis.localStorage.getItem(NUTRITION_ACTIVE_PANTRY_KEY)).toBe(
      "a",
    );
  });
});

describe("normalizeNutritionLog", () => {
  it("infers mealType from Ukrainian label", () => {
    const raw = {
      "2026-01-01": {
        meals: [{ id: "x", name: "Суп", label: "Обід", macros: { kcal: 100 } }],
      },
    };
    const out = normalizeNutritionLog(raw);
    expect(out["2026-01-01"]!.meals[0]!.mealType).toBe("lunch");
    expect(out["2026-01-01"]!.meals[0]!.macros.kcal).toBe(100);
  });

  it("keeps mealType when valid", () => {
    const out = normalizeNutritionLog({
      "2026-02-02": {
        meals: [
          {
            id: "a",
            name: "x",
            mealType: "dinner",
            label: "Вечеря",
            macros: {},
          },
        ],
      },
    });
    expect(out["2026-02-02"]!.meals[0]!.mealType).toBe("dinner");
  });
});

describe("loadNutritionLog", () => {
  it("normalizes stored log", () => {
    globalThis.localStorage.setItem(
      NUTRITION_LOG_KEY,
      JSON.stringify({
        "2026-03-03": {
          meals: [{ name: "Тест", label: "Сніданок", macros: { kcal: 1 } }],
        },
      }),
    );
    const log = loadNutritionLog(NUTRITION_LOG_KEY);
    expect(log["2026-03-03"]!.meals[0]!.mealType).toBe("breakfast");
    expect(log["2026-03-03"]!.meals[0]!.id).toMatch(/^meal_/);
  });

  it("returns empty log when JSON is corrupted (does not crash UI)", () => {
    globalThis.localStorage.setItem(NUTRITION_LOG_KEY, "{not json");
    expect(loadNutritionLog(NUTRITION_LOG_KEY)).toEqual({});
  });
});

describe("loadPantries — reload & edge cases", () => {
  it("survives a reload — same data comes back", () => {
    persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const pantries = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.items[0]!.name).toBe("Молоко");
    expect(loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY)).toBe("home");
  });

  it("falls back to default pantry when storage holds empty array", () => {
    globalThis.localStorage.setItem(NUTRITION_PANTRIES_KEY, JSON.stringify([]));
    const pantries = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.id).toBe("home");
  });

  it("falls back to default pantry when JSON is corrupted", () => {
    globalThis.localStorage.setItem(NUTRITION_PANTRIES_KEY, "{not json");
    const pantries = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.id).toBe("home");
  });
});

describe("normalizePantries", () => {
  it("filters non-object entries and invalid items", () => {
    const out = normalizePantries([
      null,
      "oops",
      { id: "a", name: "A", items: [null, { name: "" }, { name: "Хліб" }] },
      { items: [{ name: "Сир" }] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.items.map((i) => i.name)).toEqual(["Хліб"]);
    expect(out[1]!.name).toBe("Склад");
    expect(out[1]!.id).toBeTruthy();
  });

  it("deduplicates pantry ids (re-assigns colliding ones)", () => {
    const out = normalizePantries([
      { id: "same", name: "A", items: [] },
      { id: "same", name: "B", items: [] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).not.toBe(out[1]!.id);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizePantries(null)).toEqual([]);
    expect(normalizePantries({})).toEqual([]);
    expect(normalizePantries("x")).toEqual([]);
  });
});

describe("loadNutritionPrefs — prefs survive corrupted / partial data", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY)).toEqual(
      defaultNutritionPrefs(),
    );
  });

  it("returns defaults when JSON is corrupted", () => {
    globalThis.localStorage.setItem(NUTRITION_PREFS_KEY, "{not json");
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY)).toEqual(
      defaultNutritionPrefs(),
    );
  });

  it("returns defaults when stored value is an array (type mismatch)", () => {
    globalThis.localStorage.setItem(NUTRITION_PREFS_KEY, JSON.stringify([1]));
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY)).toEqual(
      defaultNutritionPrefs(),
    );
  });

  it("merges partial prefs with defaults (prefs are not lost)", () => {
    globalThis.localStorage.setItem(
      NUTRITION_PREFS_KEY,
      JSON.stringify({ goal: "lean", servings: 3 }),
    );
    const prefs = loadNutritionPrefs(NUTRITION_PREFS_KEY);
    expect(prefs.goal).toBe("lean");
    expect(prefs.servings).toBe(3);
    // default fields preserved
    expect(prefs.timeMinutes).toBe(25);
    expect(prefs.waterGoalMl).toBe(2000);
    expect(prefs.mealTemplates).toEqual([]);
  });

  it("falls back to default waterGoalMl on invalid / non-positive values", () => {
    for (const bad of [null, "abc", -100, 0, undefined]) {
      globalThis.localStorage.setItem(
        NUTRITION_PREFS_KEY,
        JSON.stringify({ waterGoalMl: bad }),
      );
      expect(loadNutritionPrefs(NUTRITION_PREFS_KEY).waterGoalMl).toBe(2000);
    }
  });

  it("clamps reminderHour into [0,23]", () => {
    globalThis.localStorage.setItem(
      NUTRITION_PREFS_KEY,
      JSON.stringify({ reminderHour: 99 }),
    );
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY).reminderHour).toBe(23);

    globalThis.localStorage.setItem(
      NUTRITION_PREFS_KEY,
      JSON.stringify({ reminderHour: -5 }),
    );
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY).reminderHour).toBe(0);

    globalThis.localStorage.setItem(
      NUTRITION_PREFS_KEY,
      JSON.stringify({ reminderHour: "nope" }),
    );
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY).reminderHour).toBe(12);
  });

  it("filters invalid mealTemplates entries", () => {
    globalThis.localStorage.setItem(
      NUTRITION_PREFS_KEY,
      JSON.stringify({
        mealTemplates: [
          null,
          { id: "1", name: "", mealType: "snack" },
          { id: "2", name: "Омлет", mealType: "breakfast" },
          "oops",
        ],
      }),
    );
    const prefs = loadNutritionPrefs(NUTRITION_PREFS_KEY);
    expect(prefs.mealTemplates).toHaveLength(1);
    expect(prefs.mealTemplates[0]!.name).toBe("Омлет");
  });
});
