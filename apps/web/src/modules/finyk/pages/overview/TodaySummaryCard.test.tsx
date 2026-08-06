// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodaySummaryCard } from "./TodaySummaryCard";

/**
 * `Money` розкладає суму на кілька DOM-вузлів (тири), тож рядковий
 * матчер її не знаходить. Порівнюємо по `textContent` вузла-обгортки.
 * Пробіли — явними escape-послідовностями: `\u00a0` у розрядах від
 * `toLocaleString("uk-UA")`, `\u202f` перед ₴ від самої `Money`.
 * Звичайний пробіл тут не знаходить нічого, а в коді обидва символи
 * невидимі — тому в джерелі стоять escape-и, а не самі знаки.
 */
function hasText(re: RegExp): boolean {
  return Array.from(document.querySelectorAll("p, span")).some((el) =>
    re.test(el.textContent ?? ""),
  );
}

describe("TodaySummaryCard", () => {
  it("shows today's facts, daily plan, and remaining pace", () => {
    render(
      <TodaySummaryCard
        spent={320}
        income={500}
        dailyPlan={400}
        showBalance
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText("Сьогодні")).toBeInTheDocument();
    expect(hasText(/^320\u202f₴$/)).toBe(true);
    expect(hasText(/^500\u202f₴$/)).toBe(true);
    expect(hasText(/^400\u202f₴$/)).toBe(true);
    expect(hasText(/80\u202f₴ до темпу/)).toBe(true);
  });

  it("shows overspend and does not invent a plan when none exists", () => {
    const { rerender } = render(
      <TodaySummaryCard
        spent={450}
        income={0}
        dailyPlan={400}
        showBalance
        onOpen={vi.fn()}
      />,
    );
    expect(hasText(/50\u202f₴ понад темп/)).toBe(true);

    rerender(
      <TodaySummaryCard
        spent={450}
        income={0}
        dailyPlan={null}
        showBalance
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Не задано")).toBeInTheDocument();
    expect(screen.queryByText(/темп/)).not.toBeInTheDocument();
  });

  it("masks amounts and opens today's transactions", () => {
    const onOpen = vi.fn();
    render(
      <TodaySummaryCard
        spent={320}
        income={500}
        dailyPlan={400}
        showBalance={false}
        onOpen={onOpen}
      />,
    );

    expect(screen.getAllByText("••••").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити операції за сьогодні" }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
