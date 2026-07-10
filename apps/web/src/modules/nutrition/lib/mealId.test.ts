/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for centralized meal-id generation.
 */
import { describe, expect, it } from "vitest";

import { newMealId } from "./mealId";

describe("newMealId", () => {
  it("returns a meal_-prefixed id with an 8-hex random tail", () => {
    const id = newMealId();
    expect(id).toMatch(/^meal_\d+_[0-9a-f]{8}$/);
  });

  it("generates unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newMealId()));
    expect(ids.size).toBe(20);
  });
});
