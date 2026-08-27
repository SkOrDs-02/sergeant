/**
 * Cross-source barcode contract tests.
 *
 * Закриває аудитну задачу PR-4.B: «contract tests for barcode handler against
 * OFF/USDA/UPCitemdb». На відміну від per-source unit-тестів у `off.test.ts`,
 * `usda.test.ts`, `upcitemdb.test.ts`, цей файл фіксує **спільний контракт**,
 * якого мають дотримуватись усі три нормалізатори, щоб handler `barcode.ts`
 * міг foldити їх в один `NormalizedProduct` без розгалуження по `source`.
 *
 * Контракт (всі поля mandatory у виводі, або null/undefined у точно
 * визначених позиціях):
 *
 * ```
 * { name: string                       // завжди non-empty
 * , brand: string | null               // null коли upstream не повернув brand
 * , kcal_100g: number | null           // null коли макрос відсутній
 * , protein_100g: number | null
 * , fat_100g: number | null
 * , carbs_100g: number | null
 * , servingSize: string | null         // null коли не parsing-ово серіалізується
 * , servingGrams: number | null        // null коли absent
 * , source: "off" | "usda" | "upcitemdb"
 * , partial?: boolean                  // лише UPCitemdb виставляє true
 * }
 * ```
 *
 * Realistic фікстури — взяті прямо з документації провайдерів (OFF v2,
 * USDA Branded Foods, UPCitemdb trial). Якщо хтось колись додасть 4-те
 * джерело — цей файл має для нього теж тримати fixture + assertion на
 * сумісність зі схемою.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeOFFBarcode,
  normalizeUPCitemdb,
  normalizeUSDABarcode,
  type OFFProduct,
  type UPCitemdbResponse,
  type USDAFood,
} from "./index.js";

// Спільний union вивід handler-а; усі три нормалізатори мають бути присвоюваними
// до цього типу (через TypeScript) і виставляти інваріанти, на які handler і
// фронтенд спираються (single name, nullable brand, null macros коли absent).
interface NormalizedProductContract {
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  servingSize: string | null;
  servingGrams: number | null;
  source: "off" | "usda" | "upcitemdb";
  partial?: boolean;
}

function assertContract(
  product: NormalizedProductContract | null,
): asserts product is NormalizedProductContract {
  if (!product) throw new Error("normalizer returned null in contract test");

  // name — завжди non-empty after normalizer.
  expect(typeof product.name).toBe("string");
  expect(product.name.length).toBeGreaterThan(0);

  // brand — string чи рівно null (не undefined, не "").
  if (product.brand !== null) {
    expect(typeof product.brand).toBe("string");
    expect(product.brand.length).toBeGreaterThan(0);
  }

  // Усі макроси: number чи рівно null.
  for (const key of [
    "kcal_100g",
    "protein_100g",
    "fat_100g",
    "carbs_100g",
  ] as const) {
    const v = product[key];
    if (v !== null) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }

  // serving — string|null та number|null.
  if (product.servingSize !== null) {
    expect(typeof product.servingSize).toBe("string");
  }
  if (product.servingGrams !== null) {
    expect(typeof product.servingGrams).toBe("number");
    expect(Number.isFinite(product.servingGrams)).toBe(true);
    expect(product.servingGrams).toBeGreaterThan(0);
  }

  // source — рівно один із трьох рядкових літералів.
  expect(["off", "usda", "upcitemdb"]).toContain(product.source);

  // partial — лише true/false/undefined; partial=true → усі макроси null
  // (інваріант на якому frontend будує fill-prompt).
  if (product.partial === true) {
    expect(product.kcal_100g).toBeNull();
    expect(product.protein_100g).toBeNull();
    expect(product.fat_100g).toBeNull();
    expect(product.carbs_100g).toBeNull();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Realistic upstream fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OFF v2 product page, як його повертає https://world.openfoodfacts.org/api/v2/product/3017620422003.json
 * (Nutella, реальний штрихкод). Поля скорочені до тих, що читає нормалізатор.
 */
const OFF_FIXTURE_NUTELLA: OFFProduct = {
  product_name: "Nutella",
  product_name_uk: "Нутелла",
  brands: "Ferrero,Nutella",
  serving_size: "15 g",
  serving_quantity: 15,
  nutriments: {
    "energy-kcal_100g": 539,
    proteins_100g: 6.3,
    fat_100g: 30.9,
    carbohydrates_100g: 57.5,
  },
};

/**
 * OFF продукт, де є тільки English name і немає Ukrainian локалі.
 */
const OFF_FIXTURE_EN_ONLY: OFFProduct = {
  product_name: "Plain Yogurt 4%",
  brands: "Generic",
  nutriments: {
    "energy-kcal_100g": 90,
    proteins_100g: 3.5,
    fat_100g: 4.0,
    carbohydrates_100g: 4.7,
  },
};

/**
 * USDA FDC Branded Foods response (https://api.nal.usda.gov/fdc/v1/foods/search?query=...
 * або /food/{fdcId}). Поля скорочені до тих, що читає нормалізатор.
 * Реальний приклад — Cheerios.
 */
