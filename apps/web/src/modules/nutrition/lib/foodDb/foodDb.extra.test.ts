// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for foodDb.ts — targeting the uncovered
 * db=null paths, score=2 search ranking, and searchFoods multi-token edge cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

vi.mock("./seedFoodsUk", () => ({
  SEED_FOODS_UK: [
    {
      name: "Молоко 2.5%",
      per100: { kcal: 52, protein_g: 2.8, fat_g: 2.5, carbs_g: 4.7 },
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
  vi.restoreAllMocks();
});

describe("makeFoodProduct – extra branches", () => {
  it("uses an existing id with whitespace trimmed", () => {
    const p = makeFoodProduct({ name: "Test", id: "  food_trimmed  " });
    expect(p.id).toBe("food_trimmed");
  });

  it("generates a new id when id is an empty string", () => {
    const p = makeFoodProduct({ name: "Test", id: "" });
    expect(p.id).toMatch(/^food_/);
  });

  it("handles brand=null explicitly", () => {
    const p = makeFoodProduct({ name: "Test", brand: null });
    expect(p.brand).toBe("");
  });

  it("accepts a positive defaultGrams", () => {
    const p = makeFoodProduct({ name: "Test", defaultGrams: 200 });
    expect(p.defaultGrams).toBe(200);
  });

  it("normalises apostrophes in name/brand for norm", () => {
    const p = makeFoodProduct({ name: "м\u2019ясо", brand: "" });
    expect(p.norm).toBe("м'ясо");
  });

  it("collapses repeated whitespace in norm tokens", () => {
    const p = makeFoodProduct({
      name: "  Йогурт   грецький  ",
      brand: "  Ферма  ",
    });
    expect(p.norm).toBe("йогурт грецький ферма");
  });

  it("clamps non-finite macro values to zero", () => {
    const p = makeFoodProduct({
      name: "Test",
      per100: {
        kcal: Number.NaN,
        protein_g: Number.POSITIVE_INFINITY,
        fat_g: "3.5",
        carbs_g: -4,
      },
    });
    expect(p.per100).toEqual({
      kcal: 0,
      protein_g: 0,
      fat_g: 3.5,
      carbs_g: 0,
    });
  });

  it("defaults defaultGrams to 100 when zero is provided", () => {
    const p = makeFoodProduct({ name: "Test", defaultGrams: 0 });
    expect(p.defaultGrams).toBe(100);
  });
});

describe("searchFoods – scoring branches", () => {
  it("multi-word query matches products containing all tokens", async () => {
    await upsertFood({ name: "Йогурт грецький" });
    await upsertFood({ name: "Кефір" });
    const hits = await searchFoods("йогурт грецький");
    expect(hits.length).toBe(1);
    expect(hits[0]?.name).toBe("Йогурт грецький");
  });

  it("ranks partial mid-string matches after prefix matches (score=1)", async () => {
    await upsertFood({ name: "Хліб білий" });
    await upsertFood({ name: "Чорний хліб" });
    const hits = await searchFoods("хліб");
    // "Хліб білий" norm starts with "хліб" → score=0; "чорний хліб" → score=1
    expect(hits.length).toBe(2);
    expect(hits[0]?.name).toBe("Хліб білий");
  });

  it("respects the limit argument", async () => {
    await upsertFood({ name: "Горіх волоський" });
    await upsertFood({ name: "Горіх кедровий" });
    await upsertFood({ name: "Горіх арахіс" });
    const hits = await searchFoods("горіх", 2);
    expect(hits.length).toBe(2);
  });

  it("returns [] when no product matches any token", async () => {
    await upsertFood({ name: "Банан" });
    const hits = await searchFoods("апельсин мандарин");
    expect(hits).toEqual([]);
  });

  it("ranks token-scattered matches after substring matches (score=2)", async () => {
    await upsertFood({ name: "Яблуко зелене пиріг" });
    await upsertFood({ name: "Пиріг з яблуком" });
    const hits = await searchFoods("яблуко пиріг");
    // Both norms contain every token, but neither includes the contiguous
    // phrase "яблуко пиріг" → score=2 for both.
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.name).sort()).toEqual([
      "Пиріг з яблуком",
      "Яблуко зелене пиріг",
    ]);
  });
});

describe("upsertFood – validation branches", () => {
  it("rejects whitespace-only names without touching IndexedDB", async () => {
    const openSpy = vi.spyOn(globalThis.indexedDB as IDBFactory, "open");
    const result = await upsertFood({ name: "\t\n" });
    expect(result).toEqual({ ok: false, error: "Назва продукту порожня" });
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("db=null / openSergeantDb fails paths", () => {
  function mockNullDb() {
    vi.spyOn(globalThis.indexedDB as IDBFactory, "open").mockImplementation(
      () => {
        const req = Object.create(
          IDBOpenDBRequest.prototype,
        ) as IDBOpenDBRequest;
        setTimeout(() => {
          Object.defineProperty(req, "error", {
            value: new DOMException("blocked"),
          });
          req.onerror?.(new Event("error"));
        }, 0);
        return req;
      },
    );
  }

  it("listFoods returns [] when the DB cannot be opened", async () => {
    mockNullDb();
    const result = await listFoods();
    expect(result).toEqual([]);
  });

  it("upsertFood returns error when the DB cannot be opened", async () => {
    mockNullDb();
    const result = await upsertFood({ name: "NoDb" });
    expect(result).toMatchObject({ ok: false });
  });

  it("bindBarcodeToFood returns false when the DB cannot be opened", async () => {
    mockNullDb();
    expect(await bindBarcodeToFood("4820000000001", "food_x")).toBe(false);
  });

  it("lookupFoodByBarcode returns null when the DB cannot be opened", async () => {
    mockNullDb();
    expect(await lookupFoodByBarcode("4820000000001")).toBeNull();
  });

  it("replaceAllFoodsFromList returns false when DB fails", async () => {
    mockNullDb();
    expect(await replaceAllFoodsFromList([{ name: "X" }])).toBe(false);
  });

  it("ensureSeedFoods returns false when DB fails", async () => {
    mockNullDb();
    expect(await ensureSeedFoods()).toBe(false);
  });
});

const LEGACY_DB_NAME = "hub_nutrition_food_db";

async function seedLegacyFoodDb(
  products: Array<{
    id: string;
    name: string;
    brand?: string;
    norm?: string;
    defaultGrams?: number;
    per100?: {
      kcal: number;
      protein_g: number;
      fat_g: number;
      carbs_g: number;
    };
    updatedAt?: number;
  }>,
  barcodes: Record<string, string> = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("products", { keyPath: "id" });
      db.createObjectStore("barcodes");
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["products", "barcodes"], "readwrite");
      const productStore = tx.objectStore("products");
      for (const product of products) {
        productStore.put({
          brand: "",
          norm: product.name.toLowerCase(),
          defaultGrams: 100,
          per100: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
          updatedAt: Date.now(),
          ...product,
        });
      }
      const barcodeStore = tx.objectStore("barcodes");
      for (const [barcode, foodId] of Object.entries(barcodes)) {
        barcodeStore.put(foodId, barcode);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe("legacy hub_nutrition_food_db migration", () => {
  it("copies legacy products into sergeant-db on first read", async () => {
    await seedLegacyFoodDb([
      {
        id: "food_legacy_1",
        name: "Каша гречана",
        norm: "каша гречана",
        updatedAt: 1_700_000_000_000,
      },
    ]);

    const list = await listFoods();
    expect(list.map((x) => x.name)).toContain("Каша гречана");

    const legacyStillOpen = await indexedDB.databases();
    expect(legacyStillOpen.map((d) => d.name)).not.toContain(LEGACY_DB_NAME);
  });

  it("copies legacy barcodes and resolves products after migration", async () => {
    await seedLegacyFoodDb(
      [
        {
          id: "food_legacy_bc",
          name: "Сир твердий",
          norm: "сир твердий",
        },
      ],
      { "4820111122222": "food_legacy_bc" },
    );

    const found = await lookupFoodByBarcode("4820111122222");
    expect(found?.name).toBe("Сир твердий");
  });

  it("migrates legacy DB that only has a barcodes store", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(LEGACY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("barcodes");
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("barcodes", "readwrite");
        tx.objectStore("barcodes").put("food_orphan", "4820999888777");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    await upsertFood({ name: "Мігрований", id: "food_orphan" });
    expect(await lookupFoodByBarcode("4820999888777")).toMatchObject({
      name: "Мігрований",
    });
  });
});

describe("lookupFoodByBarcode – empty id branch", () => {
  it("returns null when barcode is bound to an empty food id", async () => {
    const db = await openSergeantDb();
    expect(db).not.toBeNull();
    // Manually write an empty id to the barcodes store to trigger the
    // `if (!id) return null` branch.
    await new Promise<void>((resolve) => {
      const tx = db!.transaction("nutrition_barcodes", "readwrite");
      tx.objectStore("nutrition_barcodes").put("", "4820000000999");
      tx.oncomplete = () => resolve();
    });
    expect(await lookupFoodByBarcode("4820000000999")).toBeNull();
  });
});
