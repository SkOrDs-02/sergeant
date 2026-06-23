// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `FromPantryRow`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FromPantryRow } from "./FromPantryRow";

const items = [
  { name: "Молоко", qty: 1, unit: "л" },
  { name: "Яйця", qty: 10, unit: "шт" },
] as never[];

describe("FromPantryRow", () => {
  it("renders nothing when there are no pantry items", () => {
    const { container } = render(
      <FromPantryRow
        pantryItems={[]}
        fromPantryItem={null}
        setFromPantryItem={vi.fn()}
        setForm={vi.fn()}
        setFoodQuery={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("selects a pantry item and seeds the form + search", () => {
    const setFromPantryItem = vi.fn();
    const setForm = vi.fn();
    const setFoodQuery = vi.fn();
    render(
      <FromPantryRow
        pantryItems={items}
        fromPantryItem={null}
        setFromPantryItem={setFromPantryItem}
        setForm={setForm}
        setFoodQuery={setFoodQuery}
      />,
    );
    fireEvent.click(screen.getByText("Молоко"));
    expect(setFromPantryItem).toHaveBeenCalledWith("Молоко");
    expect(setFoodQuery).toHaveBeenCalledWith("Молоко");
    expect(setForm).toHaveBeenCalled();
  });

  it("deselects the active item on a second tap", () => {
    const setFromPantryItem = vi.fn();
    render(
      <FromPantryRow
        pantryItems={items}
        fromPantryItem="Молоко"
        setFromPantryItem={setFromPantryItem}
        setForm={vi.fn()}
        setFoodQuery={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Молоко"));
    expect(setFromPantryItem).toHaveBeenCalledWith(null);
  });
});
