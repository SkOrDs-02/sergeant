import { describe, it, expect } from "vitest";
import {
  summarizeRows,
  avgFromSummary,
  topMeals,
  mealTypeBreakdown,
  getRowsForRange,
  type RowsSummary,
} from "./nutritionStats";
import type { DaySummary, NutritionLog } from "./nutritionStorage";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeDay(overrides: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-01-01",
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    mealCount: 0,
    hasMeals: false,
    hasAnyMacros: false,
    ...overrides,
  };
}

// ─── summarizeRows ────────────────────────────────────────────────────────────

describe("nutrition/summarizeRows", () => {
  it("returns zero totals for an empty array", () => {
    const r = summarizeRows([]);
    expect(r.days).toBe(0);
    expect(r.kcal).toBe(0);
    expect(r.daysWithMeals).toBe(0);
    expect(r.daysWithAnyMacros).toBe(0);
    expect(r.nonEmptyDays).toBe(0);
  });

  it("sums macros across days", () => {
    const rows = [
      makeDay({
        kcal: 2000,
        protein_g: 150,
        fat_g: 70,
        carbs_g: 220,
        hasAnyMacros: true,
        hasMeals: true,
        mealCount: 3,
      }),
      makeDay({
        kcal: 1800,
        protein_g: 130,
        fat_g: 60,
        carbs_g: 200,
        hasAnyMacros: true,
        hasMeals: true,
        mealCount: 2,
      }),
    ];
    const r = summarizeRows(rows);
    expect(r.days).toBe(2);
    expect(r.kcal).toBe(3800);
    expect(r.protein_g).toBe(280);
    expect(r.fat_g).toBe(130);
    expect(r.carbs_g).toBe(420);
  });

  it("counts daysWithMeals via hasMeals flag", () => {
    const rows = [
      makeDay({ hasMeals: true, mealCount: 2 }),
      makeDay({ hasMeals: false, mealCount: 0 }),
      makeDay({ hasMeals: true, mealCount: 1 }),
    ];
    const r = summarizeRows(rows);
    expect(r.daysWithMeals).toBe(2);
    expect(r.nonEmptyDays).toBe(2); // alias
  });

  it("counts daysWithMeals via mealCount even when hasMeals is false", () => {
    // Edge case: hasMeals=false but mealCount > 0 (defensive fallback in code)
    const rows = [makeDay({ hasMeals: false, mealCount: 3 })];
    const r = summarizeRows(rows);
    expect(r.daysWithMeals).toBe(1);
  });

  it("counts daysWithAnyMacros independently from daysWithMeals", () => {
    const rows = [
      makeDay({ hasMeals: true, mealCount: 1, hasAnyMacros: false }),
      makeDay({ hasMeals: true, mealCount: 2, hasAnyMacros: true }),
    ];
    const r = summarizeRows(rows);
    expect(r.daysWithMeals).toBe(2);
    expect(r.daysWithAnyMacros).toBe(1);
  });

  it("coerces non-numeric macro values to 0 instead of NaN", () => {
    const rows = [
      makeDay({
        kcal: undefined as unknown as number,
        protein_g: null as unknown as number,
      }),
    ];
    const r = summarizeRows(rows);
    expect(r.kcal).toBe(0);
    expect(r.protein_g).toBe(0);
  });
});

// ─── avgFromSummary ───────────────────────────────────────────────────────────

describe("nutrition/avgFromSummary", () => {
  it("divides totals by daysWithAnyMacros", () => {
    const sum: RowsSummary = {
      days: 3,
      kcal: 6000,
      protein_g: 300,
      fat_g: 210,
      carbs_g: 600,
      daysWithMeals: 3,
      daysWithAnyMacros: 3,
      nonEmptyDays: 3,
    };
    const avg = avgFromSummary(sum);
    expect(avg.kcal).toBeCloseTo(2000);
    expect(avg.protein_g).toBeCloseTo(100);
    expect(avg.denom).toBe(3);
  });

  it("uses denom=1 when daysWithAnyMacros is 0 to avoid division by zero", () => {
    const sum: RowsSummary = {
      days: 5,
      kcal: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
      daysWithMeals: 0,
      daysWithAnyMacros: 0,
      nonEmptyDays: 0,
    };
    const avg = avgFromSummary(sum);
    expect(avg.denom).toBe(1);
    expect(avg.kcal).toBe(0);
  });

  it("ignores empty days without macros in the average", () => {
    // 2 days with macros, 3 empty days → average must not be diluted by the 3 empty
    const sum: RowsSummary = {
      days: 5,
      kcal: 4000,
      protein_g: 200,
      fat_g: 140,
      carbs_g: 400,
      daysWithMeals: 2,
      daysWithAnyMacros: 2,
      nonEmptyDays: 2,
    };
    const avg = avgFromSummary(sum);
    expect(avg.kcal).toBeCloseTo(2000);
    expect(avg.denom).toBe(2);
  });
});

