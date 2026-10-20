// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/i18n/useLocale", () => ({
  useLocale: () => ({
    messages: {
      nutrition: {
        photoAddItem: {
          gramsLabel: "Грами",
          forWord: "на",
          addCta: "Додати позицію",
          otherProductCta: "Інший продукт",
          cancelCta: "Скасувати",
        },
        photoItems: { kcalUnit: "ккал", gramsUnit: "г" },
      },
    },
  }),
}));

vi.mock("./FoodPickerSection", () => ({
  FoodPickerSection: ({
    setPickedFood,
    setPickedGrams,
  }: {
    setPickedFood: (food: unknown) => void;
    setPickedGrams: (grams: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        setPickedFood({
          id: 42,
          name: "Вівсянка",
          per100: { kcal: 380, protein_g: 13, fat_g: 7, carbs_g: 68 },
        });
        setPickedGrams("150");
      }}
    >
      Обрати вівсянку
    </button>
  ),
}));

vi.mock("./useFoodSearch", () => ({
  useFoodSearch: () => ({
    foodHits: [],
    offHits: [],
    foodBusy: false,
    offBusy: false,
    foodErr: null,
    searchSettled: true,
  }),
}));

import { PhotoAddItemPicker } from "./PhotoAddItemPicker";

describe("PhotoAddItemPicker", () => {
  it("adds a selected catalog food with scaled macros and its product id", () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    render(<PhotoAddItemPicker onAdd={onAdd} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Обрати вівсянку" }));
    expect(screen.getByLabelText("Грами")).toHaveValue("150");
    expect(screen.getByText(/570 ккал на 150 г/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати позицію" }));

    expect(onAdd).toHaveBeenCalledWith({
      name: "Вівсянка",
      macros: { kcal: 570, protein_g: 19.5, fat_g: 10.5, carbs_g: 102 },
      gramsApprox: 150,
      confidence: 1,
      foodId: "42",
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("caps a portion at the supported maximum and allows switching products", () => {
    const onAdd = vi.fn();
    render(<PhotoAddItemPicker onAdd={onAdd} onCancel={() => {}} busy />);
    fireEvent.click(screen.getByRole("button", { name: "Обрати вівсянку" }));
    fireEvent.change(screen.getByLabelText("Грами"), {
      target: { value: "99999" },
    });
    expect(screen.getByText(/ккал на 10.?000 г/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Додати позицію" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Інший продукт" }));
    expect(
      screen.getByRole("button", { name: "Обрати вівсянку" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Грами")).not.toBeInTheDocument();
  });

  it("does not add while no food is selected and exposes the cancel path", () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    render(<PhotoAddItemPicker onAdd={onAdd} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