const USDA_FIXTURE_CHEERIOS: USDAFood = {
  description: "CHEERIOS, TOASTED WHOLE GRAIN OAT CEREAL",
  brandOwner: "General Mills Sales Inc.",
  brandName: "Cheerios",
  servingSize: 28,
  servingSizeUnit: "g",
  gtinUpc: "016000275287",
  foodNutrients: [
    { nutrientId: 1008, value: 367 }, // kcal
    { nutrientId: 1003, value: 12.5 }, // protein
    { nutrientId: 1004, value: 6.25 }, // fat
    { nutrientId: 1005, value: 71.4 }, // carbs
  ],
};

/**
 * USDA-варіант, де nutrient.id-и приходять як вкладений `nutrient.id` обʼєкт
 * (старіша shape, USDA іноді робить це для легасі-feeds).
 */
const USDA_FIXTURE_NESTED_NUTRIENT_ID: USDAFood = {
  description: "Whole Milk, 3.25% milkfat",
  brandOwner: "Generic Dairy",
  servingSize: 240,
  servingSizeUnit: "ml",
  foodNutrients: [
    { nutrient: { id: 1008 }, amount: 61 },
    { nutrient: { id: 1003 }, amount: 3.15 },
    { nutrient: { id: 1004 }, amount: 3.27 },
    { nutrient: { id: 1005 }, amount: 4.78 },
  ],
};

/**
 * UPCitemdb trial response (https://api.upcitemdb.com/prod/trial/lookup?upc=).
 * Реальний приклад: Coca-Cola 2L.
 */
const UPCITEMDB_FIXTURE_COKE: UPCitemdbResponse = {
  items: [
    {
      title: "Coca-Cola Classic Cola Soda Soft Drink, 2 Liters",
      brand: "Coca-Cola",
    },
  ],
};

/**
 * UPCitemdb-продукт без brand (типово для дрібних виробників/private label).
 */
