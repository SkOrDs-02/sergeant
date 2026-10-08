// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 * `PickedFoodCard` з власними порціями продукту: вибір одиниці, кількість
 * штук, еквівалент при перемиканні, памʼять останньої одиниці.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => false,
}));

import type { FoodPortion } from "../../lib/foodDb/foodDb";
import { PickedFoodCard } from "./PickedFoodCard";
import type { PickedFood } from "./FoodPickerSection";
import { rememberLastUnit } from "./portionUnits";
import type { MealFormState } from "./mealFormUtils";

const skibka = { id: "p1", name: "скибка", grams: 30 };
const baton = { id: "p2", name: "батон", grams: 400 };
const pachka = { id: "p3", name: "пачка", grams: 500 };

function food(portions: FoodPortion[]): PickedFood {
  return {
    id: "f1",
    name: "Хліб",
    brand: "",
    defaultGrams: 100,
    per100: { kcal: 250, protein_g: 8, fat_g: 3, carbs_g: 50 },
    portions,
  };
}

const grams = () => screen.getByTestId("grams").textContent;
const lastForm = { current: null as null | MealFormState };

function Harness({
  pickedFood,
  initialGrams = "100",
  skipInitialRescale = false,
}: {
  pickedFood: PickedFood;
  initialGrams?: string;
  skipInitialRescale?: boolean;
}) {
  const [pickedGrams, setPickedGrams] = useState(initialGrams);
  return (
    <>
      <span data-testid="grams">{pickedGrams}</span>
      <PickedFoodCard
        setForm={(update) => {
          const base: MealFormState = {
            name: "",
            mealType: "lunch",
            time: "12:00",
            kcal: "",
            protein_g: "",
            fat_g: "",
            carbs_g: "",
            err: "",
          };
          lastForm.current =
            typeof update === "function" ? update(base) : update;
        }}
        pickedFood={pickedFood}
        pickedGrams={pickedGrams}
        setPickedGrams={setPickedGrams}
        onChangeProduct={vi.fn()}
        skipInitialRescale={skipInitialRescale}
      />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  lastForm.current = null;
});
afterEach(() => vi.clearAllMocks());

describe("PickedFoodCard: власні порції", () => {
  it("продукт без порцій: вибору одиниці немає", () => {
    render(<Harness pickedFood={food([])} />);
    expect(screen.queryByRole("radiogroup", { name: "Одиниця" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Одиниця" })).toBeNull();
    expect(screen.getByLabelText("Грами")).toBeInTheDocument();
    expect(grams()).toBe("100");
  });

  it("за замовчуванням перша порція, кількість 1", () => {
    render(<Harness pickedFood={food([skibka, baton])} />);
    expect(grams()).toBe("30");
    expect(screen.getByRole("radio", { name: /скибка/ })).toBeChecked();
  });

  it("2 скибки дають 60 г і КБЖВ per100 × 0,6", () => {
    render(<Harness pickedFood={food([skibka, baton])} />);
    fireEvent.change(screen.getByLabelText("Кількість, скибка"), {
      target: { value: "2" },
    });
    expect(grams()).toBe("60");
    expect(lastForm.current?.kcal).toBe("150");
  });

  it("0,5 батона дає 200 г", () => {
    render(<Harness pickedFood={food([skibka, baton])} />);
    fireEvent.click(screen.getByRole("radio", { name: /батон/ }));
    fireEvent.change(screen.getByLabelText("Кількість, батон"), {
      target: { value: "0,5" },
    });
    expect(grams()).toBe("200");
  });

  it("перемикання одиниці не міняє вагу і показує еквівалент", () => {
    render(<Harness pickedFood={food([skibka, baton])} skipInitialRescale />);
    // Редагування відкривається в грамах.
    expect(screen.getByRole("radio", { name: "г" })).toBeChecked();
    expect(grams()).toBe("100");
    fireEvent.change(screen.getByLabelText("Грами"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /скибка/ }));
    expect(grams()).toBe("60");
    expect(screen.getByLabelText("Кількість, скибка")).toHaveValue("2");
  });

  it("3+ порції рендерять select", () => {
    render(<Harness pickedFood={food([skibka, baton, pachka])} />);
    const select = screen.getByRole("combobox", { name: "Одиниця" });
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "p3" } });
    expect(screen.getByLabelText("Кількість, пачка")).toBeInTheDocument();
  });

  it("памʼять останньої одиниці вибирає її за замовчуванням", () => {
    rememberLastUnit("f1", "p2");
    render(<Harness pickedFood={food([skibka, baton])} />);
    expect(screen.getByRole("radio", { name: /батон/ })).toBeChecked();
    expect(grams()).toBe("400");
  });

  it("збережена порція, якої вже немає, падає на «г»", () => {
    rememberLastUnit("f1", "p_gone");
    render(<Harness pickedFood={food([skibka, baton])} />);
    expect(screen.getByRole("radio", { name: "г" })).toBeChecked();
    expect(grams()).toBe("100");
  });
});
