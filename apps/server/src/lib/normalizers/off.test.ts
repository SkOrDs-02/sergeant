import { describe, it, expect } from "vitest";
import { normalizeOFFBarcode, normalizeOFFSearch } from "./off.js";

function stableId(
  prefix: string,
  _parts: Array<string | null | undefined>,
): string {
  return `${prefix}_stub`;
}

// ─── normalizeOFFBarcode ─────────────────────────────────────────────────────

describe("normalizeOFFBarcode", () => {
  const nutriments = {
    "energy-kcal_100g": 250,
    proteins_100g: 3.2,
    fat_100g: 1.1,
    carbohydrates_100g: 52,
  };

  it("happy path: returns normalized product with all fields", () => {
    const result = normalizeOFFBarcode({
      product_name: "Nutella",
      brands: "Ferrero",
      nutriments,
      serving_size: "15 g",
      serving_quantity: 15,
    });
    expect(result).toEqual({
      name: "Nutella",
      brand: "Ferrero",
      kcal_100g: 250,
      protein_100g: 3.2,
      fat_100g: 1.1,
      carbs_100g: 52,
      servingSize: "15 g",
      servingGrams: 15,
      source: "off",
      // Ключ присутній завжди — OFF нутрієнти віддає. `null` усередині
      // означає «спитали, у цій картці немає»; ключа немає лише у джерел,
      // які таких даних не мають узагалі (див. `ProductNutrientsSchema`).
      nutrients: {
        fiber_100g: null,
        sugars_100g: null,
        saturatedFat_100g: null,
        salt_100g: null,
        alcohol_100g: null,
      },
    });
  });

  it("витягує нутрієнти понад КБЖВ із того самого блоку", () => {
    const result = normalizeOFFBarcode({
      product_name: "Хліб",
      nutriments: {
        ...nutriments,
        fiber_100g: 2.71,
        sugars_100g: 4.4,
        "saturated-fat_100g": 0.26,
        salt_100g: 1.2,
      },
    });
    expect(result!.nutrients).toEqual({
      fiber_100g: 2.7,
      sugars_100g: 4.4,
      saturatedFat_100g: 0.3,
      salt_100g: 1.2,
      alcohol_100g: null,
    });
  });

  // Частина карток OFF заповнена з американських етикеток, де друкують
  // натрій, а не сіль. Коефіцієнт 2.5 — стехіометрія NaCl, не наближення.
  it("рахує сіль із натрію, коли прямого поля немає", () => {
    const result = normalizeOFFBarcode({
      product_name: "Чипси",
      nutriments: { ...nutriments, sodium_100g: 0.5 },
    });
    expect(result!.nutrients.salt_100g).toBe(1.3);
  });

  it("пряма сіль виграє в натрію, якщо є обидва", () => {
    const result = normalizeOFFBarcode({
      product_name: "Чипси",
      nutriments: { ...nutriments, salt_100g: 1.1, sodium_100g: 0.5 },
    });
    expect(result!.nutrients.salt_100g).toBe(1.1);
  });

  // Не для показу в картці, а для воріт Атвотера: без спирту формула
  // оголошує битим кожен алкогольний напій (див. AI-DANGER у
  // `productCatalog.ts`).
  it("тягне спирт, хоча в картці його не показуємо", () => {
    const result = normalizeOFFBarcode({
      product_name: "Вино сухе",
      nutriments: { ...nutriments, alcohol_100g: 11.5 },
    });
    expect(result!.nutrients.alcohol_100g).toBe(11.5);
  });

  it("prefers product_name_uk over product_name", () => {
    const result = normalizeOFFBarcode({
      product_name: "Milk",
      product_name_uk: "Молоко",
      nutriments,
    });
    expect(result!.name).toBe("Молоко");
  });

  it("takes only the first brand from comma-separated list", () => {
    const result = normalizeOFFBarcode({
      product_name: "X",
      brands: "Alpha, Beta, Gamma",
      nutriments,
    });
    expect(result!.brand).toBe("Alpha");
  });

  it("returns null when product is null", () => {
    expect(normalizeOFFBarcode(null)).toBeNull();
  });

  it("returns null when product is undefined", () => {
    expect(normalizeOFFBarcode(undefined)).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(normalizeOFFBarcode({ nutriments })).toBeNull();
  });

  it("returns null when all macros are missing", () => {
    expect(
      normalizeOFFBarcode({ product_name: "Empty", nutriments: {} }),
    ).toBeNull();
  });

  it("rounds macros to 1 decimal place", () => {
    const result = normalizeOFFBarcode({
      product_name: "Test",
      nutriments: { "energy-kcal_100g": 99.87 },
    });
    expect(result!.kcal_100g).toBe(99.9);
  });

  it("handles malformed nutriment values gracefully", () => {
    const result = normalizeOFFBarcode({
      product_name: "Test",
      nutriments: {
        "energy-kcal_100g": "not-a-number",
        proteins_100g: 5,
      },
    });
    expect(result!.kcal_100g).toBeNull();
    expect(result!.protein_100g).toBe(5);
  });

  it("falls back to energy-kcal when energy-kcal_100g is absent", () => {
    const result = normalizeOFFBarcode({
      product_name: "Test",
      nutriments: { "energy-kcal": 120 },
    });
    expect(result!.kcal_100g).toBe(120);
  });

  it("handles serving_quantity as string", () => {
    const result = normalizeOFFBarcode({
      product_name: "Test",
      nutriments,
      serving_quantity: "30",
    });
    expect(result!.servingGrams).toBe(30);
  });

  it("handles non-finite serving_quantity", () => {
    const result = normalizeOFFBarcode({
      product_name: "Test",
      nutriments,
      serving_quantity: "abc",
    });
    expect(result!.servingGrams).toBeNull();
  });
});

