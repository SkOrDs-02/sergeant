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

  /**
   * Підпис «Капітал» іде ПІД числом — число має зустрічати око першим.
   * Перевіряємо порядок у DOM: до цієї зміни обидва вузли теж існували,
   * просто в зворотному порядку, тож перевірка наявності нічого б не ловила.
   */
  it("puts the Капітал caption after the number, not before", () => {
    render(<HeroCard {...baseProps} />);
    const number = screen.getByText(
      (_, el) =>
        el?.textContent?.replace(/\s/g, " ") === "−89 158 ₴" &&
        el.tagName === "P",
    );
    const position = number.compareDocumentPosition(
      screen.getByText("Капітал"),
    );
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders networth, breakdown row and «Лишилось на сьогодні»", () => {
    render(<HeroCard {...baseProps} />);
    expect(screen.getByText("Капітал")).toBeInTheDocument();
    // The networth is split across nodes: a leading "−" text node sibling to
    // the CounterReveal span ("89 158 ₴"). Match the wrapper by textContent.
    // Intl.NumberFormat("uk-UA") groups thousands with a non-breaking space
    // (U+00A0), so normalise whitespace before comparing to a plain-space
    // literal — the function matcher bypasses RTL's default normaliser.
    expect(
      screen.getByText(
        (_, el) =>
          el?.textContent?.replace(/\s/g, " ") === "−89 158 ₴" &&
          el.tagName === "P",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/На картках/)).toBeInTheDocument();
    // Суми набрані `Money`: знак, розряди й символ — окремі вузли (П4),
    // тож звіряємось із textContent, а не з єдиним текстовим вузлом.
    expect(money("+255 ₴")).toBeInTheDocument();
    expect(money("−89 413 ₴")).toBeInTheDocument();
    // Головне число — `todayRemaining` (1691 − 500), не голий `dayBudget`.
    expect(money("1 191 ₴")).toBeInTheDocument();
    expect(screen.getByText(/Лишилось на сьогодні/)).toBeInTheDocument();
    // Рядок під числом — «витрачено X ₴ із Y ₴» (рішення 2 спеки).
    const subline = screen.getByTestId("hero-today-subline");
    expect(subline.textContent).toMatch(/витрачено/);
    expect(money("500 ₴")).toBeInTheDocument();
    expect(money("1 691 ₴")).toBeInTheDocument();
  });

  it("renders «−N ₴ понад бюджет дня» in the accent tone when todayRemaining < 0", () => {
    render(<HeroCard {...baseProps} todayRemaining={-120} />);
    const amount = money("120 ₴ понад бюджет дня");
    expect(amount).toBeInTheDocument();
    // Tier-400 фінансовий акцент, не червоний (рішення 1 спеки — hero не карає).
    expect(amount.className).toContain("text-chart-finyk");
    expect(amount.className).not.toContain("text-danger");
  });

  it("footer shows spent-of-plan and percent when a plan is set", () => {
    render(
      <HeroCard
        {...baseProps}
        hasExpensePlan={true}
        spendPlanRatio={0.3}
        planExpense={10000}
      />,
    );
    const footer = screen.getByTestId("hero-strip-footer");
    expect(footer.textContent).toMatch(/30% плану/);
    expect(footer.textContent).toMatch(/день 2 із 31/);
    expect(money("10 000 ₴")).toBeInTheDocument();
  });

  it("footer shows «за місяць» without a percent when no plan is set", () => {
    render(<HeroCard {...baseProps} hasExpensePlan={false} />);
    const footer = screen.getByTestId("hero-strip-footer");
    expect(footer.textContent).toMatch(/за місяць/);
    expect(footer.textContent).toMatch(/день 2 із 31/);
    expect(footer.textContent).not.toMatch(/% плану/);
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

  it("masks numbers when showBalance is false", () => {
    render(<HeroCard {...baseProps} showBalance={false} />);
    const dots = screen.getAllByText("••••");
    // Networth + hero-число + рядок «витрачено» + футер — усі маскуються.
    expect(dots.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/На картках/)).toHaveTextContent(
      "На картках •••• · Борги ••••",
    );
  });

  it("uses pulseStyle status text — 'В межах плану' when plan present and ratio low", () => {
    render(
      <HeroCard {...baseProps} hasExpensePlan={true} spendPlanRatio={0.2} />,
    );
    expect(screen.getByText("В межах плану")).toBeInTheDocument();
  });

  it("uses pulseStyle status text — 'Перевитрата' when dayBudget < 0 and no plan", () => {
    render(<HeroCard {...baseProps} hasExpensePlan={false} dayBudget={-100} />);
    expect(screen.getByText("Перевитрата")).toBeInTheDocument();
  });

  it("keeps the daily allowance readable on the light hero", () => {
    render(<HeroCard {...baseProps} />);
    // Тон живе на контейнері числа; `Money` успадковує його, а приглушені
    // тири беруть hero-ink-палітру (інакше text-muted тоне в градієнті).
    const amount = money("1 191 ₴");
    expect(amount.closest("div")?.className).toContain("text-hero-ink");
    // Тир не має власного кольору — гаситься прозорістю поверх currentColor,
    // тож на градієнті лишається того самого чорнила, що й число.
    expect(amount.querySelector(".text-\\[0\\.72em\\]")?.className).toContain(
      "opacity-65",
    );
    expect(screen.getByText("В нормі").className).toContain("text-hero-ink");
  });

  it("renders negative networth in the hero ink tone, not red", () => {
    const { container } = render(<HeroCard {...baseProps} />);
    // Червоне на тонованому зеленому hero читалось найгірше на екрані
    // (звіт власника 2026-09-03): мінус несе сам знак, тон лишається
    // чорнильним. The "−" sign and the CounterReveal span ("89 158 ₴")
    // together form the full text; uk-UA groups thousands with U+00A0.
    const networthEl = screen.getByText(
      (_, el) =>
        el?.textContent?.replace(/\s/g, " ") === "−89 158 ₴" &&
        el.tagName === "P",
    );
    expect(networthEl.className).not.toMatch(/text-danger/);
    expect(networthEl.className).toMatch(/text-hero-ink/);
    // sanity: the negative networth lives inside the card root
    expect(container.firstChild).toContainElement(networthEl);
  });

  // Regression: founder report 2026-07-31 — with no monthly plan the hero
  // showed «124 686 ₴/день · В нормі», a number derived from the very spend
  // it claimed to budget. `dayBudget`/`todayRemaining` are now `null` in that
  // state.
  describe("no monthly plan (todayRemaining = null)", () => {
    const noPlanProps = {
      ...baseProps,
      dayBudget: null,
      todayRemaining: null,
      hasExpensePlan: false,
    };

    it("renders the set-a-plan CTA instead of a fabricated number", () => {
      render(<HeroCard {...noPlanProps} onSetPlan={() => {}} />);
      expect(
        screen.getByText("Скільки можна витрачати на день?"),
      ).toBeInTheDocument();
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
      expect(
        screen.getByText("Скільки можна витрачати на день?"),
      ).toBeInTheDocument();
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
