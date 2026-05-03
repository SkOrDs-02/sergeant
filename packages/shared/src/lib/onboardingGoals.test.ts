import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "../storage/kv";
import {
  EMPTY_GOALS,
  ONBOARDING_GOALS_KEY,
  getGoalQuestions,
  getOnboardingGoals,
  saveOnboardingGoals,
  type OnboardingGoals,
} from "./onboardingGoals";

describe("onboardingGoals — storage", () => {
  it("returns EMPTY_GOALS from a fresh store", () => {
    const store = createMemoryKVStore();
    expect(getOnboardingGoals(store)).toEqual(EMPTY_GOALS);
  });

  it("round-trips valid goals", () => {
    const store = createMemoryKVStore();
    const goals: OnboardingGoals = {
      finykBudget: 15000,
      fizrukWeeklyGoal: 3,
      routineFirstHabit: "water",
      nutritionGoal: "lose",
    };
    saveOnboardingGoals(store, goals);
    expect(getOnboardingGoals(store)).toEqual(goals);
  });

  it("normalises invalid values to null", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_GOALS_KEY]: JSON.stringify({
        finykBudget: -100,
        fizrukWeeklyGoal: 0,
        routineFirstHabit: "",
        nutritionGoal: "invalid",
      }),
    });
    expect(getOnboardingGoals(store)).toEqual(EMPTY_GOALS);
  });

  it("handles malformed JSON gracefully", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_GOALS_KEY]: "not-json",
    });
    expect(getOnboardingGoals(store)).toEqual(EMPTY_GOALS);
  });

  it("handles non-object JSON gracefully", () => {
    const store = createMemoryKVStore({
      [ONBOARDING_GOALS_KEY]: JSON.stringify("string"),
    });
    expect(getOnboardingGoals(store)).toEqual(EMPTY_GOALS);
  });

  it("accepts valid nutritionGoal values", () => {
    for (const goal of ["lose", "gain", "maintain"] as const) {
      const store = createMemoryKVStore();
      saveOnboardingGoals(store, { ...EMPTY_GOALS, nutritionGoal: goal });
      expect(getOnboardingGoals(store).nutritionGoal).toBe(goal);
    }
  });
});

describe("onboardingGoals — getGoalQuestions", () => {
  it("returns no questions for empty picks", () => {
    expect(getGoalQuestions([])).toEqual([]);
  });

  it("returns questions ordered by friction priority", () => {
    const questions = getGoalQuestions([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);
    expect(questions[0].module).toBe("routine");
    expect(questions[1].module).toBe("finyk");
    expect(questions[2].module).toBe("nutrition");
  });

  it("caps at maxQuestions", () => {
    const questions = getGoalQuestions(
      ["finyk", "fizruk", "routine", "nutrition"],
      2,
    );
    expect(questions).toHaveLength(2);
  });

  it("only returns questions for picked modules", () => {
    const questions = getGoalQuestions(["finyk"]);
    expect(questions).toHaveLength(1);
    expect(questions[0].module).toBe("finyk");
  });

  it("includes correct question types", () => {
    const questions = getGoalQuestions([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);
    const finykQ = questions.find((q) => q.module === "finyk");
    expect(finykQ?.type).toBe("slider");
    const routineQ = questions.find((q) => q.module === "routine");
    expect(routineQ?.type).toBe("radio");
  });
});
