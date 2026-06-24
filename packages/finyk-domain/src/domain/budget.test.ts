import { describe, it, expect } from "vitest";
import {
  BUDGET_ALERT_THRESHOLD,
  BUDGET_WARN_THRESHOLD,
  buildAtRiskKey,
  calculateGoalProgress,
  calculateLimitUsage,
  calculateRemainingBudget,
  calculateSafeToSpendPerDay,
  calculateTotalExpenseFact,
  getCurrentMonthContext,
  getGoalBudgets,
  getGoalMonthlyLabel,
  getLimitBudgets,
  getMonthlyPlanUsage,
  isBudgetAlert,
  selectAtRiskForecasts,
  shouldShowProactiveAdvice,
  validateGoalBudgetForm,
  validateLimitBudgetForm,
} from "./budget";

describe("budget: split helpers", () => {
  it("getLimitBudgets / getGoalBudgets filter by type", () => {
    const list = [
      { id: "a", type: "limit" },
      { id: "b", type: "goal" },
      { id: "c", type: "limit" },
      { id: "d" },
    ] as never;
    expect(getLimitBudgets(list)).toHaveLength(2);
    expect(getGoalBudgets(list).map((b) => b.id)).toEqual(["b"]);
    expect(getLimitBudgets(null)).toEqual([]);
  });
});

describe("budget: limit usage", () => {
  it("calculateRemainingBudget caps pct and returns remaining", () => {
    expect(calculateRemainingBudget({ limit: 100 }, 30)).toEqual({
      remaining: 70,
      pct: 30,
      isOver: false,
    });
    expect(calculateRemainingBudget({ limit: 100 }, 150)).toEqual({
      remaining: 0,
      pct: 100,
      isOver: true,
    });
    expect(calculateRemainingBudget({ limit: 0 }, 10).pct).toBe(0);
  });

  it("calculateLimitUsage flags overLimit and warnLimit", () => {
    const ok = calculateLimitUsage({ limit: 100 }, 50);
    expect(ok.pctRaw).toBe(50);
    expect(ok.pctRounded).toBe(50);
    expect(ok.overLimit).toBe(false);
    expect(ok.warnLimit).toBe(false);

    const warn = calculateLimitUsage({ limit: 100 }, 85);
    expect(warn.warnLimit).toBe(true);
    expect(warn.overLimit).toBe(false);

    const over = calculateLimitUsage({ limit: 100 }, 150);
    expect(over.overLimit).toBe(true);
    expect(over.warnLimit).toBe(false);
    expect(over.exceededBy).toBe(50);
    expect(over.pctRounded).toBe(100);
  });

  it("calculateSafeToSpendPerDay returns 0 when no days left", () => {
    expect(calculateSafeToSpendPerDay(1000, 0)).toBe(0);
    expect(calculateSafeToSpendPerDay(1000, -3)).toBe(0);
    expect(calculateSafeToSpendPerDay(1000, 4)).toBe(250);
  });
});

describe("budget: rules", () => {
  it("isBudgetAlert uses the 60% threshold by default", () => {
    expect(isBudgetAlert(59, 100)).toBe(false);
    expect(isBudgetAlert(60, 100)).toBe(true);
    expect(isBudgetAlert(10, 0)).toBe(false);
    expect(BUDGET_ALERT_THRESHOLD).toBeCloseTo(0.6);
  });

  it("shouldShowProactiveAdvice triggers on >=80% or forecast overLimit", () => {
    expect(
      shouldShowProactiveAdvice({ pctRaw: 70 }, { overLimit: false }),
    ).toBe(false);
    expect(shouldShowProactiveAdvice({ pctRaw: 80 }, null)).toBe(true);
    expect(shouldShowProactiveAdvice({ pctRaw: 10 }, { overLimit: true })).toBe(
      true,
    );
    expect(BUDGET_WARN_THRESHOLD).toBeCloseTo(0.8);
  });

  it("selectAtRiskForecasts picks overLimit + warn threshold", () => {
    const fcs = [
      { categoryId: "a", limit: 100, spent: 20, overLimit: false },
      { categoryId: "b", limit: 100, spent: 85, overLimit: false },
      { categoryId: "c", limit: 0, spent: 0, overLimit: false },
      { categoryId: "d", limit: 100, spent: 120, overLimit: true },
    ];
    expect(selectAtRiskForecasts(fcs).map((f) => f.categoryId)).toEqual([
      "b",
      "d",
    ]);
    expect(selectAtRiskForecasts(null)).toEqual([]);
  });

  it("buildAtRiskKey is deterministic YYYY-MM|sorted,ids", () => {
    const fcs = [
      { categoryId: "food", limit: 100, spent: 90, overLimit: false },
      { categoryId: "travel", limit: 100, spent: 120, overLimit: true },
    ];
    const now = new Date(2024, 2, 15);
    expect(buildAtRiskKey(fcs, now)).toBe("2024-03|food,travel");
    expect(buildAtRiskKey([], now)).toBe("");
  });
});

