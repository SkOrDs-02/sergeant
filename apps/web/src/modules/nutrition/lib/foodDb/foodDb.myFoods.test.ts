// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 * `origin`, `portions`, `listUserFoods` і `deleteFood` на справжньому
 * (fake-indexeddb) сховищі.
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
  deleteFood,
  ensureSeedFoods,
  getFoodById,
  listUserFoods,
  lookupFoodByBarcode,
  makeFoodProduct,
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
});

/** Кладе запис у стор напряму, як це робила версія до менеджера. */
async function putRaw(record: Record<string, unknown>) {
  const db = await openSergeantDb();
  if (!db) throw new Error("no db");
  const tx = db.transaction("nutrition_foods", "readwrite");
  tx.objectStore("nutrition_foods").put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe("origin і portions у makeFoodProduct", () => {
  it("власний продукт: origin user, portions порожні", () => {
    const p = makeFoodProduct({ name: "Хліб" });
    expect(p.origin).toBe("user");
    expect(p.portions).toEqual([]);
  });

  it("сіди ensureSeedFoods мають origin seed і не потрапляють у список власних", async () => {
    await ensureSeedFoods();
    await upsertFood({ name: "Мій хліб", per100: { kcal: 250 } });
    const own = await listUserFoods();
    expect(own.map((f) => f.name)).toEqual(["Мій хліб"]);
    expect(own[0]?.origin).toBe("user");
  });
});

describe("лінива класифікація origin", () => {
  it("запис без origin: norm вбудованого - seed, довільна назва - user", async () => {
    const base = {
      brand: "",
      defaultGrams: 100,
      per100: { kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0 },
      updatedAt: 1,
    };
    await putRaw({
      ...base,
      id: "food_a",
      name: "Молоко 2.5%",
      norm: "молоко 2.5%",
    });
    await putRaw({ ...base, id: "food_b", name: "Мій сир", norm: "мій сир" });
    const own = await listUserFoods();
    expect(own.map((f) => f.id)).toEqual(["food_b"]);
  });
});

describe("portions у сховищі", () => {
  it("продукт зі старого формату читається з portions []", async () => {
    await putRaw({
      id: "food_old",
      name: "Старий",
      brand: "",
      norm: "старий",
      defaultGrams: 100,
      per100: { kcal: 10, protein_g: 0, fat_g: 0, carbs_g: 0 },
      updatedAt: 1,
    });
    expect((await getFoodById("food_old"))?.portions).toEqual([]);
  });

  it("елемент з порожньою назвою відкидається при читанні", async () => {
    await putRaw({
      id: "food_bad",
      name: "Кривий",
      brand: "",
      norm: "кривий",
      defaultGrams: 100,
      per100: { kcal: 10, protein_g: 0, fat_g: 0, carbs_g: 0 },
      portions: [
        { id: "p1", name: "", grams: 30 },
        { id: "p2", name: "ок", grams: 20 },
      ],
      updatedAt: 1,
    });
    expect((await getFoodById("food_bad"))?.portions).toEqual([
      { id: "p2", name: "ок", grams: 20 },
    ]);
  });

  it("три порції зберігаються і читаються в тому ж порядку", async () => {
    const portions = [
      { id: "p1", name: "скибка", grams: 30 },
      { id: "p2", name: "батон", grams: 400 },
      { id: "p3", name: "пачка", grams: 500 },
    ];
    const saved = await upsertFood({ name: "Хліб", portions });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect((await getFoodById(saved.product.id))?.portions).toEqual(portions);
  });
});

describe("deleteFood", () => {
  it("прибирає продукт і його штрихкод", async () => {
    const saved = await upsertFood({ name: "Хліб" });
    if (!saved.ok) throw new Error("save failed");
    const other = await upsertFood({ name: "Сир" });
    if (!other.ok) throw new Error("save failed");
    await bindBarcodeToFood("4820000000011", saved.product.id);
    await bindBarcodeToFood("4820000000028", other.product.id);

    expect(await deleteFood(saved.product.id)).toBe(true);

    expect(await getFoodById(saved.product.id)).toBeNull();
    expect(await lookupFoodByBarcode("4820000000011")).toBeNull();
    expect((await lookupFoodByBarcode("4820000000028"))?.id).toBe(
      other.product.id,
    );
  });
});
