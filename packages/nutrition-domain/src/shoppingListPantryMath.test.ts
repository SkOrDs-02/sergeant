import { describe, expect, it } from "vitest";
import {
  applyPantryToShoppingList,
  mergeLowStockIntoList,
  parseQuantity,
  LOW_STOCK_CALC_NOTE,
  LOW_STOCK_CATEGORY_NAME,
  type CalculatedShoppingList,
} from "./shoppingListPantryMath.js";
import type { ShoppingList } from "./shoppingList.js";

function item(
  id: string,
  name: string,
  quantity: string,
  overrides: Partial<{ note: string; checked: boolean }> = {},
) {
  return {
    id,
    name,
    quantity,
    note: overrides.note ?? "",
    checked: overrides.checked ?? false,
  };
}

function listOf(categories: ShoppingList["categories"]): ShoppingList {
  return { categories };
}

// Мінімальна заглушка `categorizeFood` для `mergeLowStockIntoList` — не
// тягне залежність на `foodCategories.ts` у більшості тестів, де категорія
// не важлива.
const noopCategorize = () => ({ id: "other" });

describe("parseQuantity", () => {
  it("parses grams", () => {
    expect(parseQuantity("700 г")).toEqual({ value: 700, unit: "г" });
  });

  it("parses fractional kilograms with a dot", () => {
    expect(parseQuantity("1.2 кг")).toEqual({ value: 1.2, unit: "кг" });
  });

  it("parses fractional kilograms with a comma", () => {
    expect(parseQuantity("1,2 кг")).toEqual({ value: 1.2, unit: "кг" });
  });

  it("parses count", () => {
    expect(parseQuantity("2 шт")).toEqual({ value: 2, unit: "шт" });
  });

  it("parses millilitres and litres", () => {
    expect(parseQuantity("500 мл")).toEqual({ value: 500, unit: "мл" });
    expect(parseQuantity("2 л")).toEqual({ value: 2, unit: "л" });
  });

  it("parses without a space between number and unit", () => {
    expect(parseQuantity("700г")).toEqual({ value: 700, unit: "г" });
  });

  it("returns null for a bare number without a unit", () => {
    expect(parseQuantity("3")).toBeNull();
  });

  it("returns null for an unrecognized unit", () => {
    expect(parseQuantity("2 пучки")).toBeNull();
  });

  it("returns null for empty/garbage input", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("щіпка")).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();
  });

  it("returns null for zero or negative quantities", () => {
    expect(parseQuantity("0 г")).toBeNull();
    expect(parseQuantity("-5 г")).toBeNull();
  });
});

