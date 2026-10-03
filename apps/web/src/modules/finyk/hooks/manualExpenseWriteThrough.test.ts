import { describe, expect, it } from "vitest";
import { hasLocalManualExpense } from "./manualExpenseWriteThrough";

describe("hasLocalManualExpense", () => {
  it("returns false when manualExpenses is undefined", () => {
    expect(hasLocalManualExpense({ manualExpenses: undefined }, "x")).toBe(
      false,
    );
  });

  it("returns false when the id is not present", () => {
    expect(
      hasLocalManualExpense(
        { manualExpenses: [{ id: "a" }, { id: "b" }] },
        "c",
      ),
    ).toBe(false);
  });

  it("returns true when the id is already present", () => {
    expect(
      hasLocalManualExpense(
        { manualExpenses: [{ id: "a" }, { id: "b" }] },
        "b",
      ),
    ).toBe(true);
  });
});
