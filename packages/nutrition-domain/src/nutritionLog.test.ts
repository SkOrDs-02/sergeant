// Pure-операції над журналом прийомів їжі (без localStorage / window).
// Покриваємо нормалізацію (`normalizeMeal`, `normalizeNutritionLog`),
// мутації (`addLogEntry`, `removeLogEntry`, `updateLogEntry`,
// `duplicatePreviousDayMeals`), злиття (`mergeNutritionLogs`), вибірки
// (`getDayMacros`, `getDaySummary`, `searchMealsByName`,
// `getMacrosForDateRange`), і допоміжні (`addDaysISODate`,
// `estimateLogBytes`, `trimLogOldestDays`).
import { describe, expect, it, vi } from "vitest";

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    // toLocalISODate працює з системним часом → стабілізуємо.
    // Реалізація з shared використовує Europe/Kyiv; ми мокаємо лише на
    // фіксований формат UTC (`YYYY-MM-DD` від `Date`-args).
    toLocalISODate: vi.fn((d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }),
  };
});

import {
  addDaysISODate,
  addLogEntry,
  duplicatePreviousDayMeals,
  estimateLogBytes,
  getDayMacros,
  getDaySummary,
  getMacrosForDateRange,
  mergeNutritionLogs,
  normalizeMeal,
  normalizeNutritionLog,
  removeLogEntry,
  searchMealsByName,
  trimLogOldestDays,
  updateLogEntry,
} from "./nutritionLog.js";
import type { Meal, NutritionLog } from "./nutritionTypes.js";

const baseMacros = { kcal: 200, protein_g: 10, fat_g: 5, carbs_g: 30 };

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    name: "Test meal",
    time: "08:00",
    mealType: "breakfast",
    label: "Сніданок",
    macros: baseMacros,
    source: "manual",
    macroSource: "manual",
    amount_g: null,
    foodId: null,
    ...overrides,
  };
}

