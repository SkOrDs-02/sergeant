// @vitest-environment jsdom
/**
 * Last validated: 2026-09-02
 * Status: Active
 *
 * Гейт 3 спеки: видно все. Фільтр звужує список і знімається; активної
 * комори немає, тож і перемикача «активна/неактивна» бути не може.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NutritionPantrySelector } from "./NutritionPantrySelector";

function makePantry(overrides: Record<string, unknown> = {}) {
  return {
    pantries: [
      { id: "fridge", name: "Холодильник" },
      { id: "freezer", name: "Морозилка" },
      { id: "home", name: "Комора" },
    ],
    pantryItems: [
      { name: "Молоко", pantryId: "fridge", localIdx: 0 },
      { name: "Пельмені", pantryId: "freezer", localIdx: 0 },
      { name: "Гречка", pantryId: "home", localIdx: 0 },
    ],
    placeFilter: null,
    setPlaceFilter: vi.fn(),
    setPantryManagerOpen: vi.fn(),
    ...overrides,
  } as never;
}

describe("NutritionPantrySelector — фільтр місць", () => {
  it("пропонує кожне місце і дефолтне «Усі місця»", () => {
    render(<NutritionPantrySelector pantry={makePantry()} />);
    expect(screen.getByLabelText("Місце зберігання")).toHaveValue("");
    for (const label of ["Усі місця", "Холодильник", "Морозилка", "Комора"]) {
      expect(screen.getByRole("option", { name: label })).toBeTruthy();
    }
  });

  // Числа в підписах читались як кількість МІСЦЬ, хоча означали продукти
  // (звіт власника 2026-09-02). Лічильник живе в заголовку картки списку.
  it("не пише чисел у підписах місць", () => {
    render(<NutritionPantrySelector pantry={makePantry()} />);
    for (const opt of screen.getAllByRole("option")) {
      expect(opt.textContent ?? "").not.toMatch(/\d/);
    }
  });

  it("звужує по місцю і знімає фільтр назад на «Усі місця»", () => {
    const setPlaceFilter = vi.fn();
    const { rerender } = render(
      <NutritionPantrySelector pantry={makePantry({ setPlaceFilter })} />,
    );

    fireEvent.change(screen.getByLabelText("Місце зберігання"), {
      target: { value: "freezer" },
    });
    expect(setPlaceFilter).toHaveBeenCalledWith("freezer");

    rerender(
      <NutritionPantrySelector
        pantry={makePantry({ setPlaceFilter, placeFilter: "freezer" })}
      />,
    );
    expect(screen.getByLabelText("Місце зберігання")).toHaveValue("freezer");

    fireEvent.change(screen.getByLabelText("Місце зберігання"), {
      target: { value: "" },
    });
    expect(setPlaceFilter).toHaveBeenLastCalledWith(null);
  });

  it("відкриває керування місцями", () => {
    const setPantryManagerOpen = vi.fn();
    render(
      <NutritionPantrySelector pantry={makePantry({ setPantryManagerOpen })} />,
    );
    fireEvent.click(screen.getByLabelText("Керування місцями зберігання"));
    expect(setPantryManagerOpen).toHaveBeenCalledWith(true);
  });
});
