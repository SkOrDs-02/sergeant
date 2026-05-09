/**
 * Stage 8 PR #057n-tombstone — `load*` / `persist*` no longer read from
 * (or write to) `localStorage`. Reads come from the SQLite warm cache
 * (`apps/web/src/modules/nutrition/lib/sqliteReader.ts`) and writes go
 * through `triggerNutritionDualWrite`. These tests exercise the new
 * surface using `__setNutritionSqliteCacheForTests` and a
 * `vi.mock` of the dual-write trigger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const triggerSpy = vi.fn();
let dualWriteRegistered = true;

vi.mock("./dualWrite/index", async () => {
  const actual =
    await vi.importActual<typeof import("./dualWrite/index")>(
      "./dualWrite/index",
    );
  return {
    ...actual,
    triggerNutritionDualWrite: (...args: unknown[]) => triggerSpy(...args),
    isNutritionDualWriteRegistered: () => dualWriteRegistered,
  };
});

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
  persistNutritionLog,
  persistNutritionPrefs,
  persistPantries,
  type Pantry,
} from "./nutritionStorage";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "./sqliteReader";

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
  clearNutritionSqliteCache();
  triggerSpy.mockReset();
  dualWriteRegistered = true;
});

afterEach(() => {
  clearNutritionSqliteCache();
});

// -------------------------------------------------------------------------
// Reads — backed by SQLite warm cache.
// -------------------------------------------------------------------------

describe("loadActivePantryId — cache-backed", () => {
  it("returns home when cache has no active pantry", () => {
    expect(loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY)).toBe("home");
  });

  it("returns the cache value once set", () => {
    __setNutritionSqliteCacheForTests({ activePantryId: "kitchen" });
    expect(loadActivePantryId(NUTRITION_ACTIVE_PANTRY_KEY)).toBe("kitchen");
  });
});

describe("loadPantries — cache-backed", () => {
  it("returns the default pantry when cache is empty", () => {
    const pantries = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(pantries).toHaveLength(1);
    expect(pantries[0]!.id).toBe("home");
  });

  it("returns cached pantries when present", () => {
    const pantries: Pantry[] = [
      { id: "home", name: "Дім", items: [], text: "x" },
      { id: "work", name: "Робота", items: [], text: "" },
    ];
    __setNutritionSqliteCacheForTests({ pantries });
    const out = loadPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.text).toBe("x");
  });
});

describe("loadNutritionLog — cache-backed", () => {
  it("returns empty object when cache is empty", () => {
    expect(loadNutritionLog(NUTRITION_LOG_KEY)).toEqual({});
  });

  it("normalizes the cached log", () => {
    __setNutritionSqliteCacheForTests({
      log: {
        "2026-03-03": {
          meals: [
            {
              id: "m1",
              name: "Тест",
              label: "Сніданок",
              macros: { kcal: 1, protein_g: null, fat_g: null, carbs_g: null },
              time: "08:00",
              mealType: "breakfast",
              source: "manual",
              macroSource: "manual",
              amount_g: null,
              foodId: null,
            },
          ],
        },
      },
    });
    const log = loadNutritionLog(NUTRITION_LOG_KEY);
    expect(log["2026-03-03"]!.meals[0]!.mealType).toBe("breakfast");
  });
});

describe("loadNutritionPrefs — cache-backed defaults", () => {
  it("returns defaults when cache has no prefs", () => {
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY)).toEqual(
      defaultNutritionPrefs(),
    );
  });

  it("returns the cached prefs when set", () => {
    __setNutritionSqliteCacheForTests({
      prefs: { ...defaultNutritionPrefs(), goal: "lean", servings: 3 },
    });
    const prefs = loadNutritionPrefs(NUTRITION_PREFS_KEY);
    expect(prefs.goal).toBe("lean");
    expect(prefs.servings).toBe(3);
    // default fields preserved by normalize
    expect(prefs.timeMinutes).toBe(25);
    expect(prefs.waterGoalMl).toBe(2000);
  });

  it("clamps reminderHour into [0,23]", () => {
    __setNutritionSqliteCacheForTests({
      prefs: {
        ...defaultNutritionPrefs(),
        reminderHour: 99 as unknown as number,
      },
    });
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY).reminderHour).toBe(23);

    __setNutritionSqliteCacheForTests({
      prefs: {
        ...defaultNutritionPrefs(),
        reminderHour: -5 as unknown as number,
      },
    });
    expect(loadNutritionPrefs(NUTRITION_PREFS_KEY).reminderHour).toBe(0);
  });
});

// -------------------------------------------------------------------------
// Writes — fire dual-write only, never touch localStorage.
// -------------------------------------------------------------------------

describe("persistPantries — dual-write only (no LS write)", () => {
  it("does not touch localStorage", () => {
    persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      [{ id: "a", name: "A", items: [], text: "" }],
      "a",
    );
    expect(globalThis.localStorage.getItem(NUTRITION_PANTRIES_KEY)).toBeNull();
    expect(
      globalThis.localStorage.getItem(NUTRITION_ACTIVE_PANTRY_KEY),
    ).toBeNull();
  });

  it("triggers dual-write when context is registered", () => {
    persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      [{ id: "a", name: "A", items: [], text: "" }],
      "a",
    );
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it("no-ops silently when dual-write context is not registered", () => {
    dualWriteRegistered = false;
    persistPantries(
      NUTRITION_PANTRIES_KEY,
      NUTRITION_ACTIVE_PANTRY_KEY,
      [{ id: "a", name: "A", items: [], text: "" }],
      "a",
    );
    expect(triggerSpy).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem(NUTRITION_PANTRIES_KEY)).toBeNull();
  });
});

describe("persistNutritionLog — dual-write only", () => {
  it("does not touch localStorage", () => {
    persistNutritionLog({}, NUTRITION_LOG_KEY);
    expect(globalThis.localStorage.getItem(NUTRITION_LOG_KEY)).toBeNull();
  });

  it("triggers dual-write when context is registered and a log is provided", () => {
    persistNutritionLog(
      {
        "2026-04-04": {
          meals: [
            {
              id: "m1",
              name: "Хліб",
              time: "10:00",
              mealType: "snack",
              label: "",
              macros: { kcal: 10, protein_g: 0, fat_g: 0, carbs_g: 2 },
              source: "manual",
              macroSource: "manual",
              amount_g: null,
              foodId: null,
            },
          ],
        },
      },
      NUTRITION_LOG_KEY,
    );
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });
});

describe("persistNutritionPrefs — dual-write only", () => {
  it("does not write to localStorage", () => {
    persistNutritionPrefs(
      { ...defaultNutritionPrefs(), reminderHour: 8 },
      NUTRITION_PREFS_KEY,
    );
    expect(globalThis.localStorage.getItem(NUTRITION_PREFS_KEY)).toBeNull();
  });

  it("triggers dual-write when context is registered", () => {
    persistNutritionPrefs(
      { ...defaultNutritionPrefs(), reminderHour: 8 },
      NUTRITION_PREFS_KEY,
    );
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------------
// Pure helpers (unchanged by tombstone — kept for regression coverage).
// -------------------------------------------------------------------------

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