describe("normalizeMeal", () => {
  it("повертає валідний Meal зі всіма дефолтами для null/undefined", () => {
    const m = normalizeMeal(null, 0);
    expect(m.name).toBe("");
    expect(m.time).toBe("");
    expect(m.mealType).toBe("snack"); // fallback з labelForMealType('') в mealTypes
    expect(m.source).toBe("manual");
    expect(m.macroSource).toBe("manual");
    expect(m.amount_g).toBeNull();
    expect(m.foodId).toBeNull();
    expect(m.id).toMatch(/^meal_mig_/);
  });

  it("trim для name / time", () => {
    const m = normalizeMeal({ name: "  Млинці  ", time: "  09:30  " }, 0);
    expect(m.name).toBe("Млинці");
    expect(m.time).toBe("09:30");
  });

  it("зберігає валідний id", () => {
    const m = normalizeMeal({ id: "real-id" }, 0);
    expect(m.id).toBe("real-id");
  });

  it("генерує id коли raw id порожній або whitespace", () => {
    const m1 = normalizeMeal({ id: "" }, 5);
    const m2 = normalizeMeal({ id: "   " }, 5);
    expect(m1.id).toMatch(/^meal_mig_\d+_5_/);
    expect(m2.id).toMatch(/^meal_mig_\d+_5_/);
  });

  it("приймає валідний mealType; fallback з label інакше", () => {
    expect(normalizeMeal({ mealType: "lunch" }, 0).mealType).toBe("lunch");
    expect(
      normalizeMeal({ mealType: "invalid", label: "Вечеря" }, 0).mealType,
    ).toBe("dinner");
  });

  it("label: trim raw або синтез з labelForMealType(mealType)", () => {
    expect(normalizeMeal({ label: "  My label  " }, 0).label).toBe("My label");
    expect(normalizeMeal({ mealType: "lunch" }, 0).label).toBe("Обід");
  });

  it("source: 'photo' тільки коли raw.source === 'photo', інакше 'manual'", () => {
    expect(normalizeMeal({ source: "photo" }, 0).source).toBe("photo");
    expect(normalizeMeal({ source: "manual" }, 0).source).toBe("manual");
    expect(normalizeMeal({ source: "weird" }, 0).source).toBe("manual");
    expect(normalizeMeal({}, 0).source).toBe("manual");
  });

  it("macroSource: явні enum-значення; fallback 'photoAI' для source=photo, інакше 'manual'", () => {
    expect(normalizeMeal({ macroSource: "productDb" }, 0).macroSource).toBe(
      "productDb",
    );
    expect(normalizeMeal({ macroSource: "recipeAI" }, 0).macroSource).toBe(
      "recipeAI",
    );
    expect(normalizeMeal({ macroSource: "manual" }, 0).macroSource).toBe(
      "manual",
    );
    expect(normalizeMeal({ macroSource: "photoAI" }, 0).macroSource).toBe(
      "photoAI",
    );
    // Невалідний macroSource → fallback за source
    expect(
      normalizeMeal({ macroSource: "weird", source: "photo" }, 0).macroSource,
    ).toBe("photoAI");
    expect(normalizeMeal({ source: "manual" }, 0).macroSource).toBe("manual");
  });

  it("amount_g: позитивне число або null", () => {
    expect(normalizeMeal({ amount_g: 150 }, 0).amount_g).toBe(150);
    expect(normalizeMeal({ amount_g: "200" }, 0).amount_g).toBe(200);
    expect(normalizeMeal({ amount_g: 0 }, 0).amount_g).toBeNull();
    expect(normalizeMeal({ amount_g: -10 }, 0).amount_g).toBeNull();
    expect(normalizeMeal({ amount_g: "abc" }, 0).amount_g).toBeNull();
  });

  it("foodId: trim або null", () => {
    expect(normalizeMeal({ foodId: "  food-1  " }, 0).foodId).toBe("food-1");
    expect(normalizeMeal({ foodId: "   " }, 0).foodId).toBeNull();
    expect(normalizeMeal({ foodId: null }, 0).foodId).toBeNull();
  });

  it("demo: пропускає тільки коли явно === true", () => {
    expect(normalizeMeal({ demo: true }, 0).demo).toBe(true);
    expect(normalizeMeal({ demo: false }, 0).demo).toBeUndefined();
    expect(normalizeMeal({ demo: "yes" }, 0).demo).toBeUndefined();
    expect(normalizeMeal({}, 0).demo).toBeUndefined();
  });

  it("macros: нормалізує до NullableMacros", () => {
    const m = normalizeMeal({ macros: { kcal: 100, protein_g: "5" } }, 0);
    expect(m.macros.kcal).toBe(100);
    expect(m.macros.protein_g).toBe(5);
    expect(m.macros.fat_g).toBeNull();
    expect(m.macros.carbs_g).toBeNull();
  });
});

describe("normalizeNutritionLog", () => {
  it("повертає {} для null / undefined / array / string / number", () => {
    expect(normalizeNutritionLog(null)).toEqual({});
    expect(normalizeNutritionLog(undefined)).toEqual({});
    expect(normalizeNutritionLog([])).toEqual({});
    expect(normalizeNutritionLog("x")).toEqual({});
    expect(normalizeNutritionLog(42)).toEqual({});
  });

  it("пропускає ключі що не відповідають ISO-формату", () => {
    const r = normalizeNutritionLog({
      "not-iso": { meals: [] },
      "2026-05-10": { meals: [{ id: "m" }] },
      abc: null,
    });
    expect(Object.keys(r)).toEqual(["2026-05-10"]);
  });

  it("повертає { meals: [] } якщо meals не масив", () => {
    const r = normalizeNutritionLog({
      "2026-05-10": { meals: "not-array" },
      "2026-05-11": null,
    });
    expect(r["2026-05-10"]).toEqual({ meals: [] });
    expect(r["2026-05-11"]).toEqual({ meals: [] });
  });

  it("нормалізує кожну meal через normalizeMeal", () => {
    const r = normalizeNutritionLog({
      "2026-05-10": {
        meals: [
          { id: "a", name: "  Млинці  " },
          { id: "b", name: "Каша", mealType: "lunch" },
        ],
      },
    });
    expect(r["2026-05-10"]!.meals).toHaveLength(2);
    expect(r["2026-05-10"]!.meals[0]!.name).toBe("Млинці");
    expect(r["2026-05-10"]!.meals[1]!.mealType).toBe("lunch");
  });
});

