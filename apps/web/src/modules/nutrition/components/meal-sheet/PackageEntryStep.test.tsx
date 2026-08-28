// @vitest-environment jsdom
/**
 * Last validated: 2026-08-22
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

import { PackageEntryStep } from "./PackageEntryStep";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderStep() {
  const onCreated = vi.fn();
  render(<PackageEntryStep onCreated={onCreated} />, { wrapper });
  return onCreated;
}

function fillValidProduct() {
  fireEvent.change(screen.getByLabelText("Назва продукту"), {
    target: { value: "Йогурт" },
  });
  fireEvent.change(screen.getByLabelText("Ккал / 100 г"), {
    target: { value: "60" },
  });
  fireEvent.change(screen.getByLabelText("Білки / 100 г"), {
    target: { value: "5" },
  });
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Далі" }));

afterEach(() => vi.clearAllMocks());

describe("PackageEntryStep", () => {
  it("каже, що КБЖВ читаються з етикетки на 100 г", () => {
    renderStep();
    expect(screen.getByText(/на 100 г/)).toBeInTheDocument();
    expect(screen.getByLabelText("Скільки зʼїв, г")).toHaveValue("100");
  });

  it("requires a product name", () => {
    const onCreated = renderStep();
    submit();
    expect(screen.getByText("Введи назву продукту.")).toBeInTheDocument();
    expect(upsertFood).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects invalid per-100g values", () => {
    renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Ккал / 100 г"), {
      target: { value: "-1" },
    });
    submit();
    expect(
      screen.getByText("Введи невідʼємні КБЖВ на 100 г і додатну вагу порції."),
    ).toBeInTheDocument();
    expect(upsertFood).not.toHaveBeenCalled();
  });

  it("rejects a zero portion", () => {
    renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "0" },
    });
    submit();
    expect(
      screen.getByText("Введи невідʼємні КБЖВ на 100 г і додатну вагу порції."),
    ).toBeInTheDocument();
    expect(upsertFood).not.toHaveBeenCalled();
  });

  it("не пропускає вагу порції понад стелю", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "10001" },
    });
    submit();
    expect(
      screen.getByText("Забагато: максимум 10000 г на порцію."),
    ).toBeInTheDocument();
    expect(upsertFood).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("зберігає КБЖВ на 100 г і віддає порцію наверх", async () => {
    upsertFood.mockResolvedValue({
      ok: true,
      product: { id: "food_1", name: "Йогурт" },
    });
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "125" },
    });
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(upsertFood).toHaveBeenCalledWith({
      name: "Йогурт",
      per100: { kcal: 60, protein_g: 5, fat_g: 0, carbs_g: 0 },
      defaultGrams: 125,
    });
    expect(onCreated).toHaveBeenCalledWith(
      { id: "food_1", name: "Йогурт" },
      "125",
    );
  });

  it("приймає кому в грамах — не мовчазний відкат на 100", async () => {
    upsertFood.mockResolvedValue({
      ok: true,
      product: { id: "food_1", name: "Йогурт" },
    });
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "150,5" },
    });
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(expect.anything(), "150.5");
  });

  it("reports a save failure", async () => {
    upsertFood.mockResolvedValue({ ok: false, error: "Збій збереження" });
    const onCreated = renderStep();
    fillValidProduct();
    submit();
    await waitFor(() =>
      expect(screen.getByText("Збій збереження")).toBeInTheDocument(),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});
