// @vitest-environment jsdom
/**
 * Last validated: 2026-08-22
 * Status: Active
 * Unit tests for the meal-sheet `FoodPickerSection` (search only — the
 * picked-food card lives in `PickedFoodCard` on the "fill" step).
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

import { FoodPickerSection } from "./FoodPickerSection";

const Section = FoodPickerSection as unknown as (
  p: Record<string, unknown>,
) => ReactElement;

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    foodQuery: "",
    setFoodQuery: vi.fn(),
    foodHits: [],
    offHits: [],
    foodBusy: false,
    offBusy: false,
    foodErr: "",
    setPickedFood: vi.fn(),
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
    const setFoodQuery = vi.fn();
    render(
      <Section
        {...baseProps({
          foodHits: [{ id: "f1", name: "Курка", defaultGrams: 150 }],
          setPickedFood,
          setPickedGrams,
          setFoodQuery,
        })}
      />,
    );
    fireEvent.click(screen.getByText("hit:Курка"));
    expect(setPickedFood).toHaveBeenCalled();
    expect(setPickedGrams).toHaveBeenCalledWith("150");
    expect(setFoodQuery).toHaveBeenCalledWith("");
  });

  it("picks an OFF hit and falls back to 100 grams", () => {
    const setPickedFood = vi.fn();
    const setPickedGrams = vi.fn();
    const setFoodQuery = vi.fn();
    render(
      <Section
        {...baseProps({
          offHits: [{ id: "o1", name: "Йогурт", defaultGrams: 0 }],
          setPickedFood,
          setPickedGrams,
          setFoodQuery,
        })}
      />,
    );
    fireEvent.click(screen.getByText("hit:Йогурт"));
    expect(setPickedFood).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Йогурт" }),
    );
    expect(setPickedGrams).toHaveBeenCalledWith("100");
    expect(setFoodQuery).toHaveBeenCalledWith("");
  });

  it("shows a busy search indicator", () => {
    render(<Section {...baseProps({ foodBusy: true })} />);
    expect(screen.getByText("пошук…")).toBeInTheDocument();
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
