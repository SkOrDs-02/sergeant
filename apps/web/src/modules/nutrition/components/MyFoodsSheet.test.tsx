// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  listUserFoods: vi.fn(),
  upsertFood: vi.fn(),
  deleteFood: vi.fn(),
}));
vi.mock("../lib/foodDb/foodDb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/foodDb/foodDb")>()),
  ...db,
}));

import { MyFoodsSheet } from "./MyFoodsSheet";

const bread = {
  id: "food_1",
  name: "Тестовий хліб",
  brand: "",
  norm: "тестовий хліб",
  defaultGrams: 100,
  per100: { kcal: 250, protein_g: 8, fat_g: 3, carbs_g: 50 },
  portions: [{ id: "p1", name: "скибка", grams: 30 }],
  origin: "user" as const,
  updatedAt: 1,
};

function renderSheet() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MyFoodsSheet open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.listUserFoods.mockResolvedValue([bread]);
  db.upsertFood.mockResolvedValue({ ok: true, product: bread });
  db.deleteFood.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("MyFoodsSheet", () => {
  it("показує лише власні продукти", async () => {
    renderSheet();
    expect(await screen.findByText("Тестовий хліб")).toBeInTheDocument();
  });

  it("порожній стан пояснює, де продукти створюються", async () => {
    db.listUserFoods.mockResolvedValue([]);
    renderSheet();
    expect(
      await screen.findByText(/Створити продукт можна/),
    ).toBeInTheDocument();
  });

  it("редагування зберігає нові КБЖВ і порції зі старим id", async () => {
    renderSheet();
    fireEvent.click(
      await screen.findByRole("button", { name: "Редагувати Тестовий хліб" }),
    );
    expect(
      screen.getByText("Записи, які вже є, не зміняться."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ккал / 100 г"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати порцію" }));
    fireEvent.change(screen.getByLabelText("Назва порції 2"), {
      target: { value: "пачка" },
    });
    fireEvent.change(screen.getByLabelText("Грами порції 2"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => expect(db.upsertFood).toHaveBeenCalledTimes(1));
    expect(db.upsertFood.mock.calls[0]?.[0]).toMatchObject({
      id: "food_1",
      origin: "user",
      per100: { kcal: 300, protein_g: 8, fat_g: 3, carbs_g: 50 },
      portions: [
        { id: "p1", name: "скибка", grams: 30 },
        { name: "пачка", grams: 500 },
      ],
    });
  });

  it("видалення просить підтвердження і лишає записи щоденника", async () => {
    renderSheet();
    fireEvent.click(
      await screen.findByRole("button", { name: "Видалити Тестовий хліб" }),
    );
    expect(db.deleteFood).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Записи в щоденнику лишаться з їхніми числами/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    await waitFor(() => expect(db.deleteFood).toHaveBeenCalledWith("food_1"));
  });
});