// ─── normalizeOFFSearch ──────────────────────────────────────────────────────

describe("normalizeOFFSearch", () => {
  const nutriments = {
    "energy-kcal_100g": 250,
    proteins_100g: 3.2,
    fat_100g: 1.1,
    carbohydrates_100g: 52,
  };

  it("happy path: returns normalized search product with code-based id", () => {
    const result = normalizeOFFSearch(
      {
        code: "3017620422003",
        product_name: "Nutella",
        brands: "Ferrero",
        nutriments,
      },
      stableId,
    );
    expect(result).toEqual({
      id: "off_3017620422003",
      name: "Nutella",
      brand: "Ferrero",
      source: "off",
      per100: { kcal: 250, protein_g: 3.2, fat_g: 1.1, carbs_g: 52 },
      defaultGrams: 100,
    });
  });

  it("strips leading zeros from code but keeps single 0", () => {
    const result = normalizeOFFSearch(
      { code: "000012345", product_name: "X", nutriments },
      stableId,
    );
    expect(result!.id).toBe("off_12345");

    const zero = normalizeOFFSearch(
      { code: "0000", product_name: "Z", nutriments },
      stableId,
    );
    expect(zero!.id).toBe("off_0");
  });

  it("falls back to stableId when code is absent", () => {
    const result = normalizeOFFSearch(
      { product_name_uk: "Молоко", brands: "Галичина", nutriments },
      stableId,
    );
    expect(result!.id).toBe("off_stub");
  });

  it("prefers Ukrainian name", () => {
    const result = normalizeOFFSearch(
      { product_name: "Milk", product_name_uk: "Молоко", nutriments },
      stableId,
    );
    expect(result!.name).toBe("Молоко");
  });

  it("accepts Latin name with digits and punctuation", () => {
    const result = normalizeOFFSearch(
      { product_name: "Greek Yogurt 2.5% (500 g)", nutriments },
      stableId,
    );
    expect(result!.name).toBe("Greek Yogurt 2.5% (500 g)");
  });

  it("rejects product_name with control characters", () => {
    expect(
      normalizeOFFSearch(
        { product_name: "bad\u0000name", nutriments },
        stableId,
      ),
    ).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeOFFSearch(null, stableId)).toBeNull();
  });

  it("returns null when all macros are missing", () => {
    expect(
      normalizeOFFSearch({ product_name: "Empty", nutriments: {} }, stableId),
    ).toBeNull();
  });

  it("fills missing macros with 0 in per100", () => {
    const result = normalizeOFFSearch(
      { product_name: "X", nutriments: { "energy-kcal_100g": 100 } },
      stableId,
    );
    expect(result!.per100).toEqual({
      kcal: 100,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
    });
  });

  it("uses serving_quantity as defaultGrams when present", () => {
    const result = normalizeOFFSearch(
      { product_name: "X", nutriments, serving_quantity: 250 },
      stableId,
    );
    expect(result!.defaultGrams).toBe(250);
  });

  it("defaults defaultGrams to 100 when serving_quantity is absent", () => {
    const result = normalizeOFFSearch(
      { product_name: "X", nutriments },
      stableId,
    );
    expect(result!.defaultGrams).toBe(100);
  });
});
