import { describe, it, expect } from "vitest";
import { normalizeUSDABarcode, normalizeUSDASearch } from "./usda.js";

function stableId(
  prefix: string,
  _parts: Array<string | null | undefined>,
): string {
  return `${prefix}_stub`;
}

// ─── normalizeUSDABarcode ────────────────────────────────────────────────────

describe("normalizeUSDABarcode", () => {
  const foodNutrients = [
    { nutrientId: 1008, value: 64 },
    { nutrientId: 1003, value: 3.4 },
    { nutrientId: 1004, value: 3.6 },
    { nutrientId: 1005, value: 4.8 },
  ];

  it("happy path: returns normalized product with all fields", () => {
    const result = normalizeUSDABarcode({
      description: "Milk, whole",
      brandOwner: "Dairy Co",
      foodNutrients,
      servingSize: 244,
      servingSizeUnit: "g",
    });
    expect(result).toEqual({
      name: "Milk, whole",
      brand: "Dairy Co",
      kcal_100g: 64,
      protein_100g: 3.4,
      fat_100g: 3.6,
      carbs_100g: 4.8,
      servingSize: "244 g",
      servingGrams: 244,
      source: "usda",
    });
  });

  it("prefers brandOwner over brandName", () => {
    const result = normalizeUSDABarcode({
      description: "X",
      brandOwner: "Owner",
      brandName: "Name",
      foodNutrients,
    });
    expect(result!.brand).toBe("Owner");
  });

  it("falls back to brandName when brandOwner is missing", () => {
    const result = normalizeUSDABarcode({
      description: "X",
      brandName: "FallbackBrand",
      foodNutrients,
    });
    expect(result!.brand).toBe("FallbackBrand");
  });

  it("handles nutrient.id nested in nutrient object", () => {
    const result = normalizeUSDABarcode({
      description: "X",
      foodNutrients: [
        { nutrient: { id: 1008 }, amount: 200 },
        { nutrient: { id: 1003 }, amount: 10 },
      ],
    });
    expect(result!.kcal_100g).toBe(200);
    expect(result!.protein_100g).toBe(10);
  });

  it("returns null when food is null", () => {
    expect(normalizeUSDABarcode(null)).toBeNull();
  });

  it("returns null when food is undefined", () => {
    expect(normalizeUSDABarcode(undefined)).toBeNull();
  });

  it("returns null when description is empty", () => {
    expect(normalizeUSDABarcode({ description: "", foodNutrients })).toBeNull();
  });

  it("returns null when description is missing", () => {
    expect(normalizeUSDABarcode({ foodNutrients })).toBeNull();
  });

  it("returns null when all nutrients are missing", () => {
    expect(
      normalizeUSDABarcode({ description: "X", foodNutrients: [] }),
    ).toBeNull();
  });

  it("rounds nutrient values to 1 decimal place", () => {
    const result = normalizeUSDABarcode({
      description: "Test",
      foodNutrients: [{ nutrientId: 1008, value: 99.87 }],
    });
    expect(result!.kcal_100g).toBe(99.9);
  });

  it("handles malformed nutrient values gracefully", () => {
    const result = normalizeUSDABarcode({
      description: "Test",
      foodNutrients: [
        { nutrientId: 1008, value: NaN },
        { nutrientId: 1003, value: 5 },
      ],
    });
    expect(result!.kcal_100g).toBeNull();
    expect(result!.protein_100g).toBe(5);
  });

  it("sets servingSize to null when servingSizeUnit is missing", () => {
    const result = normalizeUSDABarcode({
      description: "Test",
      foodNutrients,
      servingSize: 100,
    });
    expect(result!.servingSize).toBeNull();
    expect(result!.servingGrams).toBe(100);
  });
});

// ─── normalizeUSDASearch ─────────────────────────────────────────────────────

describe("normalizeUSDASearch", () => {
  const foodNutrients = [
    { nutrientId: 1008, value: 64 },
    { nutrientId: 1003, value: 3.4 },
    { nutrientId: 1004, value: 3.6 },
    { nutrientId: 1005, value: 4.8 },
  ];

  it("happy path: returns normalized search product with fdcId", () => {
    const result = normalizeUSDASearch(
      { fdcId: 170290, description: "Milk, whole", foodNutrients },
      stableId,
    );
    expect(result).toEqual({
      id: "usda_170290",
      name: "Milk, whole",
      brand: null,
      source: "usda",
      per100: { kcal: 64, protein_g: 3.4, fat_g: 3.6, carbs_g: 4.8 },
      defaultGrams: 100,
    });
  });

  it("falls back to stableId when fdcId is missing", () => {
    const result = normalizeUSDASearch(
      { description: "Custom food", foodNutrients },
      stableId,
    );
    expect(result!.id).toBe("usda_stub");
  });

  it("returns null for null input", () => {
    expect(normalizeUSDASearch(null, stableId)).toBeNull();
  });

  it("returns null when description is empty", () => {
    expect(
      normalizeUSDASearch({ description: "", foodNutrients }, stableId),
    ).toBeNull();
  });

  it("returns null when all nutrients are missing", () => {
    expect(
      normalizeUSDASearch({ description: "X", foodNutrients: [] }, stableId),
    ).toBeNull();
  });

  it("fills missing nutrients with 0 in per100", () => {
    const result = normalizeUSDASearch(
      {
        fdcId: 1,
        description: "Partial",
        foodNutrients: [{ nutrientId: 1008, value: 100 }],
      },
      stableId,
    );
    expect(result!.per100).toEqual({
      kcal: 100,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
    });
  });

  it("maps the four tracked nutrient ids correctly", () => {
    const result = normalizeUSDASearch(
      { fdcId: 1, description: "X", foodNutrients },
      stableId,
    );
    expect(result!.per100).toEqual({
      kcal: 64,
      protein_g: 3.4,
      fat_g: 3.6,
      carbs_g: 4.8,
    });
  });
});
