import { describe, expect, it } from "vitest";
import { isPantryItemLowStock } from "./pantryLowStock.js";

describe("isPantryItemLowStock", () => {
  it("flags a small gram quantity as low stock", () => {
    expect(isPantryItemLowStock({ qty: 50, unit: "г" })).toBe(true);
  });

  it("does not flag a comfortable gram quantity", () => {
    expect(isPantryItemLowStock({ qty: 500, unit: "г" })).toBe(false);
  });

  it("flags exactly-at-threshold quantities (inclusive)", () => {
    expect(isPantryItemLowStock({ qty: 100, unit: "г" })).toBe(true);
    expect(isPantryItemLowStock({ qty: 1, unit: "шт" })).toBe(true);
  });

  it("does not flag zero or negative quantities — that's a different signal (double-consume), not 'running low'", () => {
    expect(isPantryItemLowStock({ qty: 0, unit: "г" })).toBe(false);
    expect(isPantryItemLowStock({ qty: -5, unit: "г" })).toBe(false);
  });

  it("returns false when qty is null (unknown quantity, e.g. bare 'сіль')", () => {
    expect(isPantryItemLowStock({ qty: null, unit: null })).toBe(false);
  });

  it("returns false for units with no defined threshold (e.g. 'уп')", () => {
    expect(isPantryItemLowStock({ qty: 1, unit: "уп" })).toBe(false);
  });

  it("returns false when unit is null even with a small qty — no unit means no semantics to compare against", () => {
    expect(isPantryItemLowStock({ qty: 1, unit: null })).toBe(false);
  });
});
