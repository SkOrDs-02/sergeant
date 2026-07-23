import { describe, it, expect } from "vitest";
import { computeNutritionQuickStats } from "./quickStats.js";
import type { NutritionLogLike } from "./nutritionTypes.js";

const log: NutritionLogLike = {
  "2026-07-23": {
    meals: [
      { macros: { kcal: 420 } },
      { macros: { kcal: 640 } },
      { macros: { kcal: 190 } },
    ],
  },
  "2026-07-22": { meals: [{ macros: { kcal: 999 } }] },
};

describe("computeNutritionQuickStats", () => {
  it("sums the supplied Kyiv day's kcal and reads the goal from prefs", () => {
    expect(
      computeNutritionQuickStats(log, { dailyTargetKcal: 2200 }, "2026-07-23"),
    ).toEqual({ todayCal: 1250, calGoal: 2200 });
  });

  it("keys the day-total off the supplied Kyiv day key", () => {
    // A UTC-vs-Kyiv day mismatch would sum the wrong day; 07-24 has no
    // entries so the total is 0 while the goal is untouched.
    expect(
      computeNutritionQuickStats(log, { dailyTargetKcal: 2200 }, "2026-07-24"),
    ).toEqual({ todayCal: 0, calGoal: 2200 });
  });

  it("falls back to a 0 goal when no target is set", () => {
    expect(
      computeNutritionQuickStats(log, { dailyTargetKcal: null }, "2026-07-23")
        .calGoal,
    ).toBe(0);
    expect(computeNutritionQuickStats(log, null, "2026-07-23").calGoal).toBe(0);
  });
});
