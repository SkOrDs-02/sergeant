import { describe, expect, it } from "vitest";
import {
  FOOD_CATEGORIES,
  categorizeFood,
  placeForFood,
} from "./foodCategories.js";
import {
  DEFAULT_PLACE_ID,
  STORAGE_PLACES,
  ensureStoragePlaces,
  makeDefaultPantry,
} from "./nutritionPantries.js";
import {
  buildPlacedItems,
  mergeItemsIntoPlaces,
  movePantryItem,
  planRedistribution,
  redistributePantries,
  resolvePlaceForItem,
} from "./pantryPlacement.js";
import type { Pantry } from "./nutritionTypes.js";

function pantry(id: string, names: string[]): Pantry {
  return {
    id,
    name: id,
    text: "",
    items: names.map((name) => ({
      name,
      qty: 1,
      unit: "шт",
      notes: null,
      sources: null,
    })),
  };
}

// Гейт 1 спеки: місце виводиться з назви на фіксованому наборі.
describe("placeForFood", () => {
  it.each([
    ["Пельмені домашні", "freezer"],
    ["Морозиво пломбір", "freezer"],
    ["Овочева суміш заморожена", "freezer"],
    ["Молоко 2.5%", "fridge"],
    ["Сир твердий", "fridge"],
    ["Гречка ядриця", "home"],
    ["Тушонка яловича", "home"],
  ])("'%s' → %s", (name, expected) => {
    expect(placeForFood(name)).toBe(expected);
  });

  it("невідоме падає в комору, а не в порожній id", () => {
    expect(placeForFood("щось геть невпізнаване")).toBe(DEFAULT_PLACE_ID);
    expect(placeForFood("")).toBe(DEFAULT_PLACE_ID);
  });

  it("кожне вгадане місце існує в наборі місць", () => {
    const ids = new Set(STORAGE_PLACES.map((p) => p.id));
    for (const cat of [...FOOD_CATEGORIES, categorizeFood("невпізнаване")]) {
      expect(ids.has(placeForFood(cat.label)), cat.id).toBe(true);
    }
  });
});

// Гейт 4 спеки: `frozen` зник без сліду.
describe("категорія frozen знята", () => {
  it("жоден шлях не повертає frozen", () => {
    expect(FOOD_CATEGORIES.map((c) => c.id)).not.toContain("frozen");
    for (const name of [
      "Овочі заморожені",
      "Морозиво",
      "Пельмені заморожені",
      "Креветки с/м",
    ]) {
      expect(categorizeFood(name).id, name).not.toBe("frozen");
    }
  });

  it("морозиво і пельмені мають категорії за суттю", () => {
    expect(categorizeFood("Морозиво пломбір").id).toBe("sweets_snacks");
    expect(categorizeFood("Пельмені заморожені").id).toBe("ready_meals");
    expect(categorizeFood("Овочева суміш заморожена").id).toBe("vegetables");
  });
});

describe("ensureStoragePlaces", () => {
  it("додає три місця й не рухає позиції", () => {
    const out = ensureStoragePlaces([
      {
        id: "home",
        name: "Дім",
        text: "",
        items: pantry("x", ["Гречка"]).items,
      },
    ]);
    expect(out.map((p) => p.id)).toEqual(["fridge", "freezer", "home"]);
    expect(out.find((p) => p.id === "home")?.name).toBe("Комора");
    expect(out.find((p) => p.id === "home")?.items).toHaveLength(1);
    expect(out.find((p) => p.id === "fridge")?.items).toEqual([]);
    expect(out.find((p) => p.id === "freezer")?.items).toEqual([]);
  });

  it("не перезаписує назву, яку дала людина", () => {
    const out = ensureStoragePlaces([
      { id: "home", name: "Погріб", text: "", items: [] },
    ]);
    expect(out.find((p) => p.id === "home")?.name).toBe("Погріб");
  });

  it("власні місця лишаються після відомих", () => {
    const out = ensureStoragePlaces([
      { id: "p_1", name: "Балкон", text: "", items: [] },
    ]);
    expect(out.map((p) => p.id)).toEqual(["fridge", "freezer", "home", "p_1"]);
  });

  it("дефолтна комора вже є місцем", () => {
    expect(makeDefaultPantry().id).toBe(DEFAULT_PLACE_ID);
  });
});

describe("buildPlacedItems", () => {
  it("зводить усі місця в один список з адресою кожної позиції", () => {
    const placed = buildPlacedItems([
      pantry("fridge", ["Молоко"]),
      pantry("home", ["Гречка", "Рис"]),
    ]);
    expect(placed.map((x) => [x.name, x.pantryId, x.localIdx])).toEqual([
      ["Молоко", "fridge", 0],
      ["Гречка", "home", 0],
      ["Рис", "home", 1],
    ]);
  });
});

