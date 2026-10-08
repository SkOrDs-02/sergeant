import { describe, expect, it } from "vitest";
import {
  computeRecipePer100,
  computeRecipePerServing,
  computeRecipeTotal,
  type RecipeComponent,
} from "./recipeComponents.js";

const m = (kcal: number, p: number, f: number, c: number) => ({
  kcal,
  protein_g: p,
  fat_g: f,
  carbs_g: c,
});

const buckwheatChicken: RecipeComponent[] = [
  {
    name: "Гречка варена",
    grams: 250,
    foodId: null,
    per100: m(110, 4.2, 1.1, 21.3),
  },
  { name: "Куряче філе", grams: 150, foodId: null, per100: m(165, 31, 3.6, 0) },
  { name: "Олія", grams: 10, foodId: null, per100: m(884, 0, 100, 0) },
];

describe("recipeComponents (контроль датасету «Гречка з філе»)", () => {
  it("total", () => {
    const t = computeRecipeTotal(buckwheatChicken);
    expect(t.kcal).toBeCloseTo(610.9, 5);
    expect(t.protein_g).toBeCloseTo(57, 5);
    expect(t.fat_g).toBeCloseTo(18.15, 5);
    expect(t.carbs_g).toBeCloseTo(53.25, 5);
  });

  it("на порцію (2 порції)", () => {
    const s = computeRecipePerServing(buckwheatChicken, 2);
    expect(s.kcal).toBeCloseTo(305.45, 5);
    expect(s.protein_g).toBeCloseTo(28.5, 5);
    expect(s.fat_g).toBeCloseTo(9.075, 5);
    expect(s.carbs_g).toBeCloseTo(26.625, 5);
  });

  it("1 порція дорівнює сумі", () => {
    expect(computeRecipePerServing(buckwheatChicken, 1)).toEqual(
      computeRecipeTotal(buckwheatChicken),
    );
  });

  it("на 100 г при вазі 400", () => {
    const p = computeRecipePer100(buckwheatChicken, 400);
    expect(p.kcal).toBeCloseTo(152.725, 5);
    expect(p.protein_g).toBeCloseTo(14.25, 5);
    expect(p.fat_g).toBeCloseTo(4.5375, 5);
    expect(p.carbs_g).toBeCloseTo(13.3125, 5);
  });

  it("рахує від введеної ваги, а не від суми грамів (410)", () => {
    expect(computeRecipePer100(buckwheatChicken, 410).kcal).toBeCloseTo(149, 0);
  });

  it("без ваги все null", () => {
    for (const w of [null, undefined, 0]) {
      expect(computeRecipePer100(buckwheatChicken, w)).toEqual({
        kcal: null,
        protein_g: null,
        fat_g: null,
        carbs_g: null,
      });
    }
  });

  it("null у полі одного компонента дає null у цьому полі всіх результатів", () => {
    const withNull: RecipeComponent[] = [
      ...buckwheatChicken.slice(0, 2),
      {
        name: "Олія",
        grams: 10,
        foodId: null,
        per100: { ...m(884, 0, 100, 0), fat_g: null },
      },
    ];
    for (const r of [
      computeRecipeTotal(withNull),
      computeRecipePerServing(withNull, 2),
      computeRecipePer100(withNull, 400),
    ]) {
      expect(r.fat_g).toBeNull();
      expect(r.kcal).not.toBeNull();
    }
  });
});
