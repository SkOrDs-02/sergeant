/**
 * Contract tests for `normalizeUPCitemdb`.
 *
 * Перевіряємо нормалізацію реальних raw-shape-ів від UPCitemdb trial API:
 * happy path, brand-less items, locale-нюанси у `title`, edge-cases (nullable
 * top-level data, порожній `items`, відсутній `title`, non-string поля,
 * trim-whitespace), і обовʼязкове виставлення `partial: true` + `null`-овані
 * макроси (UPCitemdb не повертає nutrition).
 */

import { describe, expect, it } from "vitest";
import { normalizeUPCitemdb, type UPCitemdbResponse } from "./upcitemdb.js";

describe("normalizeUPCitemdb — happy path", () => {
  it("повертає продукт з усіма полями для food item з brand-ом", () => {
    const raw: UPCitemdbResponse = {
      items: [
        {
          title: "Coca-Cola Classic 330ml",
          brand: "Coca-Cola",
        },
      ],
    };

    expect(normalizeUPCitemdb(raw)).toEqual({
      name: "Coca-Cola Classic 330ml",
      brand: "Coca-Cola",
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingSize: null,
      servingGrams: null,
      source: "upcitemdb",
      partial: true,
    });
  });

  it("обирає перший елемент коли в items їх кілька", () => {
    const raw: UPCitemdbResponse = {
      items: [
        { title: "First Item", brand: "Brand A" },
        { title: "Second Item", brand: "Brand B" },
        { title: "Third Item", brand: "Brand C" },
      ],
    };

    const result = normalizeUPCitemdb(raw);
    expect(result?.name).toBe("First Item");
    expect(result?.brand).toBe("Brand A");
  });

  it("brand=null коли brand порожній/відсутній (не падає)", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "Generic Product" }],
    };

    expect(normalizeUPCitemdb(raw)?.brand).toBeNull();
  });

  it("brand=null коли brand — порожній рядок", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "Generic Product", brand: "" }],
    };

    expect(normalizeUPCitemdb(raw)?.brand).toBeNull();
  });

  it("обрізає whitespace навколо title та brand", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "  Padded Name  ", brand: "  Padded Brand  " }],
    };

    const result = normalizeUPCitemdb(raw);
    expect(result?.name).toBe("Padded Name");
    expect(result?.brand).toBe("Padded Brand");
  });

  it("brand=null коли brand — суцільні пробіли", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "Real Name", brand: "   " }],
    };

    expect(normalizeUPCitemdb(raw)?.brand).toBeNull();
  });

  it("Unicode у title зберігається як є (Cyrillic)", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "Молоко 2.5% жирності 1л", brand: "Простоквашино" }],
    };

    const result = normalizeUPCitemdb(raw);
    expect(result?.name).toBe("Молоко 2.5% жирності 1л");
    expect(result?.brand).toBe("Простоквашино");
  });

  it("emoji та punctuation у title зберігаються", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "Snack-Mix 🍿 (Buttered) 80g", brand: "Brand-Name" }],
    };

    expect(normalizeUPCitemdb(raw)?.name).toBe("Snack-Mix 🍿 (Buttered) 80g");
  });
});

describe("normalizeUPCitemdb — null/empty branches", () => {
  it("повертає null для null data", () => {
    expect(normalizeUPCitemdb(null)).toBeNull();
  });

  it("повертає null для undefined data", () => {
    expect(normalizeUPCitemdb(undefined)).toBeNull();
  });

  it("повертає null коли items відсутні", () => {
    expect(normalizeUPCitemdb({})).toBeNull();
  });

  it("повертає null коли items — порожній масив", () => {
    expect(normalizeUPCitemdb({ items: [] })).toBeNull();
  });

  it("повертає null коли items — не масив", () => {
    // simulate quirky upstream returning object instead of array
    const raw = {
      items: { 0: { title: "Wrong shape" } },
    } as unknown as UPCitemdbResponse;
    expect(normalizeUPCitemdb(raw)).toBeNull();
  });

  it("повертає null коли items — string (захист від upstream-сюрпризів)", () => {
    const raw = { items: "not-an-array" } as unknown as UPCitemdbResponse;
    expect(normalizeUPCitemdb(raw)).toBeNull();
  });
});

describe("normalizeUPCitemdb — title validation", () => {
  it("повертає null коли title відсутній (no name)", () => {
    const raw: UPCitemdbResponse = {
      items: [{ brand: "Brand-Only-No-Title" }],
    };

    expect(normalizeUPCitemdb(raw)).toBeNull();
  });

  it("повертає null коли title — порожній рядок", () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "", brand: "Some Brand" }],
    };

    expect(normalizeUPCitemdb(raw)).toBeNull();
  });

  it('повертає null коли title — суцільні пробіли (бо trim → "")', () => {
    const raw: UPCitemdbResponse = {
      items: [{ title: "    ", brand: "Brand" }],
    };

    expect(normalizeUPCitemdb(raw)).toBeNull();
  });

  it("повертає null коли title — не string (number)", () => {
    const raw = {
      items: [{ title: 12345, brand: "Brand" }],
    } as unknown as UPCitemdbResponse;

    expect(normalizeUPCitemdb(raw)).toBeNull();
  });

  it("повертає null коли title — не string (null)", () => {
    const raw = {
      items: [{ title: null, brand: "Brand" }],
    } as unknown as UPCitemdbResponse;

    expect(normalizeUPCitemdb(raw)).toBeNull();
  });
});

describe("normalizeUPCitemdb — contract invariants", () => {
  it('source завжди "upcitemdb" і partial завжди true (literal types)', () => {
    const result = normalizeUPCitemdb({
      items: [{ title: "Anything" }],
    });

    expect(result?.source).toBe("upcitemdb");
    expect(result?.partial).toBe(true);
  });

  it("усі макро-поля та serving-поля завжди null (UPCitemdb не повертає nutrition)", () => {
    const result = normalizeUPCitemdb({
      items: [{ title: "Real Food", brand: "Brand" }],
    });

    expect(result?.kcal_100g).toBeNull();
    expect(result?.protein_100g).toBeNull();
    expect(result?.fat_100g).toBeNull();
    expect(result?.carbs_100g).toBeNull();
    expect(result?.servingSize).toBeNull();
    expect(result?.servingGrams).toBeNull();
  });

  it("навіть якщо upstream випадково повернув nutrition-поля — нормалізатор їх ігнорує", () => {
    // UPCitemdb не повертає nutrition, але якщо колись почне — наш контракт
    // залишається `partial: true` + null-овані макроси, бо клієнти на це
    // спираються (показують fill-prompt). Зміна семантики partial — це breaking
    // change у `NormalizedProduct.partial`, тож фіксуємо тестом.
    const raw = {
      items: [
        {
          title: "Food w/ stats",
          brand: "Brand",
          // hypothetical fields — нормалізатор не має знати про них
          calories: 250,
          protein: 12,
        },
      ],
    } as unknown as UPCitemdbResponse;

    const result = normalizeUPCitemdb(raw);
    expect(result?.kcal_100g).toBeNull();
    expect(result?.protein_100g).toBeNull();
    expect(result?.partial).toBe(true);
  });
});