describe("addLogEntry / removeLogEntry / updateLogEntry", () => {
  const log: NutritionLog = {
    "2026-05-10": { meals: [makeMeal({ id: "m1" }), makeMeal({ id: "m2" })] },
  };

  it("addLogEntry додає нормалізовану meal у вказаний day", () => {
    const r = addLogEntry(log, "2026-05-10", { id: "m3", name: "Salad" });
    expect(r["2026-05-10"]!.meals).toHaveLength(3);
    expect(r["2026-05-10"]!.meals[2]!.id).toBe("m3");
  });

  it("addLogEntry створює новий day якщо його не існує", () => {
    const r = addLogEntry(log, "2026-05-11", { id: "new", name: "Soup" });
    expect(r["2026-05-11"]!.meals).toHaveLength(1);
    expect(r["2026-05-10"]).toBeDefined();
  });

  it("removeLogEntry прибирає meal за id", () => {
    const r = removeLogEntry(log, "2026-05-10", "m1");
    expect(r["2026-05-10"]!.meals).toHaveLength(1);
    expect(r["2026-05-10"]!.meals[0]!.id).toBe("m2");
  });

  it("removeLogEntry: якщо після видалення жодної meal не лишилось — видаляє day", () => {
    const single: NutritionLog = {
      "2026-05-10": { meals: [makeMeal({ id: "only" })] },
    };
    const r = removeLogEntry(single, "2026-05-10", "only");
    expect(r["2026-05-10"]).toBeUndefined();
  });

  it("removeLogEntry no-op для відсутнього day", () => {
    expect(removeLogEntry(log, "2026-05-99", "m1")).toBe(log);
  });

  it("updateLogEntry замінює meal за id", () => {
    const r = updateLogEntry(log, "2026-05-10", {
      id: "m1",
      name: "Updated",
    });
    expect(r["2026-05-10"]!.meals[0]!.name).toBe("Updated");
    expect(r["2026-05-10"]!.meals[1]!.id).toBe("m2");
  });

  it("updateLogEntry no-op для відсутнього day або відсутнього id", () => {
    expect(updateLogEntry(log, "2026-05-99", { id: "m1" })).toBe(log);
    expect(updateLogEntry(log, "2026-05-10", { id: "missing" })).toBe(log);
  });
});

