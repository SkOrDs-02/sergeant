import { describe, expect, it } from "vitest";
import { stableRecipeId } from "./recipeIds.js";

describe("stableRecipeId", () => {
  it("is deterministic for same recipe", () => {
    const r = {
      title: "Омлет",
      timeMinutes: 10,
      servings: 1,
      ingredients: ["яйця", "сіль"],
      steps: ["збити", "посмажити"],
    };
    expect(stableRecipeId(r)).toBe(stableRecipeId({ ...r }));
  });

  it("differs when recipe changes", () => {
    const a = { title: "Омлет", ingredients: ["яйця"] };
    const b = { title: "Омлет", ingredients: ["яйця", "сир"] };
    expect(stableRecipeId(a)).not.toBe(stableRecipeId(b));
  });
});