const UPCITEMDB_FIXTURE_NO_BRAND: UPCitemdbResponse = {
  items: [{ title: "Mystery Snack Bar 50g" }],
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-source contract assertions
// ─────────────────────────────────────────────────────────────────────────────

describe("OFF normalizer — contract", () => {
  it("Nutella fixture: повний продукт з UA-локаллю, brand splittinga і servings", () => {
    const product = normalizeOFFBarcode(OFF_FIXTURE_NUTELLA);
    assertContract(product);

    // Локально-залежне:
    expect(product.name).toBe("Нутелла"); // UA-локаль виграє
    expect(product.brand).toBe("Ferrero"); // лише перший із comma-separated
    expect(product.source).toBe("off");
    expect(product.kcal_100g).toBe(539);
    expect(product.protein_100g).toBe(6.3);
    expect(product.fat_100g).toBe(30.9);
    expect(product.carbs_100g).toBe(57.5);
    expect(product.servingSize).toBe("15 g");
    expect(product.servingGrams).toBe(15);
    expect("partial" in product).toBe(false); // OFF тип не має partial
  });

  it("OFF EN-only fixture: fallback на product_name", () => {
    const product = normalizeOFFBarcode(OFF_FIXTURE_EN_ONLY);
    assertContract(product);
    expect(product.name).toBe("Plain Yogurt 4%");
    expect(product.brand).toBe("Generic");
  });

  it("OFF без жодного макросу → null (handler має cascade-нути далі)", () => {
    const product = normalizeOFFBarcode({
      product_name: "Empty Product",
      nutriments: {},
    });
    expect(product).toBeNull();
  });
});

describe("USDA normalizer — contract", () => {
  it("Cheerios fixture: brandOwner виграє над brandName, serving-string зібраний", () => {
    const product = normalizeUSDABarcode(USDA_FIXTURE_CHEERIOS);
    assertContract(product);

    expect(product.name).toBe("CHEERIOS, TOASTED WHOLE GRAIN OAT CEREAL");
    expect(product.brand).toBe("General Mills Sales Inc.");
    expect(product.source).toBe("usda");
    expect(product.kcal_100g).toBe(367);
    expect(product.protein_100g).toBe(12.5);
    expect(product.fat_100g).toBe(6.3); // round 1 decimal
    expect(product.carbs_100g).toBe(71.4);
    expect(product.servingSize).toBe("28 g");
    expect(product.servingGrams).toBe(28);
    expect("partial" in product).toBe(false);
  });

  it("USDA nested nutrient.id legacy shape: ml-units serving + brandOwner-only", () => {
    const product = normalizeUSDABarcode(USDA_FIXTURE_NESTED_NUTRIENT_ID);
    assertContract(product);
    expect(product.name).toBe("Whole Milk, 3.25% milkfat");
    expect(product.brand).toBe("Generic Dairy");
    expect(product.kcal_100g).toBe(61);
    expect(product.servingSize).toBe("240 ml");
    expect(product.servingGrams).toBe(240);
  });

  it("USDA brandName fallback коли brandOwner відсутній", () => {
    const product = normalizeUSDABarcode({
      description: "Granola",
      brandName: "Bob's Red Mill",
      foodNutrients: [{ nutrientId: 1008, value: 450 }],
    });
    assertContract(product);
    expect(product.brand).toBe("Bob's Red Mill");
  });

  it("USDA продукт без description → null", () => {
    expect(
      normalizeUSDABarcode({
        foodNutrients: [{ nutrientId: 1008, value: 100 }],
      }),
    ).toBeNull();
  });
});

describe("UPCitemdb normalizer — contract", () => {
  it("Coca-Cola fixture: name+brand, partial=true, всі макроси null", () => {
    const product = normalizeUPCitemdb(UPCITEMDB_FIXTURE_COKE);
    assertContract(product);

    expect(product.name).toBe(
      "Coca-Cola Classic Cola Soda Soft Drink, 2 Liters",
    );
    expect(product.brand).toBe("Coca-Cola");
    expect(product.source).toBe("upcitemdb");
    expect(product.partial).toBe(true);
    // assertContract вже перевіряє partial→all-macros-null, але дублюємо явно.
    expect(product.kcal_100g).toBeNull();
    expect(product.servingSize).toBeNull();
    expect(product.servingGrams).toBeNull();
  });

  it("UPCitemdb без brand: brand=null, partial-інваріант зберігається", () => {
    const product = normalizeUPCitemdb(UPCITEMDB_FIXTURE_NO_BRAND);
    assertContract(product);
    expect(product.brand).toBeNull();
    expect(product.partial).toBe(true);
  });

  it("UPCitemdb empty items → null", () => {
    expect(normalizeUPCitemdb({ items: [] })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-source: handler сумісність
// ─────────────────────────────────────────────────────────────────────────────

describe("cross-source contract — handler folding", () => {
  it("усі три нормалізатори видають same-shape NormalizedProduct (handler може union-ити)", () => {
    const off = normalizeOFFBarcode(OFF_FIXTURE_NUTELLA);
    const usda = normalizeUSDABarcode(USDA_FIXTURE_CHEERIOS);
    const upc = normalizeUPCitemdb(UPCITEMDB_FIXTURE_COKE);

    // Усі три не-null.
    expect(off).not.toBeNull();
    expect(usda).not.toBeNull();
    expect(upc).not.toBeNull();

    // Спільні required-keys (handler читає їх без розгалуження):
    const requiredKeys: Array<keyof NormalizedProductContract> = [
      "name",
      "brand",
      "kcal_100g",
      "protein_100g",
      "fat_100g",
      "carbs_100g",
      "servingSize",
      "servingGrams",
      "source",
    ];
    for (const product of [off, usda, upc]) {
      for (const key of requiredKeys) {
        expect(product).toHaveProperty(key);
      }
    }
  });

  it("source-літерали взаємно виключні (handler не сплутає upstream-и)", () => {
    const off = normalizeOFFBarcode(OFF_FIXTURE_NUTELLA);
    const usda = normalizeUSDABarcode(USDA_FIXTURE_CHEERIOS);
    const upc = normalizeUPCitemdb(UPCITEMDB_FIXTURE_COKE);

    const sources = [off?.source, usda?.source, upc?.source];
    expect(new Set(sources).size).toBe(3);
    expect(sources).toEqual(["off", "usda", "upcitemdb"]);
  });

  it("partial=true тільки в UPCitemdb (handler-у це сигнал для fill-prompt)", () => {
    const off = normalizeOFFBarcode(OFF_FIXTURE_NUTELLA);
    const usda = normalizeUSDABarcode(USDA_FIXTURE_CHEERIOS);
    const upc = normalizeUPCitemdb(UPCITEMDB_FIXTURE_COKE);

    // OFF та USDA взагалі не мають partial у своєму типі — це гарантія
    // на рівні TypeScript: handler не побачить його. UPCitemdb його має, і
    // він обовʼязково true.
    expect(off).not.toBeNull();
    expect(usda).not.toBeNull();
    expect(upc?.partial).toBe(true);
    expect("partial" in (off as object)).toBe(false);
    expect("partial" in (usda as object)).toBe(false);
  });

  it("handler-cascade-симуляція: OFF-miss → USDA-miss → UPCitemdb-hit повертає partial:true product", () => {
    // Ця імітація відображає реальну логіку у `barcode.ts:354` cascade.
    const offResult = normalizeOFFBarcode({
      product_name: "Empty",
      nutriments: {},
    });
    const usdaResult = normalizeUSDABarcode({
      description: "Empty",
      foodNutrients: [],
    });
    const upcResult = normalizeUPCitemdb(UPCITEMDB_FIXTURE_COKE);

    const cascade = offResult ?? usdaResult ?? upcResult;
    expect(cascade).not.toBeNull();
    expect(cascade?.source).toBe("upcitemdb");
    // Лише UPCitemdb-результат має `partial`; OFF/USDA — ні (TS сам це
    // перевіряє у `partial=true` тесті вище).
    if (cascade?.source === "upcitemdb") {
      expect(cascade.partial).toBe(true);
    }
  });
});
