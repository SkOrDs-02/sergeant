import { describe, expect, it } from "vitest";

import {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
  GOAL_BOUNDS,
} from "./dailyPlanValidation.js";
import { defaultNutritionPrefs } from "./nutritionPrefs.js";
import type { NutritionPrefs } from "./nutritionTypes.js";

function prefs(overrides: Partial<NutritionPrefs>): NutritionPrefs {
  return { ...defaultNutritionPrefs(), ...overrides };
}

describe("calcMacroKcalMismatch", () => {
  it("returns null коли немає цілі ккал", () => {
    expect(calcMacroKcalMismatch(prefs({ dailyTargetKcal: null }))).toBeNull();
  });

  it("returns null коли макроси не задані", () => {
    expect(
      calcMacroKcalMismatch(
        prefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: null,
          dailyTargetFat_g: null,
          dailyTargetCarbs_g: null,
        }),
      ),
    ).toBeNull();
  });

  it("returns null коли сума макро в межах ±5%", () => {
    // 150*4 + 70*9 + 200*4 = 2030 — в межах 5% від 2000.
    expect(
      calcMacroKcalMismatch(
        prefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 150,
          dailyTargetFat_g: 70,
          dailyTargetCarbs_g: 200,
        }),
      ),
    ).toBeNull();
  });

  it("повертає 'over' коли макро перевищують ккал", () => {
    // 200*4 + 100*9 + 300*4 = 2900 vs 2000 target.
    const r = calcMacroKcalMismatch(
      prefs({
        dailyTargetKcal: 2000,
        dailyTargetProtein_g: 200,
        dailyTargetFat_g: 100,
        dailyTargetCarbs_g: 300,
      }),
    );
    expect(r).toEqual({ kind: "over", target: 2000, calc: 2900, diff: 900 });
  });

  it("повертає 'under' коли макро недотягують до ккал", () => {
    // 50*4 + 20*9 + 50*4 = 580 vs 2000 target.
    const r = calcMacroKcalMismatch(
      prefs({
        dailyTargetKcal: 2000,
        dailyTargetProtein_g: 50,
        dailyTargetFat_g: 20,
        dailyTargetCarbs_g: 50,
      }),
    );
    expect(r).toEqual({ kind: "under", target: 2000, calc: 580, diff: -1420 });
  });
});

describe("calcGoalRangeIssues", () => {
  it("повертає пустий масив для дефолтних prefs", () => {
    expect(calcGoalRangeIssues(defaultNutritionPrefs())).toEqual([]);
  });

  it("ловить занадто низький ккал", () => {
    expect(calcGoalRangeIssues(prefs({ dailyTargetKcal: 500 }))).toEqual([
      { field: "kcal", kind: "low" },
    ]);
  });

  it("ловить занадто високий ккал", () => {
    expect(calcGoalRangeIssues(prefs({ dailyTargetKcal: 7000 }))).toEqual([
      { field: "kcal", kind: "high" },
    ]);
  });

  it("ловить занадто низький протеїн", () => {
    expect(
      calcGoalRangeIssues(prefs({ dailyTargetProtein_g: 20 })),
    ).toContainEqual({ field: "protein_g", kind: "low" });
  });

  it("ловить занадто високий жир", () => {
    expect(
      calcGoalRangeIssues(prefs({ dailyTargetFat_g: 300 })),
    ).toContainEqual({ field: "fat_g", kind: "high" });
  });

  it("ловить занадто високі вуглеводи (нижньої межі немає)", () => {
    expect(
      calcGoalRangeIssues(prefs({ dailyTargetCarbs_g: 800 })),
    ).toContainEqual({ field: "carbs_g", kind: "high" });
  });

  it("0 г вуглеводів не вважається порушенням (кето)", () => {
    expect(calcGoalRangeIssues(prefs({ dailyTargetCarbs_g: 0 }))).toEqual([]);
  });

  it("збирає кілька порушень одночасно", () => {
    const issues = calcGoalRangeIssues(
      prefs({
        dailyTargetKcal: 500,
        dailyTargetProtein_g: 10,
        dailyTargetFat_g: 400,
      }),
    );
    expect(issues).toEqual([
      { field: "kcal", kind: "low" },
      { field: "protein_g", kind: "low" },
      { field: "fat_g", kind: "high" },
    ]);
  });
});

describe("GOAL_BOUNDS", () => {
  it("закривається на фіксовані значення (запобігає випадковій регресії)", () => {
    expect(GOAL_BOUNDS.kcal).toEqual({ min: 800, max: 6000 });
    expect(GOAL_BOUNDS.protein_g).toEqual({ min: 30, max: 300 });
    expect(GOAL_BOUNDS.fat_g).toEqual({ min: 20, max: 250 });
    expect(GOAL_BOUNDS.carbs_g).toEqual({ min: 0, max: 700 });
  });
});
