// @vitest-environment jsdom
/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Вартовий МЕЖІ аркуша (анти-слоп П3), а не його вигляду.
 *
 * AI-DANGER: помилка тут виглядає як охайність. Наступний агент побачить
 * «+ Додати прийом їжі» поза перфорованою поверхнею й затягне кнопку
 * всередину — сторінка стане «цілішою», а матеріал збрехне: перфорація
 * пообіцяє, що відривається запис, тоді як відірветься форма введення.
 * Рівно за це край зняли з hero Рутини. Тому межа пінеться тестом, а не
 * лише коментарем.
 */
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./VirtualMealList", () => ({
  VirtualMealList: () => <div data-testid="virtual-meals" />,
}));
vi.mock("./LogCardSearch", () => ({
  LogCardSearch: () => <div data-testid="log-search" />,
}));
vi.mock("./LogCardWeeklyTable", () => ({
  LogCardWeeklyTable: () => <div data-testid="log-weekly" />,
}));
vi.mock("./LogCardAnalytics", () => ({
  LogCardAnalytics: () => <div data-testid="log-analytics" />,
}));

import { LogCard } from "./LogCard";
import { todayISODate } from "@sergeant/nutrition-domain";

const today = todayISODate();

const MEALS = [
  { id: "m1", label: "Вівсянка", mealType: "breakfast", kcal: 320 },
  { id: "m2", label: "Суп", mealType: "lunch", kcal: 480 },
];

function renderLog(log: Record<string, unknown>) {
  const props = {
    log: log as never,
    selectedDate: today,
    setSelectedDate: vi.fn(),
    onAddMeal: vi.fn(),
  };
  const Comp = LogCard as (p: typeof props) => ReactElement;
  render(<Comp {...props} />);
}

function renderWithMeals() {
  renderLog({ [today]: { meals: MEALS } });
  return screen.getByRole("region", { name: `Записи за ${today}` });
}

describe("DayLogSheet — межа аркуша", () => {
  it("аркуш містить записи дня", () => {
    const sheet = renderWithMeals();
    expect(within(sheet).getByTestId("virtual-meals")).toBeTruthy();
  });

  it("керування записом лишається ПОЗА аркушем", () => {
    const sheet = renderWithMeals();
    // Кнопка додавання, перемикач дати й пошук — органи керування. Вони
    // існують на екрані, але не всередині перфорованої поверхні.
    expect(screen.getByText("+ Додати прийом їжі")).toBeTruthy();
    expect(within(sheet).queryByText("+ Додати прийом їжі")).toBeNull();

    expect(screen.getByLabelText("Попередній день")).toBeTruthy();
    expect(within(sheet).queryByLabelText("Попередній день")).toBeNull();

    expect(screen.getByTestId("log-search")).toBeTruthy();
    expect(within(sheet).queryByTestId("log-search")).toBeNull();
  });

  it("без прийомів аркуша немає зовсім — порожній стан не є записом", () => {
    renderLog({});
    expect(
      screen.queryByRole("region", { name: `Записи за ${today}` }),
    ).toBeNull();
    expect(screen.getByText("Поки немає записів")).toBeTruthy();
  });
});
