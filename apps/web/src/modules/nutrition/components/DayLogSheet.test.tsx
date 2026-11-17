// @vitest-environment jsdom
/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Вартовий МЕЖІ аркуша (анти-слоп П3), а не його вигляду.
 *
 * AI-DANGER: помилка тут виглядає як охайність. Наступний агент побачить
 * перемикач дати чи пошук поза перфорованою поверхнею й затягне їх
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

import { HISTORY_FROM_DAYS, LogCard } from "./LogCard";
import { addDaysISODate, todayISODate } from "@sergeant/nutrition-domain";

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
  };
  const Comp = LogCard as (p: typeof props) => ReactElement;
  render(<Comp {...props} />);
}

function renderWithMeals() {
  // Тиждень днів із записами: пошук журналу показується від
  // `HISTORY_FROM_DAYS` (redesign v3.2, 17).
  renderLog(
    Object.fromEntries(
      Array.from({ length: HISTORY_FROM_DAYS }, (_, i) => [
        addDaysISODate(today, -i),
        { meals: MEALS },
      ]),
    ),
  );
  return screen.getByRole("region", { name: `Записи за ${today}` });
}

describe("DayLogSheet — межа аркуша", () => {
  it("аркуш містить записи дня", () => {
    const sheet = renderWithMeals();
    expect(within(sheet).getByTestId("virtual-meals")).toBeTruthy();
  });

  it("керування записом лишається ПОЗА аркушем", () => {
    const sheet = renderWithMeals();
    // Перемикач дати й пошук — органи керування. Вони існують на екрані,
    // але не всередині перфорованої поверхні. Кнопки «Додати прийом їжі»
    // під списком більше немає: додає кутова кнопка (redesign v3.2, 01).
    expect(within(sheet).queryByText("Додати прийом їжі")).toBeNull();

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
