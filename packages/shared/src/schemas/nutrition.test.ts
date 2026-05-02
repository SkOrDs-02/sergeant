import { describe, expect, it } from "vitest";
import {
  BarcodeProductSchema,
  BarcodeLookupSuccessSchema,
  BarcodeLookupErrorSchema,
  FoodSearchProductSchema,
  FoodSearchSuccessSchema,
  FoodSearchErrorSchema,
} from "./nutrition";

describe("BarcodeProductSchema", () => {
  it("accepts a fully-populated OFF product", () => {
    const parsed = BarcodeProductSchema.parse({
      name: "Milk 2%",
      brand: "Yagotynske",
      kcal_100g: 52,
      protein_100g: 3.4,
      fat_100g: 2,
      carbs_100g: 4.8,
      servingSize: "250 ml",
      servingGrams: 250,
      source: "off",
    });
    expect(parsed.brand).toBe("Yagotynske");
    expect(parsed.partial).toBeUndefined();
  });

  it("accepts null for every nullable field except enum", () => {
    const parsed = BarcodeProductSchema.parse({
      name: "Unknown",
      brand: null,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingSize: null,
      servingGrams: null,
      source: "upcitemdb",
      partial: true,
    });
    expect(parsed.brand).toBeNull();
    expect(parsed.partial).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(() =>
      BarcodeProductSchema.parse({
        name: "",
        brand: null,
        kcal_100g: null,
        protein_100g: null,
        fat_100g: null,
        carbs_100g: null,
        servingSize: null,
        servingGrams: null,
        source: "off",
      }),
    ).toThrow();
  });

  it("rejects an unknown source value", () => {
    expect(() =>
      BarcodeProductSchema.parse({
        name: "Milk",
        brand: null,
        kcal_100g: null,
        protein_100g: null,
        fat_100g: null,
        carbs_100g: null,
        servingSize: null,
        servingGrams: null,
        source: "barcoo",
      }),
    ).toThrow();
  });

  it("rejects undefined for a nullable field (guards against implicit absent)", () => {
    expect(() =>
      BarcodeProductSchema.parse({
        name: "Milk",
        // brand intentionally omitted
        kcal_100g: null,
        protein_100g: null,
        fat_100g: null,
        carbs_100g: null,
        servingSize: null,
        servingGrams: null,
        source: "off",
      }),
    ).toThrow();
  });
});

describe("BarcodeLookupSuccessSchema", () => {
  it("wraps a valid product in `product`", () => {
    const parsed = BarcodeLookupSuccessSchema.parse({
      product: {
        name: "Milk",
        brand: null,
        kcal_100g: 50,
        protein_100g: 3,
        fat_100g: 2,
        carbs_100g: 5,
        servingSize: null,
        servingGrams: null,
        source: "usda",
      },
    });
    expect(parsed.product.name).toBe("Milk");
  });

  it("rejects a missing product envelope (server must never send just a bare product)", () => {
    expect(() =>
      BarcodeLookupSuccessSchema.parse({
        name: "Milk",
      }),
    ).toThrow();
  });
});

describe("BarcodeLookupErrorSchema", () => {
  it("requires a non-empty error string", () => {
    expect(
      BarcodeLookupErrorSchema.parse({ error: "Продукт не знайдено" }).error,
    ).toBe("Продукт не знайдено");
    expect(() => BarcodeLookupErrorSchema.parse({ error: "" })).toThrow();
  });
});

describe("FoodSearchProductSchema", () => {
  const VALID = {
    id: "off_482",
    name: "Banana",
    brand: null,
    source: "off" as const,
    per100: { kcal: 89, protein_g: 1.1, fat_g: 0.3, carbs_g: 22.8 },
    defaultGrams: 100,
  };

  it("accepts a fully-populated OFF row", () => {
    const parsed = FoodSearchProductSchema.parse({
      ...VALID,
      brand: "Chiquita",
    });
    expect(parsed.brand).toBe("Chiquita");
    expect(parsed.per100.kcal).toBe(89);
  });

  it("accepts null brand (USDA entries never carry one)", () => {
    const parsed = FoodSearchProductSchema.parse({
      ...VALID,
      source: "usda",
      id: "usda_173944",
    });
    expect(parsed.brand).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(() =>
      FoodSearchProductSchema.parse({ ...VALID, name: "" }),
    ).toThrow();
  });

  it("rejects unknown source (`off` / `usda` only)", () => {
    expect(() =>
      FoodSearchProductSchema.parse({ ...VALID, source: "upcitemdb" }),
    ).toThrow();
  });

  it("rejects null macros — server always fills with zero", () => {
    expect(() =>
      FoodSearchProductSchema.parse({
        ...VALID,
        per100: { kcal: null, protein_g: 0, fat_g: 0, carbs_g: 0 },
      }),
    ).toThrow();
  });

  it("rejects undefined brand (guards against implicit absent)", () => {
    const { brand: _brand, ...rest } = VALID;
    void _brand;
    expect(() => FoodSearchProductSchema.parse(rest)).toThrow();
  });
});

describe("FoodSearchSuccessSchema", () => {
  it("wraps an array of valid rows in `products`", () => {
    const parsed = FoodSearchSuccessSchema.parse({
      products: [
        {
          id: "off_1",
          name: "Apple",
          brand: null,
          source: "off",
          per100: { kcal: 52, protein_g: 0.3, fat_g: 0.2, carbs_g: 13.8 },
          defaultGrams: 100,
        },
      ],
    });
    expect(parsed.products).toHaveLength(1);
  });

  it("accepts an empty products array (`{}` vs `{ products: [] }` distinction matters)", () => {
    expect(FoodSearchSuccessSchema.parse({ products: [] }).products).toEqual(
      [],
    );
    expect(() => FoodSearchSuccessSchema.parse({})).toThrow();
  });
});

describe("FoodSearchErrorSchema", () => {
  it("requires a non-empty error string", () => {
    expect(
      FoodSearchErrorSchema.parse({
        error: "Сервіс недоступний (таймаут)",
      }).error,
    ).toMatch(/таймаут/);
    expect(() => FoodSearchErrorSchema.parse({ error: "" })).toThrow();
  });
});
