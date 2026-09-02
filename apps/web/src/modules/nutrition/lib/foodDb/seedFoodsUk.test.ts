import { describe, expect, it } from "vitest";
import { SEED_FOODS_UK } from "./seedFoodsUk";

describe("SEED_FOODS_UK", () => {
  it("should contain exactly 424 seed foods", () => {
    expect(SEED_FOODS_UK).toHaveLength(424);
  });

  it("should have the correct structure for every item", () => {
    for (const food of SEED_FOODS_UK) {
      expect(typeof food.name).toBe("string");
      expect(food.name.length).toBeGreaterThan(0);
      expect(typeof food.per100.kcal).toBe("number");
      expect(typeof food.per100.protein_g).toBe("number");
      expect(typeof food.per100.fat_g).toBe("number");
      expect(typeof food.per100.carbs_g).toBe("number");
    }
  });

  it("should have no duplicate names", () => {
    const names = SEED_FOODS_UK.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
