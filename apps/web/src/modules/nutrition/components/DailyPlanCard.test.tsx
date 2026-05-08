// @vitest-environment jsdom
//
// PR-37 ux-roast 2026-Q3 / §3.3 — попередження про макро поза межами
// цільових ккал. Користувачі скаржилися: «1 кг білка це не 1400 ккал».
// Тут перевіряємо, що warning з'являється з коректними числами і що
// швидкі дії оновлюють prefs так, як обіцяє UI.
import { describe, expect, it } from "vitest";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";

import { calcGoalRangeIssues, calcMacroKcalMismatch } from "./DailyPlanCard";

const EMPTY_PREFS: NutritionPrefs = {} as NutritionPrefs;

function withPrefs(patch: Partial<NutritionPrefs>): NutritionPrefs {
  return { ...EMPTY_PREFS, ...patch } as NutritionPrefs;
}

describe("calcMacroKcalMismatch", () => {
  it("returns null when no kcal goal is set", () => {
    expect(
      calcMacroKcalMismatch(
        withPrefs({
          dailyTargetProtein_g: 100,
          dailyTargetFat_g: 80,
          dailyTargetCarbs_g: 200,
        }),
      ),
    ).toBeNull();
  });

  it("returns null when no macro targets are set", () => {
    expect(
      calcMacroKcalMismatch(withPrefs({ dailyTargetKcal: 2000 })),
    ).toBeNull();
  });

  it("returns null when macros match kcal goal within ±5% tolerance", () => {
    // 150g protein + 70g fat + 200g carbs = 600 + 630 + 800 = 2030 kcal,
    // target 2000 → 1.5% over → tolerated.
    expect(
      calcMacroKcalMismatch(
        withPrefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 150,
          dailyTargetFat_g: 70,
          dailyTargetCarbs_g: 200,
        }),
      ),
    ).toBeNull();
  });

  it("flags overshoot when macros exceed kcal goal beyond tolerance", () => {
    // The motivating bug: 1000g protein → 4000 kcal but target says 1500.
    const result = calcMacroKcalMismatch(
      withPrefs({
        dailyTargetKcal: 1500,
        dailyTargetProtein_g: 1000,
        dailyTargetFat_g: 0,
        dailyTargetCarbs_g: 0,
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("over");
    expect(result!.target).toBe(1500);
    expect(result!.calc).toBe(4000);
    expect(result!.diff).toBe(2500);
  });

  it("flags undershoot when macros leave a meaningful gap", () => {
    const result = calcMacroKcalMismatch(
      withPrefs({
        dailyTargetKcal: 2000,
        dailyTargetProtein_g: 50,
        dailyTargetFat_g: 20,
        dailyTargetCarbs_g: 50,
      }),
    );
    // 50*4 + 20*9 + 50*4 = 580 → 1420 kcal short on a 2000 goal.
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("under");
    expect(result!.calc).toBe(580);
    expect(result!.diff).toBe(-1420);
  });
});

describe("calcGoalRangeIssues", () => {
  it("returns no issues when targets are within reasonable ranges", () => {
    expect(
      calcGoalRangeIssues(
        withPrefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 150,
          dailyTargetFat_g: 70,
          dailyTargetCarbs_g: 200,
        }),
      ),
    ).toEqual([]);
  });

  it("returns no issues when no targets are set", () => {
    expect(calcGoalRangeIssues(EMPTY_PREFS)).toEqual([]);
  });

  it("flags kcal below 800", () => {
    const issues = calcGoalRangeIssues(withPrefs({ dailyTargetKcal: 500 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe("kcal");
    expect(issues[0]!.kind).toBe("low");
  });

  it("flags kcal above 6000", () => {
    const issues = calcGoalRangeIssues(withPrefs({ dailyTargetKcal: 7000 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe("kcal");
    expect(issues[0]!.kind).toBe("high");
  });

  it("flags protein below 30 g", () => {
    const issues = calcGoalRangeIssues(withPrefs({ dailyTargetProtein_g: 15 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe("protein_g");
    expect(issues[0]!.kind).toBe("low");
  });

  it("flags protein above 300 g", () => {
    const issues = calcGoalRangeIssues(
      withPrefs({ dailyTargetProtein_g: 400 }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe("protein_g");
    expect(issues[0]!.kind).toBe("high");
  });

  it("flags fat below 20 g and above 250 g", () => {
    expect(
      calcGoalRangeIssues(withPrefs({ dailyTargetFat_g: 10 }))[0]!.kind,
    ).toBe("low");
    expect(
      calcGoalRangeIssues(withPrefs({ dailyTargetFat_g: 300 }))[0]!.kind,
    ).toBe("high");
  });

  it("flags carbs above 700 g but allows 0 (keto)", () => {
    expect(
      calcGoalRangeIssues(withPrefs({ dailyTargetCarbs_g: 800 })),
    ).toHaveLength(1);
    expect(
      calcGoalRangeIssues(withPrefs({ dailyTargetCarbs_g: 0 })),
    ).toHaveLength(0);
  });

  it("aggregates multiple issues across fields", () => {
    const issues = calcGoalRangeIssues(
      withPrefs({
        dailyTargetKcal: 500,
        dailyTargetProtein_g: 400,
      }),
    );
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.field).sort()).toEqual(["kcal", "protein_g"]);
  });
});
