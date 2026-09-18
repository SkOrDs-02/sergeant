// @vitest-environment jsdom
/**
 * Last validated: 2026-09-13
 * Status: Active
 */
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProductNutrientsRow } from "./ProductNutrientsRow";
import { messages } from "@shared/i18n/uk";
import type { ProductNutrients } from "@sergeant/shared";

const t = messages.nutrition.productNutrients;

const full: ProductNutrients = {
  fiber_100g: 2.7,
  sugars_100g: 4.4,
  saturatedFat_100g: 0.3,
  salt_100g: 1.2,
  alcohol_100g: null,
};

describe("ProductNutrientsRow", () => {
  afterEach(cleanup);

  it("показує всі чотири нутрієнти", () => {
    render(<ProductNutrientsRow nutrients={full} />);
    for (const label of [t.fiber, t.sugars, t.saturatedFat, t.salt]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  // Спирт приїжджає в тому самому обʼєкті, але потрібен воротам Атвотера
  // на сервері, а не людині в картці.
  it("спирт НЕ показує, навіть коли значення є", () => {
    render(<ProductNutrientsRow nutrients={{ ...full, alcohol_100g: 11.5 }} />);
    expect(screen.queryByText(/спирт/i)).toBeNull();
    expect(screen.queryByText("11.5")).toBeNull();
  });

  it("`null` дає тире з доступним поясненням, а не порожнечу", () => {
    render(<ProductNutrientsRow nutrients={{ ...full, sugars_100g: null }} />);
    expect(screen.getAllByLabelText(t.noData)).toHaveLength(1);
  });

  // Нуль — це факт («0 г клітковини»), а не відсутність. Якби рендер
  // перевіряв правдивість замість `!= null`, нуль показувався б тире.
  it("нуль показує нулем, а не тире", () => {
    render(<ProductNutrientsRow nutrients={{ ...full, fiber_100g: 0 }} />);
    expect(screen.queryByLabelText(t.noData)).toBeNull();
  });

  // Рядок із самих тире нічого не повідомляє, а місце в аркуші займає.
  it("нічого не рендерить, коли всі чотири порожні", () => {
    const { container } = render(
      <ProductNutrientsRow
        nutrients={{
          fiber_100g: null,
          sugars_100g: null,
          saturatedFat_100g: null,
          salt_100g: null,
          alcohol_100g: null,
        }}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  // Картка, де є ТІЛЬКИ спирт, для людини порожня — показувати нема чого.
  it("самого лише спирту не досить, щоб рядок зʼявився", () => {
    const { container } = render(
      <ProductNutrientsRow
        nutrients={{
          fiber_100g: null,
          sugars_100g: null,
          saturatedFat_100g: null,
          salt_100g: null,
          alcohol_100g: 40,
        }}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
