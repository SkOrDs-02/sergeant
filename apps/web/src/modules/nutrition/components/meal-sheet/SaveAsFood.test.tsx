// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `SaveAsFood` action.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsertFood = vi.fn();
vi.mock("../../lib/foodDb/foodDb", () => ({
  upsertFood: (...a: unknown[]) => upsertFood(...a),
}));

import { SaveAsFood } from "./SaveAsFood";
import type { MealFormState } from "./mealFormUtils";

function form(overrides: Partial<MealFormState> = {}): MealFormState {
  return {
    name: "Йогурт",
    mealType: "snack",
    time: "10:00",
    kcal: "60",
    protein_g: "5",
    fat_g: "2",
    carbs_g: "7",
    err: "",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSaveAsFood(overrides: Record<string, unknown> = {}) {
  const props = {
    form: form(),
    setForm: vi.fn(),
    setPickedFood: vi.fn(),
    setPickedGrams: vi.fn(),
    setFoodQuery: vi.fn(),
    setFoodErr: vi.fn(),
    ...overrides,
  };
  const Comp = SaveAsFood as (p: typeof props) => ReactElement;
  render(<Comp {...props} />, { wrapper });
  return props;
}

afterEach(() => vi.clearAllMocks());

describe("SaveAsFood", () => {
  it("errors when the name is empty", () => {
    const setForm = vi.fn();
    renderSaveAsFood({ form: form({ name: "" }), setForm });
    fireEvent.click(screen.getByText(/Зберегти як продукт/));
    expect(setForm).toHaveBeenCalled();
    expect(upsertFood).not.toHaveBeenCalled();
  });

  it("errors on invalid macro values", () => {
    const setForm = vi.fn();
    renderSaveAsFood({ form: form({ kcal: "-1" }), setForm });
    fireEvent.click(screen.getByText(/Зберегти як продукт/));
    expect(setForm).toHaveBeenCalled();
    expect(upsertFood).not.toHaveBeenCalled();
  });

  it("saves the food and picks it on success", async () => {
    upsertFood.mockResolvedValue({
      ok: true,
      product: { id: "food_1", name: "Йогурт" },
    });
    const setPickedFood = vi.fn();
    const setFoodQuery = vi.fn();
    renderSaveAsFood({ setPickedFood, setFoodQuery });
    fireEvent.click(screen.getByText(/Зберегти як продукт/));
    await waitFor(() => expect(setPickedFood).toHaveBeenCalled());
    expect(upsertFood).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Йогурт", defaultGrams: 100 }),
    );
    expect(setFoodQuery).toHaveBeenCalledWith("Йогурт");
  });

  it("reports a save failure via setFoodErr", async () => {
    upsertFood.mockResolvedValue({ ok: false, error: "Збій збереження" });
    const setFoodErr = vi.fn();
    renderSaveAsFood({ setFoodErr });
    fireEvent.click(screen.getByText(/Зберегти як продукт/));
    await waitFor(() =>
      expect(setFoodErr).toHaveBeenCalledWith("Збій збереження"),
    );
  });
});
