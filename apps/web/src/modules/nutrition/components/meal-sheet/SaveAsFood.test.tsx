// @vitest-environment jsdom
/**
 * Last validated: 2026-08-12
 * Status: Active
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsertFood = vi.fn();
vi.mock("../../lib/foodDb/foodDb", () => ({
  upsertFood: (...args: unknown[]) => upsertFood(...args),
}));

import { SaveAsFood } from "./SaveAsFood";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSaveAsFood() {
  const props = {
    setPickedFood: vi.fn(),
    setPickedGrams: vi.fn(),
    setFoodQuery: vi.fn(),
    setFoodErr: vi.fn(),
  };
  render(<SaveAsFood {...props} />, { wrapper });
  fireEvent.click(screen.getByText("Створити власний продукт"));
  return props;
}

function fillValidProduct() {
  fireEvent.change(screen.getByLabelText("Назва"), {
    target: { value: "Йогурт" },
  });
  fireEvent.change(screen.getByLabelText("Ккал / 100 г"), {
    target: { value: "60" },
  });
  fireEvent.change(screen.getByLabelText("Білки / 100 г"), {
    target: { value: "5" },
  });
}

afterEach(() => vi.clearAllMocks());

describe("SaveAsFood", () => {
  it("requires a product name", () => {
    const props = renderSaveAsFood();
    fireEvent.click(screen.getByRole("button", { name: "Створити продукт" }));
    expect(props.setFoodErr).toHaveBeenCalledWith("Введи назву продукту.");
    expect(upsertFood).not.toHaveBeenCalled();
  });

  it("rejects invalid per-100g values", () => {
    const props = renderSaveAsFood();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Ккал / 100 г"), {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Створити продукт" }));
    expect(props.setFoodErr).toHaveBeenCalledWith(
      "Введи невід’ємні КБЖВ на 100 г і додатну вагу порції.",
    );
    expect(upsertFood).not.toHaveBeenCalled();
  });

  it("saves explicit per-100g values and picks the product", async () => {
    upsertFood.mockResolvedValue({
      ok: true,
      product: { id: "food_1", name: "Йогурт" },
    });
    const props = renderSaveAsFood();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Типова порція, г"), {
      target: { value: "125" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Створити продукт" }));

    await waitFor(() => expect(props.setPickedFood).toHaveBeenCalled());
    expect(upsertFood).toHaveBeenCalledWith({
      name: "Йогурт",
      per100: { kcal: 60, protein_g: 5, fat_g: 0, carbs_g: 0 },
      defaultGrams: 125,
    });
    expect(props.setPickedGrams).toHaveBeenCalledWith("125");
    expect(props.setFoodQuery).toHaveBeenCalledWith("Йогурт");
  });

  it("reports a save failure", async () => {
    upsertFood.mockResolvedValue({ ok: false, error: "Збій збереження" });
    const props = renderSaveAsFood();
    fillValidProduct();
    fireEvent.click(screen.getByRole("button", { name: "Створити продукт" }));
    await waitFor(() =>
      expect(props.setFoodErr).toHaveBeenCalledWith("Збій збереження"),
    );
  });
});
