import { mealFormStateFromBarcodeProduct } from "../applyBarcodeProduct";
import type { BarcodeProduct } from "@sergeant/api-client";

describe("mealFormStateFromBarcodeProduct", () => {
  it("масштабує макроси на servingGrams (не 100г)", () => {
    const p: BarcodeProduct = {
      name: "Milk",
      brand: "Test",
      servingSize: null,
      servingGrams: 250,
      kcal_100g: 100,
      protein_100g: 3,
      fat_100g: 3.5,
      carbs_100g: 5,
      source: "off",
    };
    const f = mealFormStateFromBarcodeProduct(p, "12345678");
    expect(f.name).toBe("Milk Test");
    expect(f.kcal).toBe("250");
    expect(f.protein_g).toBe("8");
    expect(f.fat_g).toBe("9");
    expect(f.carbs_g).toBe("13");
  });
});
