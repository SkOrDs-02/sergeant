import { describe, expect, it } from "vitest";
import {
  collectUncheckedShoppingItems,
  parseLeadingQuantity,
} from "./silpoCartItems";
import type { ShoppingList } from "@sergeant/nutrition-domain";

describe("parseLeadingQuantity", () => {
  it("parses a bare positive number", () => {
    expect(parseLeadingQuantity("2")).toBe(2);
    expect(parseLeadingQuantity("2.5")).toBe(2.5);
    expect(parseLeadingQuantity("2,5")).toBe(2.5);
  });

  it("does NOT parse a number with a unit — that's mass/volume, not cart quantity", () => {
    expect(parseLeadingQuantity("500 г")).toBeUndefined();
    expect(parseLeadingQuantity("2 шт")).toBeUndefined();
  });

  it("returns undefined for empty/non-numeric input", () => {
    expect(parseLeadingQuantity("")).toBeUndefined();
    expect(parseLeadingQuantity("трохи")).toBeUndefined();
    expect(parseLeadingQuantity("0")).toBeUndefined();
    expect(parseLeadingQuantity("-1")).toBeUndefined();
  });
});

describe("collectUncheckedShoppingItems", () => {
  it("returns [] for a null/empty list", () => {
    expect(collectUncheckedShoppingItems(null)).toEqual([]);
    expect(collectUncheckedShoppingItems({ categories: [] })).toEqual([]);
  });

  it("skips checked items and attaches a parsed bare-number quantity", () => {
    const list: ShoppingList = {
      categories: [
        {
          name: "Молочні продукти",
          items: [
            {
              id: "1",
              name: "Молоко",
              quantity: "2",
              note: "",
              checked: false,
            },
            { id: "2", name: "Сир", quantity: "", note: "", checked: true },
            {
              id: "3",
              name: "Йогурт",
              quantity: "500 г",
              note: "",
              checked: false,
            },
          ],
        },
      ],
    };

    expect(collectUncheckedShoppingItems(list)).toEqual([
      { name: "Молоко", quantity: 2 },
      { name: "Йогурт" },
    ]);
  });
});
