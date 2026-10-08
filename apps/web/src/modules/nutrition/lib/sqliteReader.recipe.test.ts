/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { rowToRecipe } from "./sqliteReader";

const row = (data: Record<string, unknown>) => ({
  id: "rcp_1",
  name: "X",
  data_json: JSON.stringify(data),
});

describe("rowToRecipe: components і cookedWeightG", () => {
  const components = [
    {
      name: "Гречка",
      grams: 250,
      foodId: null,
      per100: { kcal: 110, protein_g: 4.2, fat_g: 1.1, carbs_g: 21.3 },
    },
  ];

  it("переносить склад і вагу", () => {
    const r = rowToRecipe(row({ title: "X", components, cookedWeightG: 400 }));
    expect(r?.components).toEqual(components);
    expect(r?.cookedWeightG).toBe(400);
  });

  it("невалідна вага стає null; вага без складу відкидається", () => {
    expect(
      rowToRecipe(row({ title: "X", components, cookedWeightG: 0 }))
        ?.cookedWeightG,
    ).toBeNull();
    const ai = rowToRecipe(row({ title: "X", cookedWeightG: 400 }));
    expect(ai?.components).toBeUndefined();
    expect(ai?.cookedWeightG).toBeUndefined();
  });
});
