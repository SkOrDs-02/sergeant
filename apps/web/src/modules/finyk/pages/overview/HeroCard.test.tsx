// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HeroCard } from "./HeroCard";

// CounterReveal reads window.matchMedia for prefers-reduced-motion; stub it to
// return matches:true so the component renders the final value synchronously
// in tests rather than deferring to requestAnimationFrame.
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});
afterEach(() => cleanup());

describe("HeroCard", () => {
  const baseProps = {
    networth: -89158,
    monoTotal: 255,
    totalDebt: 89413,
    daysInMonth: 31,
    daysPassed: 2,
    dayBudget: 1691,
    todayRemaining: 1191,
    todaySpent: 500,
    dailySpend: [],
    todayKey: "",
    spent: 3200,
    planExpense: 0,
    hasExpensePlan: false,
    spendPlanRatio: 0,
    showBalance: true,
  };

  /**
   * Знайти суму, набрану `Money`, за її повним читабельним текстом.
   * `getAllBy…[0]`, бо та сама сума легітимно трапляється двічі на картці
   * (факт зверху і той самий факт у рядку прогнозу).
   */
  function money(text: string): HTMLElement {
    return screen.getAllByText(
      (_, el) =>
        el?.tagName === "SPAN" &&
        el.className.includes("tabular-nums") &&
        (el.textContent ?? "").replace(/[\s\u00a0\u202f]/g, " ") === text,
    )[0]!;
  }

  it("shows the remaining daily amount and capital as supporting text", () => {
    render(<HeroCard {...baseProps} />);
    expect(screen.getByText("Сьогодні ще можна")).toBeInTheDocument();
    expect(money("1 191 ₴")).toBeInTheDocument();
    expect(money("−89 158 ₴")).toBeInTheDocument();
    expect(screen.getByText(/На картках/)).toBeInTheDocument();
    expect(screen.getByTestId("hero-today-subline")).toHaveTextContent(
      "Витрачено сьогодні",
    );
  });
  it("preserves the minus sign when today's budget is exceeded", () => {
    render(<HeroCard {...baseProps} todayRemaining={-120} />);
    expect(money("−120 ₴")).toBeInTheDocument();
    expect(screen.getByText("Понад бюджет дня")).toBeInTheDocument();
  });
  it("shows monthly fact and plan without a second hero number", () => {
    render(<HeroCard {...baseProps} hasExpensePlan planExpense={10000} />);
    expect(screen.getByTestId("hero-strip-footer")).toHaveTextContent(
      "План місяця",
    );
    expect(money("10 000 ₴")).toBeInTheDocument();
  });
  it("renders the MonthStrip when dailySpend is non-empty", () => {
    render(
      <HeroCard
        {...baseProps}
        todayKey="2026-06-05"
        dailySpend={[
          { dayKey: "2026-06-04", spent: 100, ratio: 0.5, over120: false },
          { dayKey: "2026-06-05", spent: 200, ratio: 1, over120: false },
        ]}
      />,
    );
    expect(
      screen.getByRole("group", { name: /Витрати за днями/ }),
    ).toBeInTheDocument();
  });

  it("does not render the MonthStrip group when dailySpend is empty", () => {
    render(<HeroCard {...baseProps} dailySpend={[]} />);
    expect(
      screen.queryByRole("group", { name: /Витрати за днями/ }),
    ).not.toBeInTheDocument();
  });

  it("does not duplicate 'Бюджет на день' or 'Фінпульс' labels", () => {
    render(<HeroCard {...baseProps} />);
    expect(screen.queryByText("Бюджет на день")).not.toBeInTheDocument();
    expect(screen.queryByText("Фінпульс")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/цільова витрата на день/),
    ).not.toBeInTheDocument();
  });

  it("masks every financial figure when showBalance is false", () => {
    const { container } = render(
      <HeroCard {...baseProps} showBalance={false} />,
    );
    expect(container.textContent).toContain("••••");
    expect(container.textContent).not.toContain("89");
    expect(container.textContent).not.toContain("191");
    expect(screen.getByText(/На картках/)).toHaveTextContent(
      "На картках •••• · Борги ••••",
    );
  });

  describe("no monthly plan (todayRemaining = null)", () => {
    const noPlanProps = {
      ...baseProps,
      dayBudget: null,
      todayRemaining: null,
      hasExpensePlan: false,
    };

    it("renders the set-a-plan CTA instead of a fabricated number", () => {
      render(<HeroCard {...noPlanProps} onSetPlan={() => {}} />);
      expect(screen.getByText("Денний бюджет не задано")).toBeInTheDocument();
      expect(screen.queryByText("₴/день")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Лишилось на сьогодні/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("В нормі")).not.toBeInTheDocument();
    });

    it("calls onSetPlan when the CTA is pressed", () => {
      const onSetPlan = vi.fn();
      render(<HeroCard {...noPlanProps} onSetPlan={onSetPlan} />);
      fireEvent.click(screen.getByRole("button", { name: "Задати план" }));
      expect(onSetPlan).toHaveBeenCalledTimes(1);
    });

    it("omits the CTA button when no handler is wired", () => {
      render(<HeroCard {...noPlanProps} />);
      expect(
        screen.queryByRole("button", { name: "Задати план" }),
      ).not.toBeInTheDocument();
      // The explanatory copy still stands in for the missing number.
      expect(screen.getByText("Денний бюджет не задано")).toBeInTheDocument();
    });
  });

  describe("MonthStrip cell tap", () => {
    it("forwards the tapped day-key to onOpenDay", () => {
      const onOpenDay = vi.fn();
      render(
        <HeroCard
          {...baseProps}
          todayKey="2026-06-05"
          dailySpend={[
            { dayKey: "2026-06-04", spent: 100, ratio: 0.5, over120: false },
          ]}
          onOpenDay={onOpenDay}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /4 червня/ }));
      expect(onOpenDay).toHaveBeenCalledWith("2026-06-04");
    });
  });
});