describe("applyPantryToShoppingList", () => {
  it("(б) leaves a partial-coverage item with reduced quantity and a calcNote — same unit", () => {
    const list = listOf([
      { name: "Молочні продукти", items: [item("i1", "Молоко", "700 г")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "молоко", qty: 400, unit: "г" },
    ]);
    expect(result.athome).toHaveLength(0);
    expect(result.categories).toHaveLength(1);
    const out = result.categories[0]!.items[0]!;
    expect(out.quantity).toBe("300 г");
    expect(out.calcNote).toBe("700 г − 400 г у коморі");
    expect(out.calcSource).toBe("list");
  });

  it("(б) converts кг↔г when subtracting", () => {
    const list = listOf([
      { name: "Крупи", items: [item("i1", "Картопля", "1.2 кг")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "картопля", qty: 400, unit: "г" },
    ]);
    const out = result.categories[0]!.items[0]!;
    expect(out.quantity).toBe("0.8 кг");
    expect(out.calcNote).toBe("1.2 кг − 0.4 кг у коморі");
  });

  it("(б) converts л↔мл when subtracting", () => {
    const list = listOf([
      { name: "Напої", items: [item("i1", "Олія", "2 л")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "олія", qty: 500, unit: "мл" },
    ]);
    const out = result.categories[0]!.items[0]!;
    expect(out.quantity).toBe("1.5 л");
    expect(out.calcNote).toBe("2 л − 0.5 л у коморі");
  });

  it("(а) moves a fully-covered item to `athome` and keeps the original quantity", () => {
    const list = listOf([
      { name: "Молочні продукти", items: [item("i1", "Молоко", "700 г")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "молоко", qty: 900, unit: "г" },
    ]);
    expect(result.categories).toHaveLength(0);
    expect(result.athome).toHaveLength(1);
    const out = result.athome[0]!;
    expect(out.quantity).toBe("700 г");
    expect(out.categoryName).toBe("Молочні продукти");
  });

  it("(а) boundary — pantry has exactly the needed amount (inclusive)", () => {
    const list = listOf([
      { name: "Молочні продукти", items: [item("i1", "Молоко", "700 г")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "молоко", qty: 700, unit: "г" },
    ]);
    expect(result.categories).toHaveLength(0);
    expect(result.athome).toHaveLength(1);
  });

  it("(в) incomparable units — count in pantry vs mass in list, quantity unchanged with a review calcNote", () => {
    const list = listOf([
      { name: "Яйця", items: [item("i1", "Яйце", "500 г")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "яйце", qty: 6, unit: "шт" },
    ]);
    const out = result.categories[0]!.items[0]!;
    expect(out.quantity).toBe("500 г");
    expect(out.calcNote).toBe("в коморі є 6 шт — звір сам");
  });

  it("(в) unparseable list quantity — quantity unchanged, calcNote references pantry", () => {
    const list = listOf([
      { name: "Приправи", items: [item("i1", "Сіль", "щіпка")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "сіль", qty: 200, unit: "г" },
    ]);
    const out = result.categories[0]!.items[0]!;
    expect(out.quantity).toBe("щіпка");
    expect(out.calcNote).toBe("в коморі є 200 г — звір сам");
  });

  it("(г) no pantry match — item passes through unchanged, no calcNote", () => {
    const list = listOf([
      { name: "Овочі", items: [item("i1", "Огірок", "4 шт")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "молоко", qty: 900, unit: "г" },
    ]);
    const out = result.categories[0]!.items[0]!;
    expect(out.quantity).toBe("4 шт");
    expect(out.calcNote).toBe("");
    expect(result.athome).toHaveLength(0);
  });

  it("sums duplicate pantry entries with the same canonical key before comparing", () => {
    const list = listOf([
      { name: "Приправи", items: [item("i1", "Цукор", "1 кг")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "цукру", qty: 400, unit: "г" },
      { name: "цукор", qty: 300, unit: "г" },
    ]);
    const out = result.categories[0]!.items[0]!;
    // 400 + 300 = 700 г < 1 кг → ще 0.3 кг бракує (одиниця лишається одиницею позиції).
    expect(out.quantity).toBe("0.3 кг");
    expect(out.calcNote).toBe("1 кг − 0.7 кг у коморі");
  });

  it("matches names through alias normalization (огірки → огірок)", () => {
    const list = listOf([
      { name: "Овочі", items: [item("i1", "огірки", "4 шт")] },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "Огірок", qty: 10, unit: "шт" },
    ]);
    expect(result.categories).toHaveLength(0);
    expect(result.athome).toHaveLength(1);
  });

  it("drops a category entirely once every item in it moves to `athome`", () => {
    const list = listOf([
      {
        name: "Молочні продукти",
        items: [item("i1", "Молоко", "700 г"), item("i2", "Сир", "200 г")],
      },
    ]);
    const result = applyPantryToShoppingList(list, [
      { name: "молоко", qty: 900, unit: "г" },
      { name: "сир", qty: 500, unit: "г" },
    ]);
    expect(result.categories).toHaveLength(0);
    expect(result.athome).toHaveLength(2);
  });
});

describe("mergeLowStockIntoList", () => {
  function calc(): CalculatedShoppingList {
    return {
      categories: [
        {
          name: "Овочі",
          items: [] as CalculatedShoppingList["categories"][number]["items"],
        },
      ],
      athome: [],
    };
  }

  it("(г) appends a low-stock pantry item not already in the list", () => {
    const base = calc();
    const result = mergeLowStockIntoList(
      base,
      [{ name: "сіль", qty: 50, unit: "г" }],
      noopCategorize,
    );
    const added = result.categories
      .flatMap((c) => c.items)
      .find((i) => i.name === "сіль");
    expect(added).toBeDefined();
    expect(added?.calcNote).toBe(LOW_STOCK_CALC_NOTE);
    expect(added?.calcSource).toBe("pantry-low-stock");
    expect(added?.checked).toBe(false);
  });

  it("falls back to the dedicated category when nothing related exists in the list", () => {
    const base = calc();
    const result = mergeLowStockIntoList(
      base,
      [{ name: "сіль", qty: 50, unit: "г" }],
      noopCategorize,
    );
    const fallbackCat = result.categories.find(
      (c) => c.name === LOW_STOCK_CATEGORY_NAME,
    );
    expect(fallbackCat?.items.map((i) => i.name)).toEqual(["сіль"]);
  });

  it("reuses an existing related category when `categorize` matches it", () => {
    const base: CalculatedShoppingList = {
      categories: [
        {
          name: "Молочні продукти",
          items: [
            {
              id: "i1",
              name: "Молоко",
              quantity: "700 г",
              note: "",
              checked: false,
              calcNote: "",
              calcSource: "list",
            },
          ],
        },
      ],
      athome: [],
    };
    const dairyCategorize = (name: unknown) => {
      const n = String(name).toLowerCase();
      return {
        id: n.includes("молок") || n.includes("сир") ? "dairy" : "other",
      };
    };
    const result = mergeLowStockIntoList(
      base,
      [{ name: "сир", qty: 30, unit: "г" }],
      dairyCategorize,
    );
    const dairyCat = result.categories.find(
      (c) => c.name === "Молочні продукти",
    );
    expect(dairyCat?.items.map((i) => i.name)).toContain("сир");
    expect(
      result.categories.some((c) => c.name === LOW_STOCK_CATEGORY_NAME),
    ).toBe(false);
  });

  it("does not duplicate a pantry item already present in the calculated list", () => {
    const base: CalculatedShoppingList = {
      categories: [
        {
          name: "Приправи",
          items: [
            {
              id: "i1",
              name: "Сіль",
              quantity: "щіпка",
              note: "",
              checked: false,
              calcNote: "",
              calcSource: "list",
            },
          ],
        },
      ],
      athome: [],
    };
    const result = mergeLowStockIntoList(
      base,
      [{ name: "сіль", qty: 50, unit: "г" }],
      noopCategorize,
    );
    const allNames = result.categories.flatMap((c) =>
      c.items.map((i) => i.name),
    );
    expect(allNames.filter((n) => n.toLowerCase() === "сіль")).toHaveLength(1);
  });

  it("does not duplicate a pantry item already sitting in `athome`", () => {
    const base: CalculatedShoppingList = {
      categories: [],
      athome: [
        {
          id: "i1",
          name: "Молоко",
          quantity: "700 г",
          note: "",
          checked: false,
          calcNote: "",
          calcSource: "list",
          categoryName: "Молочні продукти",
        },
      ],
    };
    const result = mergeLowStockIntoList(
      base,
      [{ name: "молоко", qty: 50, unit: "г" }],
      noopCategorize,
    );
    expect(result.categories).toHaveLength(0);
  });

  it("does not add a pantry item that is not low-stock", () => {
    const base = calc();
    const result = mergeLowStockIntoList(
      base,
      [{ name: "сіль", qty: 900, unit: "г" }],
      noopCategorize,
    );
    expect(result.categories.flatMap((c) => c.items)).toHaveLength(0);
  });

  it("sums duplicate pantry entries before evaluating the low-stock threshold", () => {
    const base = calc();
    // Дві позиції по 60 г кожна — разом 120 г, вище порога 100 г → НЕ low-stock.
    const result = mergeLowStockIntoList(
      base,
      [
        { name: "консерва тунця", qty: 60, unit: "г" },
        { name: "консерва тунця", qty: 60, unit: "г" },
      ],
      noopCategorize,
    );
    expect(result.categories.flatMap((c) => c.items)).toHaveLength(0);
  });

  it("returns the input unchanged when there is nothing low-stock to merge", () => {
    const base = calc();
    const result = mergeLowStockIntoList(base, [], noopCategorize);
    expect(result).toBe(base);
  });

  it("ignores pantry items with unrecognized units for the low-stock check", () => {
    const base = calc();
    const result = mergeLowStockIntoList(
      base,
      [{ name: "паста", qty: 1, unit: "уп" }],
      noopCategorize,
    );
    expect(result.categories.flatMap((c) => c.items)).toHaveLength(0);
  });
});
