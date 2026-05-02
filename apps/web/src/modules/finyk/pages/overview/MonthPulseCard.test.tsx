// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MonthPulseCard } from "./MonthPulseCard";

afterEach(() => cleanup());

describe("MonthPulseCard", () => {
  const baseProps = {
    dateLabel: "2 травня",
    daysPassed: 2,
    spent: 4261,
    income: 0,
    showBalance: true,
    showMonthForecast: true,
    projectedSpend: 66041,
    hasExpensePlan: false,
    spendPlanRatio: 0,
    planExpense: 0,
    forecastTrendPct: 6,
    forecastBarClass: "bg-emerald-500",
    recurringOutThisMonth: 0,
    recurringInThisMonth: 0,
    unknownOutCount: 0,
  };

  it("renders Місяць label, date, spent + income pair", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.getByText("Місяць")).toBeInTheDocument();
    expect(screen.getByText("2 травня")).toBeInTheDocument();
    expect(screen.getByText("Витрати")).toBeInTheDocument();
    expect(screen.getByText("Дохід")).toBeInTheDocument();
    expect(screen.getByText("4 261")).toBeInTheDocument();
  });

  it("does not duplicate the day-budget — no Фінпульс block", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.queryByText("Фінпульс")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/цільова витрата на день/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/₴\/день/)).not.toBeInTheDocument();
  });

  it("does not show the 'Витрати від доходу' or 'Залишок:' rows", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.queryByText("Витрати від доходу")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Залишок:/)).not.toBeInTheDocument();
  });

  it("does not show the standalone 'Факт і прогноз витрат' eyebrow", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.queryByText("Факт і прогноз витрат")).not.toBeInTheDocument();
    // ratio-as-number row also gone
    expect(
      screen.queryByText(/% від прогнозу за темпом/),
    ).not.toBeInTheDocument();
  });

  it("renders the UAH info button next to Витрати label", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(
      screen.getByRole("button", { name: "Про валюту в підрахунках" }),
    ).toBeInTheDocument();
  });

  it("shows forecast text when no plan is set", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.getByText(/до кінця місяця/)).toBeInTheDocument();
    expect(screen.getByText(/66 041/)).toBeInTheDocument();
  });

  it("shows plan-vs-spent bar when hasExpensePlan", () => {
    render(
      <MonthPulseCard
        {...baseProps}
        hasExpensePlan={true}
        planExpense={50000}
        spendPlanRatio={0.085}
      />,
    );
    // "9% з плану 50 000 ₴" — single bar with summary text
    expect(screen.getByText(/% з плану/)).toBeInTheDocument();
    expect(screen.getByText(/50 000/)).toBeInTheDocument();
  });

  it("shows recurring planned footer when applicable", () => {
    render(
      <MonthPulseCard
        {...baseProps}
        recurringOutThisMonth={1200}
        recurringInThisMonth={0}
        unknownOutCount={1}
      />,
    );
    expect(
      screen.getByText(/Враховано планових:.*1 200.*без суми/),
    ).toBeInTheDocument();
  });

  it("masks numbers when showBalance is false", () => {
    render(<MonthPulseCard {...baseProps} showBalance={false} />);
    expect(screen.getAllByText("••••").length).toBeGreaterThanOrEqual(2);
  });
});
