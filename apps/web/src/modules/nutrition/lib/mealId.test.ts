/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { newMealId } from "./mealId";

describe("newMealId", () => {
  it("returns ids with meal_ prefix and unique tails", () => {
    const a = newMealId();
    const b = newMealId();
    expect(a).toMatch(/^meal_\d+_[0-9a-f]{8}$/);
    expect(b).toMatch(/^meal_\d+_[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});
