// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for active-pantry selector row.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NutritionPantrySelector } from "./NutritionPantrySelector";

function makePantry(overrides: Record<string, unknown> = {}) {
  return {
    pantries: [
      { id: "p1", name: "Дім" },
      { id: "p2", name: "Офіс" },
    ],
    activePantry: { id: "p1", name: "Дім" },
    activePantryId: "p1",
    pantryItems: [{ id: "i1" }, { id: "i2" }],
    setActivePantryId: vi.fn(),
    setPantryManagerOpen: vi.fn(),
    ...overrides,
  };
}

describe("NutritionPantrySelector", () => {
  it("shows active pantry name and item count", () => {
    render(<NutritionPantrySelector pantry={makePantry() as never} />);
    expect(screen.getAllByText("Дім").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 продуктів збережено")).toBeInTheDocument();
  });

  it("shows empty copy when the pantry has no items", () => {
    render(
      <NutritionPantrySelector
        pantry={makePantry({ pantryItems: [] }) as never}
      />,
    );
    expect(screen.getByText("Склад порожній")).toBeInTheDocument();
  });

  it("switches active pantry and opens the manager sheet", () => {
    const pantry = makePantry();
    render(<NutritionPantrySelector pantry={pantry as never} />);

    fireEvent.change(screen.getByLabelText("Обрати склад"), {
      target: { value: "p2" },
    });
    expect(pantry.setActivePantryId).toHaveBeenCalledWith("p2");

    fireEvent.click(screen.getByLabelText("Керування складами"));
    expect(pantry.setPantryManagerOpen).toHaveBeenCalledWith(true);
  });

  it("hides the pantry select when only one pantry exists", () => {
    render(
      <NutritionPantrySelector
        pantry={
          makePantry({
            pantries: [{ id: "p1", name: "Дім" }],
          }) as never
        }
      />,
    );
    expect(screen.queryByLabelText("Обрати склад")).not.toBeInTheDocument();
  });
});
