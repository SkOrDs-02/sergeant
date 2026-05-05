import { describe, expect, it } from "vitest";

import { EMPTY_GOALS } from "./onboardingGoals";

import {
  buildValueProgressBars,
  hasAnyValueProgressBar,
} from "./valueProgressBars";

describe("buildValueProgressBars (S3.3 shared)", () => {
  it("returns no bars when no module has a goal set", () => {
    expect(
      buildValueProgressBars({
        activeModules: ["finyk", "routine"],
        goals: EMPTY_GOALS,
      }),
    ).toEqual([]);
  });

  it("returns no bars when goals exist but their modules are not active", () => {
    expect(
      buildValueProgressBars({
        activeModules: ["fizruk", "nutrition"],
        goals: {
          ...EMPTY_GOALS,
          finykBudget: 30000,
          routineFirstHabit: "water",
        },
      }),
    ).toEqual([]);
  });

  it("builds a routine bar with outcome-first label and 0/30 counter", () => {
    const bars = buildValueProgressBars({
      activeModules: ["routine"],
      goals: { ...EMPTY_GOALS, routineFirstHabit: "water" },
    });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      testId: "value-progress-bar-routine",
      label: "«Пити воду» — через 30 днів автоматично",
      current: "Зараз: 0/30",
      percent: 0,
    });
  });

  it("falls back to a generic habit label for unknown preset ids", () => {
    const bars = buildValueProgressBars({
      activeModules: ["routine"],
      goals: { ...EMPTY_GOALS, routineFirstHabit: "custom" },
    });
    expect(bars).toHaveLength(1);
    expect(bars[0]!.label).toBe("«Своя звичка» — через 30 днів автоматично");
  });

  it("formats the finyk budget in thousands with the wizard separator", () => {
    const bars = buildValueProgressBars({
      activeModules: ["finyk"],
      goals: { ...EMPTY_GOALS, finykBudget: 30000 },
    });
    expect(bars).toHaveLength(1);
    // 30000 → "30 000 ₴" (NBSP between thousands; `replace(/,/g, " ")` upgrades
    // toLocaleString's separator to the visible space the slider label uses).
    expect(bars[0]!.label).toMatch(/Бюджет 30[ \u00a0]000 ₴/);
    expect(bars[0]!.current).toBe("Записано 0 ₴");
  });

  it("renders a nutrition bar with the goal-specific outcome label", () => {
    const bars = buildValueProgressBars({
      activeModules: ["nutrition"],
      goals: { ...EMPTY_GOALS, nutritionGoal: "maintain" },
    });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      testId: "value-progress-bar-nutrition",
      label: "Підтримка ваги",
      current: "0 страв сьогодні",
      percent: 0,
    });
  });

  it("renders a fizruk bar with the per-week target", () => {
    const bars = buildValueProgressBars({
      activeModules: ["fizruk"],
      goals: { ...EMPTY_GOALS, fizrukWeeklyGoal: 3 },
    });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      testId: "value-progress-bar-fizruk",
      label: "3×/тиждень",
      current: "0 з 3",
      percent: 0,
    });
  });

  it("orders bars routine → finyk → nutrition → fizruk", () => {
    const bars = buildValueProgressBars({
      activeModules: ["fizruk", "nutrition", "finyk", "routine"],
      goals: {
        finykBudget: 30000,
        fizrukWeeklyGoal: 4,
        nutritionGoal: "lose",
        routineFirstHabit: "water",
      },
    });
    expect(bars.map((b) => b.testId)).toEqual([
      "value-progress-bar-routine",
      "value-progress-bar-finyk",
      "value-progress-bar-nutrition",
      "value-progress-bar-fizruk",
    ]);
  });

  it("hides bars whose module is not active even if goals are set", () => {
    const bars = buildValueProgressBars({
      activeModules: ["routine"],
      goals: {
        ...EMPTY_GOALS,
        fizrukWeeklyGoal: 3,
        nutritionGoal: "lose",
        routineFirstHabit: "water",
      },
    });
    expect(bars.map((b) => b.testId)).toEqual(["value-progress-bar-routine"]);
  });
});

describe("hasAnyValueProgressBar (S3.3 shared)", () => {
  it("is false for empty goals", () => {
    expect(
      hasAnyValueProgressBar({
        activeModules: ["finyk", "routine"],
        goals: EMPTY_GOALS,
      }),
    ).toBe(false);
  });

  it("is true when at least one active module has a goal", () => {
    expect(
      hasAnyValueProgressBar({
        activeModules: ["routine"],
        goals: { ...EMPTY_GOALS, routineFirstHabit: "water" },
      }),
    ).toBe(true);
  });

  it("is false when goals exist but their modules are not active", () => {
    expect(
      hasAnyValueProgressBar({
        activeModules: ["fizruk"],
        goals: { ...EMPTY_GOALS, finykBudget: 10000 },
      }),
    ).toBe(false);
  });
});
