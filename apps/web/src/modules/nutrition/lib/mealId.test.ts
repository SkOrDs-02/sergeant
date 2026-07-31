/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { newMealId } from "./mealId";

// `generatePrefixedId` віддає `<prefix>_<uuid>` через `crypto.randomUUID()`.
const MEAL_ID =
  /^meal_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("newMealId", () => {
  it("returns ids with meal_ prefix and unique tails", () => {
    const a = newMealId();
    const b = newMealId();
    expect(a).toMatch(MEAL_ID);
    expect(b).toMatch(MEAL_ID);
    expect(a).not.toBe(b);
  });
});
