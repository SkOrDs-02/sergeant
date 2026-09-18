import { describe, expect, it } from "vitest";
import type { PlacedPantryItem } from "@sergeant/nutrition-domain";
import { resolvePlaceOfWithFilter } from "./resolvePlaceOfWithFilter";

function placed(overrides: Partial<PlacedPantryItem> = {}): PlacedPantryItem {
  return {
    name: "Молоко",
    qty: 1,
    unit: "л",
    notes: null,
    pantryId: "fridge",
    localIdx: 0,
    ...overrides,
  };
}

describe("resolvePlaceOfWithFilter", () => {
  it("no filter: falls back to the pure heuristic", () => {
    expect(resolvePlaceOfWithFilter([], "Молоко", null)).toBe("fridge");
  });

  it("filter set + brand-new item: filter wins over the heuristic", () => {
    // Евристика для «Молоко» — холодильник; фільтр має перебити.
    expect(resolvePlaceOfWithFilter([], "Молоко", "freezer")).toBe("freezer");
  });

  it("filter set + existing item elsewhere: the existing place wins", () => {
    const items = [placed({ pantryId: "fridge" })];
    expect(resolvePlaceOfWithFilter(items, "молоко", "freezer")).toBe("fridge");
  });

  it("filter set to the same place the item already lives in: no-op, same place", () => {
    const items = [placed({ pantryId: "freezer" })];
    expect(resolvePlaceOfWithFilter(items, "Молоко", "freezer")).toBe(
      "freezer",
    );
  });
});
