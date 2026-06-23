// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `FoodPickerSection` (search + picked modes).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./FoodHitRow", () => ({
  FoodHitRow: ({ p, onPick }: { p: { name?: string }; onPick: () => void }) => (
    <li>
      <button type="button" onClick={onPick}>
        hit:{p.name}
      </button>
    </li>
  ),
}));
vi.mock("./MacroChip", () => ({
  MacroChip: ({ label, value }: { label: string; value: number | null }) => (
    <div data-testid="macro-chip">
      {label}:{value ?? "—"}
    </div>
  ),
}));

import { FoodPickerSection, type PickedFood } from "./FoodPickerSection";
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

const Section = FoodPickerSection as unknown as (
  p: Record<string, unknown>,
) => ReactElement;

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    form: form(),
    setForm: vi.fn(),
    foodQuery: "",
    setFoodQuery: vi.fn(),
    foodHits: [],
    offHits: [],
    foodBusy: false,
    offBusy: false,
    foodErr: "",
    pickedFood: null,
    setPickedFood: vi.fn(),
    pickedGrams: "100",
    setPickedGrams: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("FoodPickerSection — search mode", () => {
  it("routes query changes through setFoodQuery", () => {
    const setFoodQuery = vi.fn();
    render(<Section {...baseProps({ setFoodQuery })} />);
    fireEvent.change(screen.getByLabelText("Пошук продукту"), {
      target: { value: "курка" },
    });
    expect(setFoodQuery).toHaveBeenCalledWith("курка");
  });

  it("picks a local food hit", () => {
    const setPickedFood = vi.fn();
    const setPickedGrams = vi.fn();
    render(
      <Section
        {...baseProps({
          foodHits: [{ id: "f1", name: "Курка", defaultGrams: 150 }],
          setPickedFood,
          setPickedGrams,
        })}
      />,
    );
    fireEvent.click(screen.getByText("hit:Курка"));
    expect(setPickedFood).toHaveBeenCalled();
    expect(setPickedGrams).toHaveBeenCalledWith("150");
  });

  it("shows the OFF group separator when both hit lists are non-empty", () => {
    render(
      <Section
        {...baseProps({
          foodHits: [{ id: "f1", name: "Курка", defaultGrams: 100 }],
          offHits: [{ id: "o1", name: "Lays", defaultGrams: 30 }],
        })}
      />,
    );
    expect(screen.getByText(/Open Food Facts/)).toBeInTheDocument();
    expect(screen.getByText("hit:Lays")).toBeInTheDocument();
  });

  it("renders the food error message", () => {
    render(<Section {...baseProps({ foodErr: "Помилка пошуку" })} />);
    expect(screen.getByText("Помилка пошуку")).toBeInTheDocument();
  });
});

describe("FoodPickerSection — picked mode", () => {
  const picked: PickedFood = {
    id: "f1",
    name: "Курка",
    brand: "Наша Ряба",
    defaultGrams: 100,
    per100: { kcal: 110, protein_g: 23, fat_g: 2, carbs_g: 0 },
  };

  it("renders the picked-food card with per-100 macros", () => {
    render(
      <Section
        {...baseProps({ pickedFood: picked, form: form({ kcal: "110" }) })}
      />,
    );
    expect(screen.getByText(/Курка · Наша Ряба/)).toBeInTheDocument();
    expect(screen.getAllByTestId("macro-chip").length).toBe(4);
  });

  it("increments and decrements the gram portion", () => {
    const setPickedGrams = vi.fn();
    render(
      <Section
        {...baseProps({
          pickedFood: picked,
          pickedGrams: "100",
          setPickedGrams,
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Збільшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("110");
    fireEvent.click(screen.getByLabelText("Зменшити"));
    expect(setPickedGrams).toHaveBeenCalledWith("90");
  });

  it("applies a quick-portion preset", () => {
    const setPickedGrams = vi.fn();
    render(
      <Section
        {...baseProps({
          pickedFood: picked,
          pickedGrams: "100",
          setPickedGrams,
        })}
      />,
    );
    fireEvent.click(screen.getByText("200"));
    expect(setPickedGrams).toHaveBeenCalledWith("200");
  });

  it("resets the picked food", () => {
    const setPickedFood = vi.fn();
    const setPickedGrams = vi.fn();
    render(
      <Section
        {...baseProps({
          pickedFood: picked,
          setPickedFood,
          setPickedGrams,
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Скинути продукт"));
    expect(setPickedFood).toHaveBeenCalledWith(null);
    expect(setPickedGrams).toHaveBeenCalledWith("100");
  });
});
