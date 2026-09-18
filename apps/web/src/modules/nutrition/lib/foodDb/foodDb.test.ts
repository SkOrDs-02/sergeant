// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the IndexedDB-backed food catalogue + barcode lookup.
 * jsdom ships no IndexedDB, so we install a fresh `fake-indexeddb` factory
 * per test and exercise the public CRUD surface end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

vi.mock("./seedFoodsUk", () => ({
  SEED_FOODS_UK: [
    {
      name: "Молоко 2.5%",
      per100: { kcal: 52, protein_g: 2.8, fat_g: 2.5, carbs_g: 4.7 },
    },
    {
      name: "Яйце куряче",
      per100: { kcal: 157, protein_g: 12.7, fat_g: 11.5, carbs_g: 0.7 },
    },
  ],
}));

import {
  __resetSergeantDbForTests,
  openSergeantDb,
} from "../../../../shared/lib/idb/sergeantDb";
import {
  bindBarcodeToFood,
  ensureSeedFoods,
  listFoods,
  lookupFoodByBarcode,
  macrosForGrams,
  makeFoodProduct,
  replaceAllFoodsFromList,
  searchFoods,
  upsertFood,
} from "./foodDb";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  __resetSergeantDbForTests();
});

afterEach(() => {
  if (originalIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  }
  __resetSergeantDbForTests();
  vi.clearAllMocks();
});

describe("makeFoodProduct (pure)", () => {
  it("normalizes name/brand and builds a norm token", () => {
    const p = makeFoodProduct({ name: "  Молоко  ", brand: " Простоквашино " });
    expect(p.name).toBe("Молоко");
    expect(p.brand).toBe("Простоквашино");
    expect(p.norm).toBe("молоко простоквашино");
    expect(p.id).toMatch(/^food_/);
  });

  it("defaults defaultGrams to 100 and clamps macros >= 0", () => {
    const p = makeFoodProduct({
      name: "X",
      defaultGrams: -5,
      per100: { kcal: -10, protein_g: "bad", fat_g: 3, carbs_g: 1 },
    });
    expect(p.defaultGrams).toBe(100);
    expect(p.per100).toEqual({ kcal: 0, protein_g: 0, fat_g: 3, carbs_g: 1 });
  });

  it("keeps an explicit id", () => {
    expect(makeFoodProduct({ name: "X", id: "food_abc" }).id).toBe("food_abc");
  });

  it("tolerates non-object input", () => {
    const p = makeFoodProduct(null);
    expect(p.name).toBe("");
    expect(p.defaultGrams).toBe(100);
  });
});

describe("macrosForGrams (pure)", () => {
  it("scales per-100 macros by grams and rounds to 1 dp", () => {
    expect(
      macrosForGrams({ kcal: 100, protein_g: 10, fat_g: 5, carbs_g: 20 }, 50),
    ).toEqual({ kcal: 50, protein_g: 5, fat_g: 2.5, carbs_g: 10 });
  });

  it("treats negative grams as 0", () => {
    expect(
      macrosForGrams({ kcal: 100, protein_g: 10, fat_g: 5, carbs_g: 20 }, -3),
    ).toEqual({ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
  });
});

describe("upsertFood + listFoods", () => {
  it("rejects an empty name", async () => {
    const res = await upsertFood({ name: "   " });
    expect(res).toEqual({ ok: false, error: "Назва продукту порожня" });
  });

  it("stores and lists products newest-first", async () => {
    const r1 = await upsertFood({ name: "Перший" });
    expect(r1.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 2));
    await upsertFood({ name: "Другий" });
    const list = await listFoods();
    expect(list.map((x) => x.name)).toEqual(["Другий", "Перший"]);
  });

  it("respects the limit argument", async () => {
    await upsertFood({ name: "A" });
    await upsertFood({ name: "B" });
    const list = await listFoods(1);
    expect(list).toHaveLength(1);
  });

  it("falls back safely when IndexedDB transactions fail", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("transaction failed");
    });

    expect(await listFoods()).toEqual([]);
    expect(await upsertFood({ name: "Broken" })).toEqual({
      ok: false,
      error: "Не вдалося зберегти продукт",
    });
  });
});

