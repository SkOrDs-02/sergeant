import { describe, it, expect } from "vitest";
import {
  calcNutritionPeriodAverages,
  computeNutritionQuickStats,
} from "./quickStats.js";
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

describe("calcNutritionPeriodAverages", () => {
  const week = [
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
    "2026-07-24",
    "2026-07-25",
    "2026-07-26",
  ];

  it("ділить лише на дні з ≥1 прийомом (канон nutrition.md §5.2)", () => {
    const out = calcNutritionPeriodAverages(log, week);
    // 1250 + 999 = 2249 ккал за 2 залоговані дні з 7.
    expect(out.daysLogged).toBe(2);
    expect(out.daysInPeriod).toBe(7);
    expect(out.totalKcal).toBe(2249);
    expect(out.avgKcal).toBe(1125);
  });

  it("день із наявним, але порожнім записом не потрапляє у знаменник", () => {
    const withEmptyDay: NutritionLogLike = {
      ...log,
      "2026-07-24": { meals: [] },
    };
    const out = calcNutritionPeriodAverages(withEmptyDay, week);
    expect(out.daysLogged).toBe(2);
    expect(out.avgKcal).toBe(1125);
  });

  it("повертає нулі, коли залогованих днів немає (без NaN)", () => {
    expect(calcNutritionPeriodAverages({}, week)).toEqual({
      avgKcal: 0,
      avgProtein: 0,
      avgFat: 0,
      avgCarbs: 0,
      totalKcal: 0,
      daysLogged: 0,
      daysInPeriod: 7,
    });
  });

  it("усереднює всі макроси, а не лише ккал", () => {
    const macroLog: NutritionLogLike = {
      "2026-07-20": {
        meals: [
          { macros: { kcal: 500, protein_g: 30, fat_g: 20, carbs_g: 50 } },
        ],
      },
      "2026-07-21": {
        meals: [
          { macros: { kcal: 700, protein_g: 50, fat_g: 30, carbs_g: 70 } },
        ],
      },
    };
    const out = calcNutritionPeriodAverages(macroLog, week);
    expect(out).toMatchObject({
      avgKcal: 600,
      avgProtein: 40,
      avgFat: 25,
      avgCarbs: 60,
      daysLogged: 2,
    });
  });

  it("толерує порожній список днів і null-лог", () => {
    expect(calcNutritionPeriodAverages(null, []).daysInPeriod).toBe(0);
    expect(calcNutritionPeriodAverages(null, week).daysLogged).toBe(0);
  });
});
