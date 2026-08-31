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
    recurringOutThisMonth: 0,
    recurringInThisMonth: 0,
    unknownOutCount: 0,
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

  it("renders date heading, spent + income pair", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.getByText("2 травня")).toBeInTheDocument();
    expect(screen.getByText("Витрати")).toBeInTheDocument();
    expect(screen.getByText("Дохід")).toBeInTheDocument();
    // Сума набрана `Money`: розряди й символ — окремі вузли (П4).
    expect(money("4 261 ₴")).toBeInTheDocument();
  });

  /**
   * Службове слово «Місяць» прибрано: дата поруч уже каже те саме, а зайвий
   * тир робив шапку двошаровою там, де потрібен один рядок.
   */
  it("does not repeat the word Місяць next to the date", () => {
    render(<MonthPulseCard {...baseProps} />);
    expect(screen.queryByText("Місяць")).not.toBeInTheDocument();
  });

  /**
   * Підпис іде ПІД числом, а не над ним — число має зустрічати око першим.
   * Перевіряємо порядок у DOM, а не сам факт наявності обох вузлів: до цієї
   * зміни обидва теж були на місці, просто в іншому порядку.
   */
  it("puts the caption after its number, not before", () => {
    render(<MonthPulseCard {...baseProps} income={12000} />);
    for (const [amount, caption] of [
      ["4 261 ₴", "Витрати"],
      ["+12 000 ₴", "Дохід"],
    ] as const) {
      const position = money(amount).compareDocumentPosition(
        screen.getByText(caption),
      );
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  /**
   * Один приглушений сірий на картку. До цього підписи були `text-subtle`, а
   * нотатки нижче — `text-muted`: два відтінки для однієї ролі читаються не
   * як два рівні, а як неохайність.
   */
  it("uses a single muted grey across the card", () => {
    const { container } = render(<MonthPulseCard {...baseProps} />);
    expect(container.querySelector(".text-subtle")).toBeNull();
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
    expect(money("−1 200 ₴")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          /Враховано планових:/.test(el.textContent ?? "") &&
          /без суми/.test(el.textContent ?? ""),
      ),
    ).toBeInTheDocument();
  });

  it("says the forecast was capped when projectedSpendCapped is true", () => {
    render(<MonthPulseCard {...baseProps} projectedSpendCapped={true} />);
    expect(
      screen.getByText(/Прогноз обмежений залишком коштів/),
    ).toBeInTheDocument();
  });

  it("does not mention the cap when projectedSpendCapped is false", () => {
    render(<MonthPulseCard {...baseProps} projectedSpendCapped={false} />);
    expect(
      screen.queryByText(/Прогноз обмежений залишком коштів/),
    ).not.toBeInTheDocument();
  });

  it("masks numbers when showBalance is false", () => {
    render(<MonthPulseCard {...baseProps} showBalance={false} />);
    expect(screen.getAllByText("••••").length).toBeGreaterThanOrEqual(2);
  });
});
