// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NutritionPantrySelector } from "./NutritionPantrySelector";

describe("NutritionPantrySelector", () => {
  it("shows item count and opens pantry manager", () => {
    const setPantryManagerOpen = vi.fn();
    const pantry = {
      pantries: [{ id: "p1", name: "Дім" }],
      activePantry: { id: "p1", name: "Дім" },
      activePantryId: "p1",
      pantryItems: [{ id: "i1" }],
      setActivePantryId: vi.fn(),
      setPantryManagerOpen,
    } as never;
    render(<NutritionPantrySelector pantry={pantry} />);
    expect(screen.getByText("1 продуктів збережено")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Керування коморами"));
    expect(setPantryManagerOpen).toHaveBeenCalledWith(true);
  });

  it("shows empty message when pantry has no items", () => {
    const pantry = {
      pantries: [{ id: "p1", name: "Дім" }],
      activePantry: { id: "p1", name: "Дім" },
      pantryItems: [],
      setActivePantryId: vi.fn(),
      setPantryManagerOpen: vi.fn(),
    } as never;
    render(<NutritionPantrySelector pantry={pantry} />);
    expect(screen.getByText("Комора порожня")).toBeInTheDocument();
  });

  it("shows select when multiple pantries exist", () => {
    const setActivePantryId = vi.fn();
    const pantry = {
      pantries: [
        { id: "p1", name: "Дім" },
        { id: "p2", name: "Офіс" },
      ],
      activePantry: { id: "p1", name: "Дім" },
      pantryItems: [],
      setActivePantryId,
      setPantryManagerOpen: vi.fn(),
    } as never;
    render(<NutritionPantrySelector pantry={pantry} />);
    fireEvent.change(screen.getByLabelText("Обрати комору"), {
      target: { value: "p2" },
    });
    expect(setActivePantryId).toHaveBeenCalledWith("p2");
  });
});