// Гейт 2 спеки: ручна зміна сильніша за автовизначення.
describe("resolvePlaceForItem", () => {
  it("вгадує місце для нової позиції", () => {
    expect(resolvePlaceForItem([], "Молоко")).toBe("fridge");
  });

  it("повертає фактичне місце позиції, а не вгадане", () => {
    const placed = buildPlacedItems([pantry("p_1", ["Молоко"])]);
    expect(resolvePlaceForItem(placed, "молоко")).toBe("p_1");
  });
});

describe("mergeItemsIntoPlaces", () => {
  it("розкладає нові позиції по вгаданих місцях", () => {
    const base = ensureStoragePlaces([]);
    const out = mergeItemsIntoPlaces(
      base,
      [
        { name: "Молоко", qty: 1, unit: "л", notes: null, sources: null },
        { name: "Гречка", qty: 1, unit: "кг", notes: null, sources: null },
      ],
      placeForFood,
    );
    expect(out.find((p) => p.id === "fridge")?.items[0]?.name).toBe("Молоко");
    expect(out.find((p) => p.id === "home")?.items[0]?.name).toBe("Гречка");
  });

  it("позиції неіснуючого місця не губляться", () => {
    const out = mergeItemsIntoPlaces(
      ensureStoragePlaces([]),
      [{ name: "Балконне", qty: 1, unit: "шт", notes: null, sources: null }],
      () => "p_missing",
    );
    expect(out.find((p) => p.id === DEFAULT_PLACE_ID)?.items).toHaveLength(1);
  });
});

describe("movePantryItem", () => {
  it("переносить позицію в інше місце", () => {
    const before = [pantry("home", ["Пельмені"]), pantry("freezer", [])];
    const { pantries, moved } = movePantryItem(
      before,
      { pantryId: "home", localIdx: 0 },
      "freezer",
    );
    expect(moved?.name).toBe("Пельмені");
    expect(pantries.find((p) => p.id === "home")?.items).toEqual([]);
    expect(pantries.find((p) => p.id === "freezer")?.items[0]?.name).toBe(
      "Пельмені",
    );
  });

  it("перенос у те саме місце — no-op", () => {
    const before = [pantry("home", ["Гречка"])];
    expect(
      movePantryItem(before, { pantryId: "home", localIdx: 0 }, "home").moved,
    ).toBeNull();
  });

  it("неіснуюче місце не з'їдає позицію", () => {
    const before = [pantry("home", ["Гречка"])];
    const { pantries, moved } = movePantryItem(
      before,
      { pantryId: "home", localIdx: 0 },
      "nope",
    );
    expect(moved).toBeNull();
    expect(pantries.find((p) => p.id === "home")?.items).toHaveLength(1);
  });
});

// Гейт 5 спеки: нічого не переїжджає саме — лише за планом і дією.
describe("розкласти по місцях", () => {
  const before = ensureStoragePlaces([
    {
      id: "home",
      name: "Комора",
      text: "",
      items: pantry("_", ["Молоко", "Пельмені", "Гречка"]).items,
    },
  ]);

  it("план показує тільки те, що справді переїде", () => {
    expect(planRedistribution(before)).toEqual([
      { name: "Молоко", fromId: "home", toId: "fridge" },
      { name: "Пельмені", fromId: "home", toId: "freezer" },
    ]);
  });

  it("виконання робить рівно те, що показав план", () => {
    const after = redistributePantries(before);
    expect(
      after.find((p) => p.id === "fridge")?.items.map((i) => i.name),
    ).toEqual(["Молоко"]);
    expect(
      after.find((p) => p.id === "freezer")?.items.map((i) => i.name),
    ).toEqual(["Пельмені"]);
    expect(
      after.find((p) => p.id === "home")?.items.map((i) => i.name),
    ).toEqual(["Гречка"]);
    // Ідемпотентність: другий прогін уже нічого не пропонує.
    expect(planRedistribution(after)).toEqual([]);
  });

  it("ручне розміщення переїздом не чіпається без дії людини", () => {
    const manual = ensureStoragePlaces([
      {
        id: "p_1",
        name: "Балкон",
        text: "",
        items: pantry("_", ["Молоко"]).items,
      },
    ]);
    // План бачить розбіжність, але сам нічого не робить.
    expect(planRedistribution(manual)).toHaveLength(1);
    expect(
      manual.find((p) => p.id === "p_1")?.items.map((i) => i.name),
    ).toEqual(["Молоко"]);
  });
});