describe("budget: goal progress", () => {
  it("calculates pct, daysLeft and monthly label", () => {
    const progress = calculateGoalProgress(
      { targetAmount: 10000, savedAmount: 5000 },
      new Date(2024, 2, 15),
    );
    expect(progress.pct).toBe(50);
    expect(progress.saved).toBe(5000);
    expect(progress.daysLeft).toBeNull();
    expect(getGoalMonthlyLabel(progress)).toBeNull();

    const done = calculateGoalProgress(
      { targetAmount: 100, savedAmount: 100 },
      new Date(2024, 2, 15),
    );
    expect(done.pct).toBe(100);
    expect(getGoalMonthlyLabel(done)).toMatch(/досягнута/);
  });
});

describe("budget: month context and totals", () => {
  it("getCurrentMonthContext returns consistent days", () => {
    const ctx = getCurrentMonthContext(new Date(2024, 2, 10));
    expect(ctx.daysInMonth).toBe(31);
    expect(ctx.daysPassed).toBe(10);
    expect(ctx.daysLeft).toBe(21);
  });

  it("getCurrentMonthContext anchors the day window to Europe/Kyiv", () => {
    // 2024-03-10 23:30 UTC is already 2024-03-11 01:30 in Kyiv (UTC+2), so the
    // month context must report the Kyiv civil day (11), not the UTC day (10).
    // Absolute-instant input → assertion holds regardless of the host timezone.
    const ctx = getCurrentMonthContext(new Date("2024-03-10T23:30:00Z"));
    expect(ctx.daysPassed).toBe(11);
    expect(ctx.daysInMonth).toBe(31);
    expect(ctx.daysLeft).toBe(20);
  });

  it("calculateTotalExpenseFact sums absolute expenses in UAH", () => {
    // tx.amount is stored in minor units (копійки) and may be negative for expenses.
    const txs = [
      { id: "a", amount: -12340 }, // 123.40 ₴
      { id: "b", amount: 5000 }, // income — ignored
      { id: "c", amount: -5060 }, // 50.60 ₴
      null,
    ] as never;
    expect(calculateTotalExpenseFact(txs)).toBe(Math.round(123.4 + 50.6));
  });

  it("getMonthlyPlanUsage returns safe-per-day and isOver flag", () => {
    const usage = getMonthlyPlanUsage(
      { planIncome: 1000, planExpense: 500, totalFact: 200 },
      new Date(2024, 2, 10),
    );
    expect(usage.remaining).toBe(300);
    expect(usage.pctExpense).toBe(40);
    expect(usage.isOver).toBe(false);
    expect(usage.safePerDay).toBeGreaterThan(0);

    const over = getMonthlyPlanUsage(
      { planExpense: 100, totalFact: 200 },
      new Date(2024, 2, 10),
    );
    expect(over.isOver).toBe(true);
    expect(over.remaining).toBe(0);
  });
});

describe("budget: form validators", () => {
  it("validateLimitBudgetForm rejects missing/duplicate/invalid", () => {
    expect(validateLimitBudgetForm({}).error).toMatch(/категорію/);
    expect(
      validateLimitBudgetForm({ categoryId: "food", limit: 0 }).error,
    ).toMatch(/ліміт/i);
    expect(
      validateLimitBudgetForm({ categoryId: "food", limit: "abc" }).error,
    ).toBeTruthy();
    expect(
      validateLimitBudgetForm({ categoryId: "food", limit: 100 }, [
        { type: "limit", categoryId: "food" } as never,
      ]).error,
    ).toMatch(/вже існує/);
    const ok = validateLimitBudgetForm({ categoryId: "food", limit: "100" });
    expect(ok.error).toBeNull();
    expect(ok.normalized).toMatchObject({
      type: "limit",
      categoryId: "food",
      limit: 100,
    });
  });

  it("validateGoalBudgetForm rejects missing/invalid", () => {
    expect(validateGoalBudgetForm({ name: "" }).error).toMatch(/назву/);
    expect(
      validateGoalBudgetForm({ name: "Car", targetAmount: 0 }).error,
    ).toMatch(/суму/);
    expect(
      validateGoalBudgetForm({
        name: "Car",
        targetAmount: 100,
        savedAmount: -5,
      }).error,
    ).toBeTruthy();
    const ok = validateGoalBudgetForm({
      name: "Car",
      targetAmount: "10000",
      savedAmount: "2000",
    });
    expect(ok.error).toBeNull();
    expect(ok.normalized).toMatchObject({
      type: "goal",
      targetAmount: 10000,
      savedAmount: 2000,
    });
  });
});
