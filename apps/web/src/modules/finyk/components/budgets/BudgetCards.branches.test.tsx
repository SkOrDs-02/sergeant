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

    fireEvent.click(screen.getByRole("button", { name: /Порада Сержанта/ }));
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

    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "7500" },
    });
    expect(onChangeLimit).toHaveBeenCalledWith(7500);

    fireEvent.change(screen.getByLabelText("Період"), {
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
    expect(screen.getByText(/6\s?500 \/ 5\s?000 ₴/)).toBeInTheDocument();
  });

  // Р8 спеки аналітики v2: прогноз за темпом під фактом, лише коли він є.
  it("shows the pace forecast line only when a forecast exists", () => {
    const props = {
      budget: baseLimitBudget,
      categoryLabel: "Продукти",
      spent: 807.5,
      pctRaw: 161.5,
      pctRounded: 100,
      remaining: 0,
      isEditing: false,
      showProactiveAdvice: false,
      onBeginEdit: vi.fn(),
      onSave: vi.fn(),
      onDelete: vi.fn(),
    };
    const { unmount } = render(
      <LimitBudgetCard {...props} forecast={1009.375} />,
    );
    expect(
      screen.getByText(/За поточним темпом до кінця місяця/).textContent,
    ).toMatch(/~1\s?009/);
    unmount();

    render(<LimitBudgetCard {...props} forecast={null} />);
    expect(
      screen.queryByText(/За поточним темпом до кінця місяця/),
    ).not.toBeInTheDocument();
  });

  // PR-F3 (founder-UX audit wave 6, «Чесність показників»): the card never
  // accepted `showBalance` at all, so «Приховати суми» on Overview left the
  // «витрачено / ліміт» line and «Перевищено на» text visible on Планування.
  it("masks the spent/limit line and over-limit text when showBalance=false", () => {
    render(
      <LimitBudgetCard
        budget={baseLimitBudget}
        categoryLabel="Продукти"
        spent={6500}
        pctRaw={130}
        pctRounded={130}
        remaining={-1500}
        isEditing={false}
        showProactiveAdvice={false}
        showBalance={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/6\s?500 \/ 5\s?000 ₴/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Перевищено на/)).not.toBeInTheDocument();
    expect(screen.getAllByText("••••").length).toBeGreaterThanOrEqual(2);
  });

  it("masks the combo breakdown row amount when showBalance=false", () => {
    render(
      <LimitBudgetCard
        budget={{
          ...baseLimitBudget,
          categoryIds: ["food", "cafe"],
        }}
        categoryLabel="Продукти + ще 1"
        breakdown={[
          { categoryId: "food", label: "Продукти", spent: 3000 },
          { categoryId: "cafe", label: "Кафе", spent: 1200 },
        ]}
        spent={4200}
        pctRaw={84}
        pctRounded={84}
        remaining={800}
        isEditing={false}
        showProactiveAdvice={false}
        showBalance={false}
        onBeginEdit={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/3\s?000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\s?200/)).not.toBeInTheDocument();
  });
});

describe("MonthlyPlanCard", () => {
  it("opens the plan body, toggles edit mode, and updates each plan input", () => {
    const { onChangeMonthlyPlan } = renderMonthlyPlan();

    fireEvent.click(screen.getByRole("button", { name: /План на місяць/ }));
    expect(screen.getByText("План")).toBeInTheDocument();
    // `Money` розкладає суму на тири (знак / гривні / копійки / символ),
    // тож текст розбитий між вузлами і рядковий матчер його не бачить.
    // Звіряємо `textContent` контейнера — так само, як `TxRow.coverage`.
    //
    // AI-DANGER: пробіли тут НЕ звичайні. `\u00a0` — розрядний роздільник
    // від `formatNumberUk`, `\u202f` — вузький нерозривний перед
    // символом валюти (константа `NARROW_NBSP` у `Money`). Написати тут
    // звичайний пробіл — і тест не знайде нічого, хоча на екрані все
    // правильно. Escape-послідовності лишені навмисно видимими.
    expect(
      screen.getByText(
        (_, el) => el?.textContent === "500\u202f\u20b4/день · 12 дн.",
        { selector: "span" },
      ),
    ).toBeInTheDocument();

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
    expect(
      screen.getAllByText(
        // Ті самі нерозривні пробіли, що й вище: U+2212 як мінус,
        // U+00A0 у розрядах, U+202F перед ₴.
        (_, el) => el?.textContent === "\u22121\u00a0500\u202f\u20b4",
        { selector: "span" },
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Згорнути" }),
    ).toBeInTheDocument();
  });

  it("shows the plan pace forecast under the progress bar", () => {
    renderMonthlyPlan({ forecastExpense: 18750.4 });
    fireEvent.click(screen.getByRole("button", { name: /План на місяць/ }));
    expect(
      screen.getByText(/За поточним темпом до кінця місяця/).textContent,
    ).toMatch(/~18\s?750/);
  });

  // PR-F3 (founder-UX audit wave 6, «Чесність показників»): the card never
  // accepted `showBalance`, so the collapsed-header pill and the expanded
  // Plan/Fact/Δ grid stayed visible after «Приховати суми» on Overview.
  it("masks the Plan/Fact/Δ grid and safe-per-day line when showBalance=false", () => {
    renderMonthlyPlan({ showBalance: false });
    fireEvent.click(screen.getByRole("button", { name: /План на місяць/ }));
    // The safe-per-day hint ("500 ₴/день") must not leak.
    expect(
      screen.queryByText((_, el) => el?.textContent === "500 ₴/день · 12 дн.", {
        selector: "span",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("••••").length).toBeGreaterThanOrEqual(2);
  });

  it("masks the collapsed-header summary pill when showBalance=false", () => {
    renderMonthlyPlan({ showBalance: false });
    // Collapsed by default — the header pill is the only visible summary.
    expect(screen.getByText("••••")).toBeInTheDocument();
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
