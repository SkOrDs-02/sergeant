// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LimitBudgetCard } from "./LimitBudgetCard";
import { MonthlyPlanCard, type MonthlyPlan } from "./MonthlyPlanCard";

const baseLimitBudget = {
  id: "limit-food",
  type: "limit" as const,
  categoryId: "food",
  limit: 5000,
  period: "month" as const,
};

function renderMonthlyPlan(
  overrides: Partial<Parameters<typeof MonthlyPlanCard>[0]> = {},
) {
  const onChangeMonthlyPlan = vi.fn();
  render(
    <MonthlyPlanCard
      monthlyPlan={{ income: 30000, expense: 18000, savings: 4000 }}
      onChangeMonthlyPlan={onChangeMonthlyPlan}
      planIncome={30000}
      planExpense={18000}
      planSavings={4000}
      totalExpenseFact={12000}
      factIncome={32000}
      factSavings={5000}
      remaining={6000}
      safePerDay={500}
      pctExpense={67}
      isOver={false}
      daysLeft={12}
      {...overrides}
    />,
  );
  return { onChangeMonthlyPlan };
}

describe("LimitBudgetCard", () => {
  it("renders warning advice, toggles it, and dismisses it", () => {
    const onBeginEdit = vi.fn();
    const onDismissAdvice = vi.fn();

    render(
      <LimitBudgetCard
        budget={baseLimitBudget}
        categoryLabel="Продукти"
        spent={4200}
        pctRaw={84}
        pctRounded={84}
        remaining={800}
        isEditing={false}
        showProactiveAdvice
        proactiveText="Зменши каву на цьому тижні."
        onDismissAdvice={onDismissAdvice}
        onBeginEdit={onBeginEdit}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Продукти")).toBeInTheDocument();
    expect(screen.getByText("Зменши каву на цьому тижні.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AI-порада/ }));
    expect(
      screen.queryByText("Зменши каву на цьому тижні."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    expect(onDismissAdvice).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Редагувати ліміт" }));
    expect(onBeginEdit).toHaveBeenCalledTimes(1);
  });

  it("renders the editing form and emits limit/period/save/delete actions", () => {
    const onChangeLimit = vi.fn();
    const onChangePeriod = vi.fn();
    const onSave = vi.fn();
    const onDelete = vi.fn();

    render(
      <LimitBudgetCard
        budget={{ ...baseLimitBudget, period: "week" }}
        categoryLabel="Продукти"
        spent={100}
        pctRaw={10}
        pctRounded={10}
        remaining={4900}
        isEditing
        showProactiveAdvice={false}
        onBeginEdit={vi.fn()}
        onChangeLimit={onChangeLimit}
        onChangePeriod={onChangePeriod}
        onSave={onSave}
        onDelete={onDelete}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Ліміт ₴"), {
      target: { value: "7500" },
    });
    expect(onChangeLimit).toHaveBeenCalledWith(7500);

    fireEvent.change(screen.getByLabelText("Період ліміту"), {
      target: { value: "one_time" },
    });
    expect(onChangePeriod).toHaveBeenCalledWith("one_time");

    fireEvent.click(screen.getByText("Зберегти"));
    fireEvent.click(screen.getByText("Видалити"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders over-limit and loading-advice states", () => {
    render(
      <LimitBudgetCard
        budget={{ ...baseLimitBudget, period: "one_time" }}
        categoryLabel={null}
        spent={6500}
        pctRaw={130}
        pctRounded={130}
        remaining={-1500}
        isEditing={false}
        showProactiveAdvice
        proactiveLoading
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Одноразовий")).toBeInTheDocument();
    expect(screen.getByText(/Перевищено на/)).toBeInTheDocument();
    expect(screen.getByText(/6\s?500 \/ 5000 ₴/)).toBeInTheDocument();
  });
});

describe("MonthlyPlanCard", () => {
  it("opens the plan body, toggles edit mode, and updates each plan input", () => {
    const { onChangeMonthlyPlan } = renderMonthlyPlan();

    fireEvent.click(screen.getByRole("button", { name: /Фінплан на місяць/ }));
    expect(screen.getByText("План")).toBeInTheDocument();
    expect(screen.getByText(/500 ₴\/день · 12 дн\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Редагувати" }));

    fireEvent.change(screen.getByLabelText("План доходу"), {
      target: { value: "35000" },
    });
    fireEvent.change(screen.getByLabelText("План витрат"), {
      target: { value: "20000" },
    });
    fireEvent.change(screen.getByLabelText("План накопичень"), {
      target: { value: "7000" },
    });

    const updaters = onChangeMonthlyPlan.mock.calls.map(
      ([updater]) => updater as (plan: MonthlyPlan) => MonthlyPlan,
    );
    expect(updaters[0]!({ income: 1, expense: 2, savings: 3 })).toMatchObject({
      income: expect.any(String),
    });
    expect(updaters[1]!({ income: 1, expense: 2, savings: 3 })).toMatchObject({
      expense: expect.any(String),
    });
    expect(updaters[2]!({ income: 1, expense: 2, savings: 3 })).toMatchObject({
      savings: expect.any(String),
    });
  });

  it("starts open for first-run hints and handles an over-budget plan", () => {
    const onDismissFirstRunHint = vi.fn();

    renderMonthlyPlan({
      firstRunHint: true,
      onDismissFirstRunHint,
      monthlyPlan: null,
      planIncome: 0,
      planExpense: 5000,
      planSavings: 0,
      totalExpenseFact: 6500,
      factIncome: 0,
      factSavings: -500,
      remaining: -1500,
      safePerDay: 0,
      pctExpense: 130,
      isOver: true,
      daysLeft: 5,
    });

    expect(screen.getByText(/Орієнтовний фінплан/)).toBeInTheDocument();
    expect(screen.getAllByText(/−1 500 ₴/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Згорнути" }),
    ).toBeInTheDocument();
  });

  it("shows the empty collapsed state for a missing plan", () => {
    renderMonthlyPlan({
      monthlyPlan: null,
      planIncome: 0,
      planExpense: 0,
      planSavings: 0,
      totalExpenseFact: 0,
      factIncome: 0,
      factSavings: 0,
      remaining: 0,
      safePerDay: 0,
      pctExpense: 0,
    });

    expect(screen.getByText("Не заданий")).toBeInTheDocument();
  });
});
