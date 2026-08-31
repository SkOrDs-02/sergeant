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

  // Реальні позиції з чека Сільпо: `unit` там — фасування, не одиниця
  // виміру, і голе `{qty}{unit}` показувало «20,25л» замість «2 × 0,25 л»
  // (скарга founder-а, 2026-08-28).
  it("renders packaging units as a multiplier, not a glued number", () => {
    render(
      <FromPantryRow
        pantryItems={
          [
            { name: "Напій енергетичний Red Bull", qty: 2, unit: "0,25л" },
            { name: "Насіння Roni гарбуза", qty: 1, unit: "150г" },
          ] as never[]
        }
        fromPantryItem={null}
        setFromPantryItem={vi.fn()}
        setForm={vi.fn()}
        setFoodQuery={vi.fn()}
      />,
    );
    expect(screen.getByText("2 × 0,25 л")).toBeTruthy();
    // Одна пачка — множник зайвий шум.
    expect(screen.getByText("150 г")).toBeTruthy();
    expect(screen.queryByText("20,25л")).toBeNull();
  });

  // Рішення 8 спеки `pantry-generic-names.md`: у пошук іде РОДОВА назва
  // позиції, а не назва варіанта. Видача каталогу на «Молоко» завжди
  // непорожня, і це важливіше за точність жирності — «Молоко Яготинське
  // 2.6% 900г» у пошуку не знаходить нічого.
  it("seeds the generic item name, never a variant name", () => {
    const setFoodQuery = vi.fn();
    render(
      <FromPantryRow
        pantryItems={
          [
            {
              name: "Молоко",
              qty: 2000,
              unit: "мл",
              sources: [
                {
                  name: "Молоко Яготинське 2.6% 900г",
                  qty: 900,
                  unit: "мл",
                  addedAt: "2026-08-21",
                },
                {
                  name: "Молоко Галичина 1%",
                  qty: 1100,
                  unit: "мл",
                  addedAt: "2026-08-28",
                },
              ],
            },
          ] as never[]
        }
        fromPantryItem={null}
        setFromPantryItem={vi.fn()}
        setForm={vi.fn()}
        setFoodQuery={setFoodQuery}
      />,
    );
    // Чіп показує родову назву; назви покупок у ряд «З комори» не течуть.
    expect(screen.queryByText(/Яготинське/)).toBeNull();
    fireEvent.click(screen.getByText("Молоко"));
    expect(setFoodQuery).toHaveBeenCalledWith("Молоко");
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
    // Не `getByText`: активна позиція тепер видно ДВІЧІ — у чіпі й у
    // підзаголовку згорнутої секції, щоб прив'язка прийому до комори не
    // ховалась разом зі списком. Клікати треба саме по чіпу.
    const chip = screen
      .getAllByTestId("from-pantry-chip")
      .find((el) => el.textContent?.includes("Молоко"));
    fireEvent.click(chip!);
    expect(setFromPantryItem).toHaveBeenCalledWith(null);
  });
});
