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
        onPicked={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("selects a pantry item and seeds the form + search", () => {
    const setFromPantryItem = vi.fn();
    const setForm = vi.fn();
    const setFoodQuery = vi.fn();
    const onPicked = vi.fn();
    render(
      <FromPantryRow
        pantryItems={items}
        fromPantryItem={null}
        setFromPantryItem={setFromPantryItem}
        setForm={setForm}
        setFoodQuery={setFoodQuery}
        onPicked={onPicked}
        onCleared={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Молоко"));
    expect(setFromPantryItem).toHaveBeenCalledWith("Молоко");
    expect(setFoodQuery).toHaveBeenCalledWith("Молоко");
    expect(setForm).toHaveBeenCalled();
    // N1: без цього виклику пошук за назвою стартував, але його результат
    // нікуди не йшов — `pickedFood` лишався `null`, і прийом із комори
    // зберігався БЕЗ КБЖУ.
    // Другим аргументом іде вага фасування: у цієї позиції її немає, тож
    // автопідбір вільний підставити типову порцію каталогу.
    expect(onPicked).toHaveBeenCalledWith("Молоко", null);
  });

  it("не запускає автопідбір, коли позицію знімають — і гасить відкладений", () => {
    const onPicked = vi.fn();
    const onCleared = vi.fn();
    render(
      <FromPantryRow
        pantryItems={items}
        fromPantryItem="Молоко"
        setFromPantryItem={vi.fn()}
        setForm={vi.fn()}
        setFoodQuery={vi.fn()}
        onPicked={onPicked}
        onCleared={onCleared}
      />,
    );
    fireEvent.click(screen.getByText("Молоко"));
    expect(onPicked).not.toHaveBeenCalled();
    // Пошук, запущений попереднім тапом, міг ще не відповісти: без цього
    // він повернув би продукт, від якого людина щойно відмовилась.
    expect(onCleared).toHaveBeenCalled();
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
        onPicked={vi.fn()}
        onCleared={vi.fn()}
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
        onPicked={vi.fn()}
        onCleared={vi.fn()}
      />,
    );
    // Чіп показує родову назву; назви покупок у ряд «З комори» не течуть.
    expect(screen.queryByText(/Яготинське/)).toBeNull();
    fireEvent.click(screen.getByText("Молоко"));
    expect(setFoodQuery).toHaveBeenCalledWith("Молоко");
  });

  // Regression 2026-09-07: «пікер комори зник». Секція комори не може
  // стартувати згорнутою в AddMeal flow: це основний шлях логування з
  // наявних продуктів, а не допоміжна підказка.
  it("keeps the pantry chips visible immediately", () => {
    render(
      <FromPantryRow
        pantryItems={items}
        fromPantryItem={null}
        setFromPantryItem={vi.fn()}
        setForm={vi.fn()}
        setFoodQuery={vi.fn()}
        onPicked={vi.fn()}
        onCleared={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: /З комори/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const chip = screen.getAllByTestId("from-pantry-chip")[0]!;
    expect(chip.closest("[aria-hidden]")).toBeNull();
  });

  // 2026-09-11: замінило окремий рядок «З чека» — вага фасування з чека
  // Сільпо (`packGrams`) тепер підставляється прямо з чіпа комори.
  it("prefills the picked portion weight from the freshest source's packGrams", () => {
    const setPickedGrams = vi.fn();
    render(
      <FromPantryRow
        onPicked={vi.fn()}
        onCleared={vi.fn()}
        pantryItems={
          [
            {
              name: "Йогурт",
              qty: 660,
              unit: "г",
              sources: [
                {
                  name: "Йогурт Активіа полуниця",
                  qty: 330,
                  unit: "г",
                  addedAt: "2026-08-21",
                  packGrams: 330,
                },
                {
                  name: "Йогурт Активіа полуниця",
                  qty: 330,
                  unit: "г",
                  addedAt: "2026-09-05",
                  packGrams: 330,
                },
              ],
            },
          ] as never[]
        }
        fromPantryItem={null}
        setFromPantryItem={vi.fn()}
        setForm={vi.fn()}
        setFoodQuery={vi.fn()}
        setPickedGrams={setPickedGrams}
      />,
    );
    expect(screen.getByText("330 г")).toBeTruthy();
    fireEvent.click(screen.getByText("Йогурт"));
    expect(setPickedGrams).toHaveBeenCalledWith("330");
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
        onPicked={vi.fn()}
        onCleared={vi.fn()}
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