describe("getDayMacros / getDaySummary", () => {
  const log: NutritionLog = {
    "2026-05-10": {
      meals: [
        makeMeal({
          id: "a",
          macros: { kcal: 100, protein_g: 10, fat_g: 5, carbs_g: 20 },
        }),
        makeMeal({
          id: "b",
          macros: { kcal: 250, protein_g: 20, fat_g: 8, carbs_g: 30 },
        }),
      ],
    },
  };

  it("getDayMacros: повертає суму макросів для дня", () => {
    expect(getDayMacros(log, "2026-05-10")).toEqual({
      kcal: 350,
      protein_g: 30,
      fat_g: 13,
      carbs_g: 50,
    });
  });

  it("getDayMacros: нулі для відсутнього day або null log", () => {
    expect(getDayMacros(log, "2026-99-99")).toEqual({
      kcal: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
    });
    expect(getDayMacros(null, "2026-05-10")).toEqual({
      kcal: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
    });
  });

  it("getDayMacros: нулі коли meals не масив", () => {
    expect(
      getDayMacros({ "2026-05-10": { meals: "x" as never } }, "2026-05-10"),
    ).toEqual({ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
  });

  it("getDaySummary: повертає mealCount + hasMeals + hasAnyMacros + totals", () => {
    const s = getDaySummary(log, "2026-05-10");
    expect(s.date).toBe("2026-05-10");
    expect(s.mealCount).toBe(2);
    expect(s.hasMeals).toBe(true);
    expect(s.hasAnyMacros).toBe(true);
    expect(s.kcal).toBe(350);
  });

  it("getDaySummary: hasAnyMacros=false коли всі macros null", () => {
    const blank: NutritionLog = {
      "2026-05-10": {
        meals: [
          makeMeal({
            id: "x",
            macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
          }),
        ],
      },
    };
    expect(getDaySummary(blank, "2026-05-10").hasAnyMacros).toBe(false);
  });

  it("getDaySummary: hasMeals=false для відсутнього day", () => {
    const s = getDaySummary(log, "2026-99-99");
    expect(s.mealCount).toBe(0);
    expect(s.hasMeals).toBe(false);
  });
});

describe("addDaysISODate", () => {
  it("додає / віднімає дні", () => {
    expect(addDaysISODate("2026-05-10", 1)).toBe("2026-05-11");
    expect(addDaysISODate("2026-05-10", -1)).toBe("2026-05-09");
    expect(addDaysISODate("2026-05-10", 0)).toBe("2026-05-10");
  });

  it("обробляє переходи через місяць", () => {
    expect(addDaysISODate("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDaysISODate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("деградує плавно для битих рядків (без throw)", () => {
    // `'bad'` → parts=[NaN]; коди fallback-ять на 0 → new Date(0, -1, 0+delta)
    expect(() => addDaysISODate("bad", 0)).not.toThrow();
  });
});

describe("duplicatePreviousDayMeals", () => {
  const log: NutritionLog = {
    "2026-05-10": { meals: [makeMeal({ id: "m1", source: "photo" })] },
  };

  it("копіює meals з попереднього дня; force source='manual', new id", () => {
    const r = duplicatePreviousDayMeals(log, "2026-05-11");
    expect(r["2026-05-11"]!.meals).toHaveLength(1);
    const copy = r["2026-05-11"]!.meals[0]!;
    expect(copy.source).toBe("manual");
    expect(copy.id).not.toBe("m1");
  });

  it("no-op коли попередній день відсутній", () => {
    expect(duplicatePreviousDayMeals(log, "2026-05-09")).toBe(log);
  });

  it("no-op коли попередній день з порожніми meals", () => {
    const empty: NutritionLog = { "2026-05-10": { meals: [] } };
    expect(duplicatePreviousDayMeals(empty, "2026-05-11")).toBe(empty);
  });

  it("додає до існуючих meals цього дня, не перетирає", () => {
    const withTarget: NutritionLog = {
      "2026-05-10": { meals: [makeMeal({ id: "src" })] },
      "2026-05-11": { meals: [makeMeal({ id: "existing" })] },
    };
    const r = duplicatePreviousDayMeals(withTarget, "2026-05-11");
    expect(r["2026-05-11"]!.meals).toHaveLength(2);
    expect(r["2026-05-11"]!.meals[0]!.id).toBe("existing");
  });
});

describe("mergeNutritionLogs", () => {
  it("обʼєднує два log-и, нормалізуючи обидва", () => {
    const a = { "2026-05-10": { meals: [{ id: "a1", name: "A" }] } };
    const b = { "2026-05-10": { meals: [{ id: "b1", name: "B" }] } };
    const r = mergeNutritionLogs(a, b);
    expect(r["2026-05-10"]!.meals).toHaveLength(2);
    expect(r["2026-05-10"]!.meals.map((m) => m.name)).toEqual(["A", "B"]);
  });

  it("додає нові дні з incoming, зберігає інші дні з base", () => {
    const a = { "2026-05-10": { meals: [{ id: "a1", name: "A" }] } };
    const b = { "2026-05-11": { meals: [{ id: "b1", name: "B" }] } };
    const r = mergeNutritionLogs(a, b);
    expect(Object.keys(r).sort()).toEqual(["2026-05-10", "2026-05-11"]);
  });

  it("ігнорує incoming-дні з не-ISO ключами або з порожніми meals", () => {
    // not-iso фільтрується ще на нормалізації; порожній meals — на merge-кроці.
    const a = { "2026-05-10": { meals: [{ id: "a", name: "A" }] } };
    const b = {
      "bad-key": { meals: [{ id: "x", name: "X" }] },
      "2026-05-11": { meals: [] },
    };
    const r = mergeNutritionLogs(a, b);
    expect(Object.keys(r)).toEqual(["2026-05-10"]);
  });

  it("приймає null/невалідний base — стає {}", () => {
    const b = { "2026-05-10": { meals: [{ id: "b", name: "B" }] } };
    const r = mergeNutritionLogs(null, b);
    expect(r["2026-05-10"]!.meals).toHaveLength(1);
  });
});

describe("searchMealsByName", () => {
  const log: NutritionLog = {
    "2026-05-10": {
      meals: [
        makeMeal({ id: "a", name: "Млинці з сиром" }),
        makeMeal({ id: "b", name: "Каша гречана" }),
      ],
    },
    "2026-05-12": {
      meals: [makeMeal({ id: "c", name: "Млинці" })],
    },
  };

  it("повертає [] для порожнього query / null / whitespace", () => {
    expect(searchMealsByName(log, "")).toEqual([]);
    expect(searchMealsByName(log, "   ")).toEqual([]);
    expect(searchMealsByName(log, null as unknown as string)).toEqual([]);
  });

  it("знаходить за case-insensitive substring у name", () => {
    const r = searchMealsByName(log, "млинці");
    expect(r).toHaveLength(2);
    // Відсортовано за датою спадно: 2026-05-12 → 2026-05-10
    expect(r[0]!.date).toBe("2026-05-12");
    expect(r[1]!.date).toBe("2026-05-10");
  });

  it("повертає [] коли nothing match", () => {
    expect(searchMealsByName(log, "тортик")).toEqual([]);
  });

  it("ігнорує дні з не-ISO ключами", () => {
    const dirty = {
      abc: { meals: [makeMeal({ id: "x", name: "Млинці" })] },
      ...log,
    };
    const r = searchMealsByName(dirty as never, "млинці");
    expect(r.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))).toBe(true);
  });

  it("безпечний для null/undefined log", () => {
    expect(searchMealsByName(null, "x")).toEqual([]);
    expect(searchMealsByName(undefined, "x")).toEqual([]);
  });
});

describe("getMacrosForDateRange", () => {
  const log: NutritionLog = {
    "2026-05-10": {
      meals: [makeMeal({ id: "a", macros: baseMacros })],
    },
    "2026-05-11": {
      meals: [makeMeal({ id: "b", macros: baseMacros })],
    },
  };

  it("повертає рядки за `dayCount` днів закінчуючи `endIso`, від старого до нового", () => {
    const rows = getMacrosForDateRange(log, "2026-05-12", 3);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
    ]);
    expect(rows[0]!.kcal).toBe(200);
    expect(rows[2]!.kcal).toBe(0);
  });

  it("dayCount=1 повертає один день (саме endIso)", () => {
    const rows = getMacrosForDateRange(log, "2026-05-10", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2026-05-10");
  });

  it("dayCount=0 повертає []", () => {
    expect(getMacrosForDateRange(log, "2026-05-10", 0)).toEqual([]);
  });
});

describe("estimateLogBytes", () => {
  it("повертає розмір JSON-серіалізації", () => {
    expect(estimateLogBytes({})).toBeGreaterThanOrEqual(2); // "{}"
    expect(estimateLogBytes(null)).toBeGreaterThanOrEqual(2);
    expect(estimateLogBytes(undefined)).toBeGreaterThanOrEqual(2);
  });

  it("дає більше байтів для більшого логу", () => {
    const small = estimateLogBytes({ "2026-05-10": { meals: [] } });
    const big = estimateLogBytes({
      "2026-05-10": { meals: [makeMeal()] },
      "2026-05-11": { meals: [makeMeal()] },
    });
    expect(big).toBeGreaterThan(small);
  });

  it("повертає 0 коли JSON.stringify throw-ає (циклічна структура)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(estimateLogBytes(cyclic as never)).toBe(0);
  });
});

describe("trimLogOldestDays", () => {
  const log = {
    "2026-05-10": { meals: [{ id: "a" }] },
    "2026-05-11": { meals: [{ id: "b" }] },
    "2026-05-12": { meals: [{ id: "c" }] },
    "2026-05-13": { meals: [{ id: "d" }] },
  };

  it("залишає останні `keepCount` днів (за алфавіт-сорту дат)", () => {
    const r = trimLogOldestDays(log, 2);
    expect(Object.keys(r).sort()).toEqual(["2026-05-12", "2026-05-13"]);
  });

  it("повертає весь log коли днів менше або дорівнює keepCount", () => {
    const r = trimLogOldestDays(log, 10);
    expect(Object.keys(r).sort()).toEqual([
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
    ]);
  });

  it("keepCount=0 → порожній лог", () => {
    expect(trimLogOldestDays(log, 0)).toEqual({});
  });

  it("обробляє непридатний вхід (null) → {}", () => {
    expect(trimLogOldestDays(null, 5)).toEqual({});
  });
});