// ─── topMeals ─────────────────────────────────────────────────────────────────

describe("nutrition/topMeals", () => {
  // Намірено неповні `Meal` — у цих тестах ми дивимось лише на ім'я/kcal,
  // решта полів `Meal` (id, time, mealType, label, …) функції `topMeals`
  // нерелевантні. Каст через `unknown` тримає вхід як `NutritionLog`, не
  // переписуючи фікстури під повний тип.
  const log = {
    "2026-01-10": {
      meals: [
        { name: "Гречка", macros: { kcal: 300 } },
        { name: "Яєчня", macros: { kcal: 250 } },
      ],
    },
    "2026-01-09": {
      meals: [
        { name: "Гречка", macros: { kcal: 300 } },
        { name: "Овочевий суп", macros: { kcal: 180 } },
      ],
    },
    "2026-01-08": {
      meals: [{ name: "Гречка", macros: { kcal: 300 } }],
    },
  };

  it("returns meals sorted by frequency desc", () => {
    const result = topMeals(log as unknown as NutritionLog, "2026-01-10", 3);
    expect(result[0]!.name).toBe("Гречка");
    expect(result[0]!.count).toBe(3);
  });

  it("accumulates kcal for repeated meals", () => {
    const result = topMeals(log as unknown as NutritionLog, "2026-01-10", 3);
    const buckwheat = result.find((m) => m.name === "Гречка")!;
    expect(buckwheat.kcal).toBe(900);
  });

  it("respects the dayCount window — excludes days before start", () => {
    // Only last 2 days → Гречка appears 2 times, not 3
    const result = topMeals(log as unknown as NutritionLog, "2026-01-10", 2);
    const buckwheat = result.find((m) => m.name === "Гречка")!;
    expect(buckwheat.count).toBe(2);
  });

  it("returns empty array for null / empty log", () => {
    expect(topMeals(null, "2026-01-10", 7)).toEqual([]);
    expect(topMeals({}, "2026-01-10", 7)).toEqual([]);
  });

  it("omits meals with empty names", () => {
    const logWithEmpty = {
      "2026-01-10": { meals: [{ name: "" }, { name: "  " }, { name: "Рис" }] },
    };
    const result = topMeals(
      logWithEmpty as unknown as NutritionLog,
      "2026-01-10",
      1,
    );
    expect(result.every((m) => m.name.trim().length > 0)).toBe(true);
  });

  it("respects the limit parameter", () => {
    const manyMeals = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        `2026-01-${String(i + 1).padStart(2, "0")}`,
        { meals: [{ name: `Страва${i}`, macros: { kcal: 100 } }] },
      ]),
    );
    const result = topMeals(
      manyMeals as unknown as NutritionLog,
      "2026-01-20",
      20,
      5,
    );
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ─── mealTypeBreakdown ────────────────────────────────────────────────────────

describe("nutrition/mealTypeBreakdown", () => {
  // Див. коментар у `nutrition/topMeals` вище — той самий підхід до фікстур.
  const log = {
    "2026-01-10": {
      meals: [
        { mealType: "breakfast", macros: { kcal: 400 } },
        { mealType: "lunch", macros: { kcal: 600 } },
        { mealType: "lunch", macros: { kcal: 550 } },
      ],
    },
  } as unknown as NutritionLog;

  it("groups meals by mealType with count and kcal", () => {
    const result = mealTypeBreakdown(log, "2026-01-10", 1);
    expect(result.breakfast).toEqual({ count: 1, kcal: 400 });
    expect(result.lunch).toEqual({ count: 2, kcal: 1150 });
  });

  it("returns empty object for null log", () => {
    expect(mealTypeBreakdown(null, "2026-01-10", 7)).toEqual({});
  });

  it("excludes days outside the date range", () => {
    const result = mealTypeBreakdown(log, "2026-01-09", 1);
    // 2026-01-10 is outside the 1-day window ending 2026-01-09
    expect(Object.keys(result).length).toBe(0);
  });
});

// ─── getRowsForRange ──────────────────────────────────────────────────────────

describe("nutrition/getRowsForRange", () => {
  it("returns dayCount rows in chronological order", () => {
    const log = {
      "2026-01-08": { meals: [{ name: "Сніданок", macros: { kcal: 400 } }] },
      "2026-01-09": { meals: [{ name: "Обід", macros: { kcal: 600 } }] },
      "2026-01-10": { meals: [{ name: "Вечеря", macros: { kcal: 500 } }] },
    };
    const rows = getRowsForRange(log as never, "2026-01-10", 3);
    expect(rows.length).toBe(3);
    expect(rows[0]!.date).toBe("2026-01-08");
    expect(rows[2]!.date).toBe("2026-01-10");
  });

  it("returns empty-day placeholders for missing dates", () => {
    const rows = getRowsForRange({} as never, "2026-01-10", 2);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.kcal === 0)).toBe(true);
  });
});
