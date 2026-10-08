// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsertFood = vi.fn();
vi.mock("../../lib/foodDb/foodDb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/foodDb/foodDb")>()),
  upsertFood: (...args: unknown[]) => upsertFood(...args),
}));

import { PackageEntryStep } from "./PackageEntryStep";

function renderStep() {
  const onCreated = vi.fn();
  render(<PackageEntryStep onCreated={onCreated} />);
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
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects invalid per-100g values", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Ккал / 100 г"), {
      target: { value: "-1" },
    });
    submit();
    expect(
      screen.getByText("Введи невідʼємні КБЖВ на 100 г і додатну вагу порції."),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a zero portion", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "0" },
    });
    submit();
    expect(
      screen.getByText("Введи невідʼємні КБЖВ на 100 г і додатну вагу порції."),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
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
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("«Далі» не пише в базу: віддає наверх продукт з id і позначкою unsaved", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "125" },
    });
    submit();

    expect(upsertFood).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledTimes(1);
    const [product, grams] = onCreated.mock.calls[0] ?? [];
    expect(grams).toBe("125");
    expect(product).toMatchObject({
      name: "Йогурт",
      per100: { kcal: 60, protein_g: 5, fat_g: 0, carbs_g: 0 },
      defaultGrams: 125,
      portions: [],
      origin: "user",
      unsaved: true,
    });
    expect(String(product.id)).toMatch(/^food_/);
  });

  it("приймає кому в грамах — не мовчазний відкат на 100", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.change(screen.getByLabelText("Скільки зʼїв, г"), {
      target: { value: "150,5" },
    });
    submit();
    expect(onCreated).toHaveBeenCalledWith(expect.anything(), "150.5");
  });

  it("«Додати порцію» двічі і «Прибрати» першої лишає рядок з другими значеннями", () => {
    const onCreated = renderStep();
    fillValidProduct();
    const add = () =>
      fireEvent.click(screen.getByRole("button", { name: "Додати порцію" }));
    add();
    fireEvent.change(screen.getByLabelText("Назва порції 1"), {
      target: { value: "скибка" },
    });
    fireEvent.change(screen.getByLabelText("Грами порції 1"), {
      target: { value: "30" },
    });
    add();
    fireEvent.change(screen.getByLabelText("Назва порції 2"), {
      target: { value: "батон" },
    });
    fireEvent.change(screen.getByLabelText("Грами порції 2"), {
      target: { value: "400" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Прибрати порцію скибка" }),
    );

    expect(screen.queryByLabelText("Назва порції 2")).toBeNull();
    expect(screen.getByLabelText("Назва порції 1")).toHaveValue("батон");
    expect(screen.getByLabelText("Грами порції 1")).toHaveValue("400");

    submit();
    const [product] = onCreated.mock.calls[0] ?? [];
    expect(product.portions).toMatchObject([{ name: "батон", grams: 400 }]);
  });

  it("половинчаста порція блокує «Далі» з підписом біля рядка", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.click(screen.getByRole("button", { name: "Додати порцію" }));
    fireEvent.change(screen.getByLabelText("Назва порції 1"), {
      target: { value: "скибка" },
    });
    submit();
    expect(
      screen.getByText("Заповни назву й грами або прибери рядок."),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("порожній рядок порції мовчки відкидається", () => {
    const onCreated = renderStep();
    fillValidProduct();
    fireEvent.click(screen.getByRole("button", { name: "Додати порцію" }));
    submit();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls[0]?.[0].portions).toEqual([]);
  });
});
