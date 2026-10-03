import { describe, it, expect } from "vitest";
import { nextMealLabel, firstUnrecordedMealType } from "./nextMealLabel";
import type { MealTypeId } from "@sergeant/nutrition-domain";

function kcal(overrides: Partial<Record<MealTypeId, number>>) {
  return {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
    ...overrides,
  } satisfies Record<MealTypeId, number>;
}

describe("nutrition/nextMealLabel", () => {
  it("empty day → лишилось на сніданок", () => {
    expect(nextMealLabel(kcal({}))).toBe("лишилось на сніданок");
    expect(firstUnrecordedMealType(kcal({}))).toBe("breakfast");
  });

  it("after breakfast → лишилось на обід", () => {
    expect(nextMealLabel(kcal({ breakfast: 400 }))).toBe("лишилось на обід");
  });

  it("after breakfast + lunch → лишилось на вечерю", () => {
    expect(nextMealLabel(kcal({ breakfast: 400, lunch: 600 }))).toBe(
      "лишилось на вечерю",
    );
  });

  it("after breakfast + lunch + dinner → лишилось на перекус", () => {
    expect(
      nextMealLabel(kcal({ breakfast: 400, lunch: 600, dinner: 700 })),
    ).toBe("лишилось на перекус");
  });

  it("all four recorded → лишилось сьогодні", () => {
    expect(
      nextMealLabel(
        kcal({ breakfast: 400, lunch: 600, dinner: 700, snack: 150 }),
      ),
    ).toBe("лишилось сьогодні");
    expect(
      firstUnrecordedMealType(
        kcal({ breakfast: 400, lunch: 600, dinner: 700, snack: 150 }),
      ),
    ).toBeNull();
  });

  it("treats a zero/negative kcal type as unrecorded", () => {
    expect(nextMealLabel(kcal({ breakfast: 0 }))).toBe("лишилось на сніданок");
  });
});
