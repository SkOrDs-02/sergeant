import { describe, it, expect } from "vitest";
import {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
  GOAL_BOUNDS,
} from "./dailyPlanValidation";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makePrefs(
  overrides: Partial<
    Pick<
      NutritionPrefs,
      | "dailyTargetKcal"
      | "dailyTargetProtein_g"
      | "dailyTargetFat_g"
      | "dailyTargetCarbs_g"
    >
  > = {},
): NutritionPrefs {
  return {
    goal: "maintain",
    servings: 3,
    timeMinutes: 30,
    exclude: "",
    recipeMealType: "any",
    recipePantryMode: "prefer",
    dailyTargetKcal: null,
    dailyTargetProtein_g: null,
    dailyTargetFat_g: null,
    dailyTargetCarbs_g: null,
    mealTemplates: [],
    reminderEnabled: false,
    reminderHour: 12,
    waterGoalMl: 2000,
    ...overrides,
  } as NutritionPrefs;
}

// ─── calcGoalRangeIssues ──────────────────────────────────────────────────────

describe("calcGoalRangeIssues", () => {
  it("returns no issues when all targets are within bounds", () => {
    const prefs = makePrefs({
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 120,
      dailyTargetFat_g: 70,
      dailyTargetCarbs_g: 250,
    });
    expect(calcGoalRangeIssues(prefs)).toHaveLength(0);
  });

  it("flags kcal low when below GOAL_BOUNDS.kcal.min", () => {
    const prefs = makePrefs({ dailyTargetKcal: 500 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "kcal",
      kind: "low",
      message: expect.any(String),
    });
  });

  it("flags kcal high when above GOAL_BOUNDS.kcal.max", () => {
    const prefs = makePrefs({ dailyTargetKcal: 7000 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "kcal",
      kind: "high",
      message: expect.any(String),
    });
  });

  it("does not flag kcal at the min boundary (800)", () => {
    const prefs = makePrefs({ dailyTargetKcal: GOAL_BOUNDS.kcal.min });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues.find((i) => i.field === "kcal")).toBeUndefined();
  });

  it("does not flag kcal at the max boundary (6000)", () => {
    const prefs = makePrefs({ dailyTargetKcal: GOAL_BOUNDS.kcal.max });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues.find((i) => i.field === "kcal")).toBeUndefined();
  });

  it("flags protein low when below 30g", () => {
    const prefs = makePrefs({ dailyTargetProtein_g: 10 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "protein_g",
      kind: "low",
      message: expect.any(String),
    });
  });

  it("flags protein high when above 300g", () => {
    const prefs = makePrefs({ dailyTargetProtein_g: 350 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "protein_g",
      kind: "high",
      message: expect.any(String),
    });
  });

  it("flags fat low when below 20g", () => {
    const prefs = makePrefs({ dailyTargetFat_g: 5 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "fat_g",
      kind: "low",
      message: expect.any(String),
    });
  });

  it("flags fat high when above 250g", () => {
    const prefs = makePrefs({ dailyTargetFat_g: 300 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "fat_g",
      kind: "high",
      message: expect.any(String),
    });
  });

  it("flags carbs high when above 700g", () => {
    const prefs = makePrefs({ dailyTargetCarbs_g: 800 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues).toContainEqual({
      field: "carbs_g",
      kind: "high",
      message: expect.any(String),
    });
  });

  it("does NOT flag carbs low (keto diet with 0g carbs is valid)", () => {
    const prefs = makePrefs({ dailyTargetCarbs_g: 0 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues.find((i) => i.field === "carbs_g")).toBeUndefined();
  });

  it("skips null targets (no issue emitted for nulls)", () => {
    const prefs = makePrefs({
      dailyTargetKcal: null,
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
    });
    expect(calcGoalRangeIssues(prefs)).toHaveLength(0);
  });

  it("attaches Ukrainian message strings to every issue", () => {
    const prefs = makePrefs({ dailyTargetKcal: 500 });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues[0]?.message).toMatch(/ккал/i);
  });

  it("can return multiple issues simultaneously", () => {
    const prefs = makePrefs({
      dailyTargetKcal: 500, // too low
      dailyTargetProtein_g: 350, // too high
      dailyTargetFat_g: 5, // too low
    });
    const issues = calcGoalRangeIssues(prefs);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── calcMacroKcalMismatch ────────────────────────────────────────────────────

describe("calcMacroKcalMismatch", () => {
  it("returns null when kcal target is 0 or null", () => {
    expect(calcMacroKcalMismatch(makePrefs({ dailyTargetKcal: 0 }))).toBeNull();
    expect(
      calcMacroKcalMismatch(makePrefs({ dailyTargetKcal: null })),
    ).toBeNull();
  });

  it("returns null when all macro targets are zero or null (nothing to compare)", () => {
    const prefs = makePrefs({ dailyTargetKcal: 2000 });
    expect(calcMacroKcalMismatch(prefs)).toBeNull();
  });

  it("returns null when macro sum is within ±5% tolerance", () => {
    // 150p * 4 + 70f * 9 + 200c * 4 = 600 + 630 + 800 = 2030 kcal
    // target = 2000, tolerance = 100 → 2030 is within 5%
    const prefs = makePrefs({
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 150,
      dailyTargetFat_g: 70,
      dailyTargetCarbs_g: 200,
    });
    expect(calcMacroKcalMismatch(prefs)).toBeNull();
  });

  it("returns 'over' when macro sum significantly exceeds kcal target", () => {
    // 200p * 4 + 100f * 9 + 300c * 4 = 800 + 900 + 1200 = 2900 vs target 2000
    const prefs = makePrefs({
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 200,
      dailyTargetFat_g: 100,
      dailyTargetCarbs_g: 300,
    });
    const result = calcMacroKcalMismatch(prefs);
    expect(result?.kind).toBe("over");
    expect(result?.diff).toBeGreaterThan(0);
  });

  it("returns 'under' when macro sum is significantly below kcal target", () => {
    // 50p * 4 + 20f * 9 + 50c * 4 = 200 + 180 + 200 = 580 vs target 2000
    const prefs = makePrefs({
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 50,
      dailyTargetFat_g: 20,
      dailyTargetCarbs_g: 50,
    });
    const result = calcMacroKcalMismatch(prefs);
    expect(result?.kind).toBe("under");
    expect(result?.diff).toBeLessThan(0);
  });
});
