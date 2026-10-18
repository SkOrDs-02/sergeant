import { describe, expect, it } from "vitest";
import {
  MAX_PORTION_GRAMS,
  normalizeCookedWeightG,
  normalizeRecipeComponents,
  recipeCompositionFields,
} from "./recipeComposition.js";

describe("normalizeRecipeComponents", () => {
  it("повертає undefined для не-масиву й порожнього результату", () => {
    expect(normalizeRecipeComponents(null)).toBeUndefined();
    expect(
      normalizeRecipeComponents([{ name: "", grams: 10 }]),
    ).toBeUndefined();
  });

  it("відкидає невалідні компоненти й нормалізує валідні", () => {
    const out = normalizeRecipeComponents([
      { name: " Борошно ", grams: 200, foodId: "f1" },
      { name: "X", grams: 0 },
      { name: "Y", grams: MAX_PORTION_GRAMS + 1 },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out?.[0]).toMatchObject({
      name: "Борошно",
      grams: 200,
      foodId: "f1",
    });
  });

  it("обмежує кількість компонентів до 80", () => {
    const raw = Array.from({ length: 100 }, (_, i) => ({
      name: `c${i}`,
      grams: 1,
    }));
    expect(normalizeRecipeComponents(raw)).toHaveLength(80);
  });
});

describe("normalizeCookedWeightG", () => {
  it("приймає (0, 10000] і відкидає решту", () => {
    expect(normalizeCookedWeightG(10_000)).toBe(10_000);
    expect(normalizeCookedWeightG(10_001)).toBeNull();
    expect(normalizeCookedWeightG(0)).toBeNull();
    expect(normalizeCookedWeightG("5")).toBeNull();
  });
});

describe("recipeCompositionFields", () => {
  it("вага без складу відкидається", () => {
    expect(recipeCompositionFields({ cookedWeightG: 500 })).toEqual({});
  });

  it("склад + вага; невалідна вага стає null", () => {
    const comps = [{ name: "A", grams: 5 }];
    expect(
      recipeCompositionFields({ components: comps, cookedWeightG: 300 }),
    ).toMatchObject({ cookedWeightG: 300 });
    expect(
      recipeCompositionFields({ components: comps, cookedWeightG: -1 }),
    ).toMatchObject({ cookedWeightG: null });
  });
});
