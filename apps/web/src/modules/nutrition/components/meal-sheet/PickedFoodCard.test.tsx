// @vitest-environment jsdom
/**
 * Last validated: 2026-08-22
 * Status: Active
 * Unit tests for `PickedFoodCard` — вага порції і живий перерахунок КБЖВ
 * на кроці «fill».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./MacroChip", () => ({
  MacroChip: ({ label, value }: { label: string; value: number | null }) => (
    <div data-testid="macro-chip">
      {label}:{value ?? "—"}
    </div>
  ),
}));

import { PickedFoodCard } from "./PickedFoodCard";
import type { PickedFood } from "./FoodPickerSection";
import type { MealFormState } from "./mealFormUtils";

function form(overrides: Partial<MealFormState> = {}): MealFormState {
  return {
    name: "",
    mealType: "lunch",
    time: "12:00",
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    err: "",
    ...overrides,
  };
}

type CardProps = ComponentProps<typeof PickedFoodCard>;

const picked: PickedFood = {
  id: "f1",
  name: "Курка",
  brand: "Наша Ряба",
  defaultGrams: 100,
  per100: { kcal: 110, protein_g: 23, fat_g: 2, carbs_g: 0 },
};

function baseProps(overrides: Partial<CardProps> = {}): CardProps {
  return {
    form: form(),
    setForm: vi.fn(),
    pickedFood: picked,
    pickedGrams: "100",
    setPickedGrams: vi.fn(),
    onChangeProduct: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("PickedFoodCard", () => {
  it("renders the picked-food card with per-100 macros", () => {
    render(<PickedFoodCard {...baseProps({ form: form({ kcal: "110" }) })} />);
    expect(screen.getByText(/Курка · Наша Ряба/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 100 г/)).toBeInTheDocument();
    expect(screen.getAllByTestId("macro-chip").length).toBe(4);
  });

  it("recalculates form macros from picked food and comma grams", () => {
    const setForm = vi.fn();
    render(
      <PickedFoodCard
        {...baseProps({
          pickedFood: {
            ...picked,
            per100: { kcal: 120, protein_g: 20, fat_g: 5, carbs_g: 10 },
          },
          pickedGrams: "50,5",
          setForm,
        })}
      />,
    );

    const updater = setForm.mock.calls[0]?.[0] as (
      state: MealFormState,
    ) => MealFormState;
    expect(updater(form({ name: "Стара назва" }))).toMatchObject({
      name: "Курка Наша Ряба",
      kcal: "61",
      protein_g: "10",
      fat_g: "3",
      carbs_g: "5",
      err: "",
    });
  });

  it("renders the OFF badge for a picked Open Food Facts product", () => {
    render(
      <PickedFoodCard
        {...baseProps({ pickedFood: { ...picked, source: "off" } })}
      />,
    );
    // Позначка «Open Food Facts» — тепер `<Icon title="…">`, а не emoji.
    expect(screen.getByTitle("Open Food Facts")).toBeInTheDocument();
  });

  it("increments and decrements the gram portion", () => {
    const setPickedGrams = vi.fn();
    render(<PickedFoodCard {...baseProps({ setPickedGrams })} />);
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("110");
    fireEvent.click(screen.getByLabelText("Зменшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("90");
  });

  it("uses smaller portion steps below 50 grams", () => {
    const setPickedGrams = vi.fn();
    render(
      <PickedFoodCard {...baseProps({ pickedGrams: "25", setPickedGrams })} />,
    );
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("30");
    fireEvent.click(screen.getByLabelText("Зменшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("20");
  });

  it("applies a quick-portion preset", () => {
    const setPickedGrams = vi.fn();
    render(<PickedFoodCard {...baseProps({ setPickedGrams })} />);
    fireEvent.click(screen.getByText("200"));
    expect(setPickedGrams).toHaveBeenCalledWith("200");
  });

  it("не перераховує КБЖВ, поки поле ваги порожнє", () => {
    const setForm = vi.fn();
    render(<PickedFoodCard {...baseProps({ pickedGrams: "", setForm })} />);
    // Порожнє поле не має підставляти `defaultGrams`: плашки внизу
    // інакше показували б КБЖВ на 100 г під порожнім інпутом.
    expect(setForm).not.toHaveBeenCalled();
  });

  it("тримає стелю ваги і на кнопці «+», не лише на набраному вручну", () => {
    const setPickedGrams = vi.fn();
    render(
      <PickedFoodCard
        {...baseProps({ pickedGrams: "10000", setPickedGrams })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("10000");
  });

  it("тримає дробову вагу точною, а не округлює під колесо", () => {
    // 12.5 г округлювалось у колесі до 13, поки макроси рахувались із
    // 12.5 — екран показував не ту вагу, за якою рахував.
    const setForm = vi.fn();
    render(<PickedFoodCard {...baseProps({ pickedGrams: "12.5", setForm })} />);
    const updater = setForm.mock.calls[0]?.[0] as (
      state: MealFormState,
    ) => MealFormState;
    // 110 ккал / 100 г × 12.5 г = 13.75 → 14
    expect(updater(form())).toMatchObject({ kcal: "14" });
    // jsdom — fine pointer, тож рендериться степер, а не колесо.
    expect(screen.getByLabelText("Грами")).toHaveValue("12.5");
  });

  it("hands 'обрати інший продукт' back to the host", () => {
    const onChangeProduct = vi.fn();
    render(<PickedFoodCard {...baseProps({ onChangeProduct })} />);
    fireEvent.click(screen.getByLabelText("Обрати інший продукт"));
    expect(onChangeProduct).toHaveBeenCalled();
  });
});
