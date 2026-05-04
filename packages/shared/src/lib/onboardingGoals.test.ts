import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "../storage/kv";
import {
  EMPTY_GOALS,
  FIRST_ACTION_PRIORITY,
  ONBOARDING_GOALS_KEY,
  getGoalQuestions,
  getOnboardingGoals,
  pickPrimaryFirstAction,
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
    expect(questions[0]?.module).toBe("routine");
    expect(questions[1]?.module).toBe("finyk");
    expect(questions[2]?.module).toBe("nutrition");
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
    expect(questions[0]?.module).toBe("finyk");
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

describe("onboardingGoals — pickPrimaryFirstAction (S2.1)", () => {
  const ALL_PICKS = ["routine", "finyk", "nutrition", "fizruk"];

  it("falls back to FIRST_ACTION_PRIORITY when no goals are set", () => {
    expect(pickPrimaryFirstAction(ALL_PICKS, EMPTY_GOALS)).toBe("routine");
  });

  it("picks the highest-priority pick when goals are empty", () => {
    expect(pickPrimaryFirstAction(["finyk", "nutrition"], EMPTY_GOALS)).toBe(
      "finyk",
    );
    expect(pickPrimaryFirstAction(["fizruk"], EMPTY_GOALS)).toBe("fizruk");
  });

  it("returns 'routine' as a safe default when picks is empty", () => {
    expect(pickPrimaryFirstAction([], EMPTY_GOALS)).toBe("routine");
  });

  it("promotes finyk when finykBudget is set and finyk is in picks", () => {
    expect(
      pickPrimaryFirstAction(ALL_PICKS, {
        ...EMPTY_GOALS,
        finykBudget: 30000,
      }),
    ).toBe("finyk");
  });

  it("promotes nutrition when nutritionGoal is set", () => {
    expect(
      pickPrimaryFirstAction(ALL_PICKS, {
        ...EMPTY_GOALS,
        nutritionGoal: "lose",
      }),
    ).toBe("nutrition");
  });

  it("promotes fizruk when fizrukWeeklyGoal is set", () => {
    expect(
      pickPrimaryFirstAction(ALL_PICKS, {
        ...EMPTY_GOALS,
        fizrukWeeklyGoal: 3,
      }),
    ).toBe("fizruk");
  });

  it("ignores a goal whose module is not in picks", () => {
    // User set finykBudget but didn't pick finyk → don't promote finyk.
    expect(
      pickPrimaryFirstAction(["routine", "fizruk"], {
        ...EMPTY_GOALS,
        finykBudget: 30000,
      }),
    ).toBe("routine");
  });

  it("uses FIRST_ACTION_PRIORITY to break ties between multiple goals", () => {
    // Both routineFirstHabit and finykBudget set → routine wins (lower friction).
    expect(
      pickPrimaryFirstAction(ALL_PICKS, {
        ...EMPTY_GOALS,
        finykBudget: 30000,
        routineFirstHabit: "water",
      }),
    ).toBe("routine");
    // finyk + fizruk goals set → finyk wins.
    expect(
      pickPrimaryFirstAction(ALL_PICKS, {
        ...EMPTY_GOALS,
        finykBudget: 30000,
        fizrukWeeklyGoal: 3,
      }),
    ).toBe("finyk");
  });

  it("FIRST_ACTION_PRIORITY exposes the friction-first ordering", () => {
    expect([...FIRST_ACTION_PRIORITY]).toEqual([
      "routine",
      "finyk",
      "nutrition",
      "fizruk",
    ]);
  });
});
