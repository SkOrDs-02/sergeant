import { describe, it, expect } from "vitest";
import { summarizeRows, topMeals, mealTypeBreakdown } from "../nutritionStats";
import type { DaySummary, NutritionLog } from "../nutritionStorage";

/**
 * Module unit suite — nutrition stats aggregation.
 *
 * Audit `2026-05-13-testing-devx-roast.md` §P1-6 ("Web coverage drift"):
 * the finyk/fizruk/nutrition UI slices stayed thin after the 2026-04-25
 * coverage collapse. These are the pure aggregation helpers behind the
 * nutrition stats cards — deterministic, no IDB/storage, so they exercise
 * the math (sum / average / top-N / meal-type bucketing) directly.
 */

function row(partial: Partial<DaySummary>): DaySummary {
  return {
    date: "2026-06-01",
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    mealCount: 0,
    hasMeals: false,
    hasAnyMacros: false,
    ...partial,
  } as DaySummary;
}

describe("summarizeRows", () => {
  it("sums macros and counts days with meals / with macros", () => {
    const rows: DaySummary[] = [
      row({ kcal: 500, protein_g: 30, hasMeals: true, hasAnyMacros: true }),
      row({ kcal: 0, mealCount: 2, hasMeals: false }), // mealCount>0 → counts as meals day
      row({}), // empty
    ];

    const sum = summarizeRows(rows);
    expect(sum.days).toBe(3);
    expect(sum.kcal).toBe(500);
    expect(sum.protein_g).toBe(30);
    expect(sum.daysWithMeals).toBe(2);
    expect(sum.daysWithAnyMacros).toBe(1);
    // nonEmptyDays is the backward-compatible alias for daysWithMeals.
    expect(sum.nonEmptyDays).toBe(sum.daysWithMeals);
  });

  it("coerces non-numeric macro fields to 0 rather than NaN", () => {
    const rows = [
      row({ kcal: Number.NaN as unknown as number, hasMeals: true }),
    ];
    const sum = summarizeRows(rows);
    expect(sum.kcal).toBe(0);
  });

  it("returns a zeroed summary for an empty range", () => {
    const sum = summarizeRows([]);
    expect(sum).toMatchObject({
      days: 0,
      kcal: 0,
      daysWithMeals: 0,
      daysWithAnyMacros: 0,
    });
  });
});

// avgFromSummary removed (unification-modules.md #1.12): averages now come
// from the canon `calcNutritionPeriodAverages` (packages/nutrition-domain).

describe("topMeals", () => {
  const log: NutritionLog = {
    "2026-05-30": {
      meals: [{ name: "Вівсянка", macros: { kcal: 300 } }],
    },
    "2026-05-31": {
      meals: [
        { name: "Вівсянка", macros: { kcal: 320 } },
        { name: "Салат", macros: { kcal: 150 } },
        { name: "  ", macros: { kcal: 999 } }, // blank name dropped
      ],
    },
    "not-a-date": { meals: [{ name: "Поза діапазоном", macros: { kcal: 1 } }] },
  } as unknown as NutritionLog;

  it("aggregates by name, ranks by count then kcal, and ignores blanks", () => {
    const result = topMeals(log, "2026-05-31", 7);
    expect(result[0]).toEqual({ name: "Вівсянка", count: 2, kcal: 620 });
    expect(result.map((m) => m.name)).not.toContain("");
    expect(result.map((m) => m.name)).not.toContain("Поза діапазоном");
  });

  it("respects the limit argument", () => {
    expect(topMeals(log, "2026-05-31", 7, 1)).toHaveLength(1);
  });

  it("filters out days outside the [start, end] window", () => {
    // dayCount 1 → window is just the end date, so 2026-05-30 is excluded.
    const result = topMeals(log, "2026-05-31", 1);
    const oats = result.find((m) => m.name === "Вівсянка");
    expect(oats?.count).toBe(1);
  });
});

describe("mealTypeBreakdown", () => {
  it("buckets meals by explicit mealType and sums kcal", () => {
    const log = {
      "2026-05-31": {
        meals: [
          { name: "A", mealType: "breakfast", macros: { kcal: 300 } },
          { name: "B", mealType: "breakfast", macros: { kcal: 200 } },
          { name: "C", mealType: "dinner", macros: { kcal: 500 } },
        ],
      },
    } as unknown as NutritionLog;

    const out = mealTypeBreakdown(log, "2026-05-31", 7);
    expect(out["breakfast"]).toEqual({ count: 2, kcal: 500 });
    expect(out["dinner"]).toEqual({ count: 1, kcal: 500 });
  });
});
