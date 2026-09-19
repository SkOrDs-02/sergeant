// @vitest-environment jsdom
/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Аркуш одного прийому дня — те, що відкриває тап по сегменту hero.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meal } from "@sergeant/nutrition-domain";
import { MealTypeSheet } from "./MealTypeSheet";

vi.mock("../lib/mealPhotoStorage", () => ({
  getMealThumbnailBlob: () => Promise.resolve(null),
}));

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    name: "Курка з рисом",
    mealType: "dinner",
    time: "19:30",
    macros: { kcal: 520, protein_g: 40, fat_g: 12, carbs_g: 55 },
    ...overrides,
  } as Meal;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MealTypeSheet", () => {
  it("нічого не рендерить, поки тип прийому не обрано", () => {
    const { container } = render(
      <MealTypeSheet
        mealType={null}
        meals={[]}
        date="2026-09-15"
        onClose={vi.fn()}
        onEditMeal={vi.fn()}
        onRemoveMeal={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("показує записи прийому та їхній підсумок у шапці", () => {
    render(
      <MealTypeSheet
        mealType="dinner"
        meals={[
          meal(),
          meal({
            id: "m2",
            name: "Салат",
            macros: { kcal: 120, protein_g: 3, fat_g: 9, carbs_g: 6 },
          }),
        ]}
        date="2026-09-15"
        onClose={vi.fn()}
        onEditMeal={vi.fn()}
        onRemoveMeal={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Вечеря")).toBeInTheDocument();
    expect(screen.getByText("Курка з рисом")).toBeInTheDocument();
    expect(screen.getByText("Салат")).toBeInTheDocument();
    // Підсумок саме ЦЬОГО прийому (520 + 120), не всього дня.
    expect(screen.getByText(/2\s*записи/)).toBeInTheDocument();
    expect(screen.getByText(/640/)).toBeInTheDocument();
  });

  // Рішення власника 2026-09-15: вхід «щось нове» в модулі один — FAB.
  // Друга кнопка «Додати» тут була б дублем, і саме тому аркуш її не має.
  it("не має власної кнопки додавання прийому", () => {
    render(
      <MealTypeSheet
        mealType="dinner"
        meals={[meal()]}
        date="2026-09-15"
        onClose={vi.fn()}
        onEditMeal={vi.fn()}
        onRemoveMeal={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Додати/)).not.toBeInTheDocument();
  });

  it("веде тап по рядку в редагування цього запису", () => {
    const onEditMeal = vi.fn();
    const m = meal();
    render(
      <MealTypeSheet
        mealType="dinner"
        meals={[m]}
        date="2026-09-15"
        onClose={vi.fn()}
        onEditMeal={onEditMeal}
        onRemoveMeal={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Редагувати запис"));
    expect(onEditMeal).toHaveBeenCalledWith("2026-09-15", m);
  });

  it("віддає видалення запису господарю аркуша", () => {
    const onRemoveMeal = vi.fn();
    const m = meal();
    render(
      <MealTypeSheet
        mealType="dinner"
        meals={[m]}
        date="2026-09-15"
        onClose={vi.fn()}
        onEditMeal={vi.fn()}
        onRemoveMeal={onRemoveMeal}
      />,
    );
    fireEvent.click(screen.getByLabelText("Видалити запис"));
    expect(onRemoveMeal).toHaveBeenCalledWith("2026-09-15", m);
  });
});