describe("searchFoods", () => {
  it("returns [] for an empty query", async () => {
    expect(await searchFoods("")).toEqual([]);
  });

  it("matches by normalized token and ranks prefix first", async () => {
    await upsertFood({ name: "Сир твердий" });
    await upsertFood({ name: "Творог сир" });
    const hits = await searchFoods("сир");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    // prefix match ("Сир твердий" → norm starts with "сир") ranks first
    expect(hits[0]?.name).toBe("Сир твердий");
  });

  it("excludes products missing a token", async () => {
    await upsertFood({ name: "Молоко" });
    expect(await searchFoods("кефір")).toEqual([]);
  });
});

describe("barcode binding + lookup", () => {
  it("rejects an invalid barcode format", async () => {
    expect(await bindBarcodeToFood("abc", "food_1")).toBe(false);
    expect(await lookupFoodByBarcode("123")).toBeNull();
  });

  it("rejects missing args", async () => {
    expect(await bindBarcodeToFood("", "food_1")).toBe(false);
    expect(await bindBarcodeToFood("12345678", "")).toBe(false);
  });

  it("binds a barcode and looks the product back up", async () => {
    const res = await upsertFood({ name: "Шоколад" });
    expect(res.ok).toBe(true);
    const id = res.ok ? res.product.id : "";
    expect(await bindBarcodeToFood("4820000000001", id)).toBe(true);
    const found = await lookupFoodByBarcode("4820000000001");
    expect(found?.name).toBe("Шоколад");
  });

  it("returns null for an unbound but well-formed barcode", async () => {
    expect(await lookupFoodByBarcode("4820000000099")).toBeNull();
  });

  it("returns safe fallbacks when barcode transactions fail", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("transaction failed");
    });

    expect(await bindBarcodeToFood("4820000000001", "food_1")).toBe(false);
    expect(await lookupFoodByBarcode("4820000000001")).toBeNull();
  });
});

describe("replaceAllFoodsFromList", () => {
  it("clears existing products and writes the new list", async () => {
    await upsertFood({ name: "Old" });
    const ok = await replaceAllFoodsFromList([
      { name: "New A" },
      { name: "New B" },
      { name: "" }, // dropped (no name)
    ]);
    expect(ok).toBe(true);
    const list = await listFoods();
    expect(list.map((x) => x.name).sort()).toEqual(["New A", "New B"]);
  });

  it("handles non-array input as empty", async () => {
    expect(await replaceAllFoodsFromList(null)).toBe(true);
    expect(await listFoods()).toEqual([]);
  });

  it("returns false when replace transaction fails", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    vi.spyOn(db!, "transaction").mockImplementation(() => {
      throw new Error("transaction failed");
    });

    expect(await replaceAllFoodsFromList([{ name: "New" }])).toBe(false);
  });
});

describe("ensureSeedFoods", () => {
  it("seeds an empty DB from the (mocked) seed list", async () => {
    const ok = await ensureSeedFoods();
    expect(ok).toBe(true);
    const list = await listFoods();
    expect(list.map((x) => x.name).sort()).toEqual([
      "Молоко 2.5%",
      "Яйце куряче",
    ]);
  });

  it("merges only missing seeds into a non-empty DB", async () => {
    await upsertFood({ name: "Молоко 2.5%" });
    const ok = await ensureSeedFoods();
    expect(ok).toBe(true);
    const names = (await listFoods()).map((x) => x.name).sort();
    // existing "Молоко 2.5%" kept, only "Яйце куряче" added
    expect(names).toEqual(["Молоко 2.5%", "Яйце куряче"]);
  });
});
