// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
    hasExpensePlan: false,
    spendPlanRatio: 0,
    showBalance: true,
  };

  it("renders networth, breakdown row and big day-budget number", () => {
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
    expect(screen.getByText("+255 ₴")).toBeInTheDocument();
    expect(screen.getByText("−89 413 ₴")).toBeInTheDocument();
    expect(screen.getByText("1 691")).toBeInTheDocument();
    expect(screen.getByText("₴/день")).toBeInTheDocument();
    expect(screen.getByText(/Можна сьогодні/)).toBeInTheDocument();
  });

  it("shows month progress as 'День N з M'", () => {
    render(<HeroCard {...baseProps} />);
    expect(screen.getByText("День 2 з 31")).toBeInTheDocument();
    expect(screen.getByText("29 дн до кінця")).toBeInTheDocument();
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
    // Networth + day budget hero render `••••`, breakdown line shows
    // `На картках •••• · Борги ••••` as a single string.
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

  it("renders negative networth in danger color", () => {
    const { container } = render(<HeroCard {...baseProps} />);
    // The danger color lives on the <p> wrapper; the "−" sign and the
    // CounterReveal span ("89 158 ₴") together form the full text.
    // uk-UA groups thousands with a non-breaking space (U+00A0), so normalise
    // whitespace before comparing to a plain-space literal.
    const networthEl = screen.getByText(
      (_, el) =>
        el?.textContent?.replace(/\s/g, " ") === "−89 158 ₴" &&
        el.tagName === "P",
    );
    expect(networthEl.className).toMatch(/text-danger/);
    // sanity: the negative networth lives inside the card root
    expect(container.firstChild).toContainElement(networthEl);
  });
});
