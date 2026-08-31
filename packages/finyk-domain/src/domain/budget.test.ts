import { describe, it, expect } from "vitest";
import {
  BUDGET_ALERT_THRESHOLD,
  BUDGET_WARN_THRESHOLD,
  buildAtRiskKey,
  calculateGoalProgress,
  calculateGoalSavedAmount,
  calculateLimitUsage,
  calculateSafeToSpendPerDay,
  calculateTotalExpenseFact,
  getCurrentMonthContext,
  getGoalBudgets,
  getGoalMonthlyLabel,
  getLimitBudgets,
  getMonthlyPlanUsage,
  isBudgetAlert,
  migrateGoalSavedAmountToContribution,
  selectAtRiskForecasts,
  shouldShowProactiveAdvice,
  sumGoalContributions,
  validateGoalBudgetForm,
  validateLimitBudgetForm,
  getLimitPeriodRange,
  normalizeLimitBudget,
  filterTransactionsForLimitPeriod,
  findLimitCategoryOverlaps,
  formatLimitBudgetLabel,
  isSameLimitCategorySet,
  limitBudgetCategoryIds,
  limitBudgetCategoryKey,
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

describe("budget: limit periods", () => {
  it("normalizes legacy limits to a monthly period", () => {
    expect(
      normalizeLimitBudget({
        id: "legacy",
        type: "limit",
        categoryId: "food",
        limit: 1000,
      }),
    ).toMatchObject({ period: "month" });
  });

  it("builds Kyiv-aware month, week and one-time ranges", () => {
    const now = new Date("2026-07-16T21:30:00Z");
    expect(getLimitPeriodRange({ period: "month" }, now).startMs).toBe(
      Date.UTC(2026, 5, 30, 21),
    );
    expect(getLimitPeriodRange({ period: "week" }, now).startMs).toBe(
      Date.UTC(2026, 6, 12, 21),
    );
    expect(
      getLimitPeriodRange(
        { period: "one_time", createdAt: "2026-07-10T12:00:00.000Z" },
        now,
      ).startMs,
    ).toBe(Date.parse("2026-07-10T12:00:00.000Z"));
  });

  it("рахує сьогоднішній ручний запис, доданий до 15:00 за Києвом", () => {
    // Ручна витрата не має реального інстанта: форма штампує день о 12:00
    // UTC. З межею вікна на `now` така витрата лежала в майбутньому і
    // випадала з власного ліміту цілий ранок.
    const today = [{ id: "manual-today", date: "2026-07-16T12:00:00.000Z" }];
    expect(
      filterTransactionsForLimitPeriod(
        today,
        { period: "month" },
        new Date("2026-07-16T06:00:00Z"),
      ).map((item) => item.id),
    ).toEqual(["manual-today"]);
  });

  it("не рахує записи завтрашнім днем", () => {
    const tomorrow = [
      { id: "manual-tomorrow", date: "2026-07-17T12:00:00.000Z" },
    ];
    expect(
      filterTransactionsForLimitPeriod(
        tomorrow,
        { period: "month" },
        new Date("2026-07-16T06:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("filters transactions to the selected limit period", () => {
    const tx = [
      { id: "old", time: Date.parse("2026-07-12T20:59:59Z") / 1000 },
      { id: "week", time: Date.parse("2026-07-12T21:00:00Z") / 1000 },
    ];
    expect(
      filterTransactionsForLimitPeriod(
        tx,
        { period: "week" },
        new Date("2026-07-16T12:00:00Z"),
      ).map((item) => item.id),
    ).toEqual(["week"]);
  });
});

describe("budget: limit usage", () => {
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

describe("budget: goal saved amount (jar + contributions)", () => {
  it("sumGoalContributions sums amountUah, ignoring bad entries", () => {
    expect(sumGoalContributions(undefined)).toBe(0);
    expect(sumGoalContributions(null)).toBe(0);
    expect(sumGoalContributions([])).toBe(0);
    expect(
      sumGoalContributions([
        { id: "1", amountUah: 500, date: "2026-01-01" },
        { id: "2", amountUah: 250.5, date: "2026-01-02", note: "готівка" },
      ]),
    ).toBe(750.5);
  });

  it("calculateGoalSavedAmount = jar balance + contributions when a jar is linked", () => {
    const saved = calculateGoalSavedAmount({
      linkedJarBalanceUah: 1000,
      contributions: [{ id: "1", amountUah: 200, date: "2026-01-01" }],
    });
    expect(saved).toBe(1200);
  });

  it("calculateGoalSavedAmount = sum of contributions only when there is no jar", () => {
    const saved = calculateGoalSavedAmount({
      contributions: [
        { id: "1", amountUah: 300, date: "2026-01-01" },
        { id: "2", amountUah: 100, date: "2026-01-05" },
      ],
    });
    expect(saved).toBe(400);
  });

  it("calculateGoalSavedAmount is 0 for a goal with neither jar nor contributions", () => {
    expect(calculateGoalSavedAmount({})).toBe(0);
  });

  it("deleting a contribution recalculates the total (caller filters, then re-sums)", () => {
    const contributions = [
      { id: "1", amountUah: 300, date: "2026-01-01" },
      { id: "2", amountUah: 100, date: "2026-01-05" },
    ];
    const afterDelete = contributions.filter((c) => c.id !== "2");
    expect(sumGoalContributions(afterDelete)).toBe(300);
  });
});

describe("budget: migrateGoalSavedAmountToContribution", () => {
  const baseGoal = {
    id: "g1",
    type: "goal" as const,
    name: "Відпустка",
    targetAmount: 10000,
    savedAmount: 3000,
    contributions: [],
  };

  it("converts an existing savedAmount into the first contribution entry", () => {
    const migrated = migrateGoalSavedAmountToContribution(
      baseGoal,
      "2026-07-26",
    );
    expect(migrated.contributions).toHaveLength(1);
    expect(migrated.contributions[0]).toMatchObject({
      amountUah: 3000,
      date: "2026-07-26",
      note: "Початковий залишок",
    });
    // savedAmount lives on untouched — deprecated, but preserved for
    // back-compat readers of old snapshots.
    expect(migrated.savedAmount).toBe(3000);
  });

  it("is a no-op (idempotent) once contributions already exist", () => {
    const already = {
      ...baseGoal,
      contributions: [{ id: "existing", amountUah: 500, date: "2026-01-01" }],
    };
    const migrated = migrateGoalSavedAmountToContribution(
      already,
      "2026-07-26",
    );
    expect(migrated).toBe(already);
  });

  it("does not fabricate a contribution for savedAmount <= 0", () => {
    const zero = { ...baseGoal, savedAmount: 0 };
    const migrated = migrateGoalSavedAmountToContribution(zero, "2026-07-26");
    expect(migrated.contributions).toEqual([]);
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

  it("getCurrentMonthContext anchors monthStart to Kyiv midnight, not the host clock (§1.10)", () => {
    const ctx = getCurrentMonthContext(new Date("2024-03-10T23:30:00Z"));
    // 2024-03-01 00:00 Kyiv (EET, UTC+2 before the spring DST switch) is
    // 2024-02-29T22:00:00Z, not a host-local midnight of any calendar day.
    expect(ctx.monthStart.toISOString()).toBe("2024-02-29T22:00:00.000Z");
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

describe("budget: multi-category limits", () => {
  it("limitBudgetCategoryIds falls back to legacy categoryId and dedupes", () => {
    expect(limitBudgetCategoryIds({ categoryId: "food" })).toEqual(["food"]);
    expect(
      limitBudgetCategoryIds({
        categoryId: "food",
        categoryIds: ["food", "restaurant", "food"],
      }),
    ).toEqual(["food", "restaurant"]);
    expect(limitBudgetCategoryIds({ categoryId: "" })).toEqual([]);
  });

  it("normalizeLimitBudget keeps categoryId in sync with the first of categoryIds", () => {
    const combo = normalizeLimitBudget({
      id: "b1",
      type: "limit",
      categoryId: "stale",
      categoryIds: ["food", "restaurant"],
      limit: 20000,
    });
    expect(combo.categoryIds).toEqual(["food", "restaurant"]);
    expect(combo.categoryId).toBe("food");

    const legacy = normalizeLimitBudget({
      id: "b2",
      type: "limit",
      categoryId: "transport",
      limit: 3000,
    });
    expect(legacy.categoryIds).toEqual(["transport"]);
    expect(legacy.categoryId).toBe("transport");
  });

  it("limitBudgetCategoryKey is order-insensitive", () => {
    expect(
      limitBudgetCategoryKey({
        categoryId: "food",
        categoryIds: ["restaurant", "food"],
      }),
    ).toBe("food+restaurant");
    expect(limitBudgetCategoryKey({ categoryId: "food" })).toBe("food");
  });

  it("isSameLimitCategorySet compares sets, not order", () => {
    expect(isSameLimitCategorySet(["a", "b"], ["b", "a"])).toBe(true);
    expect(isSameLimitCategorySet(["a"], ["a", "b"])).toBe(false);
    expect(isSameLimitCategorySet(["a", "c"], ["a", "b"])).toBe(false);
  });

  it("formatLimitBudgetLabel: custom label → single → «A + B» → «A + ще N»", () => {
    const resolve = (id: string) =>
      ({ food: "Продукти", restaurant: "Кафе", transport: "Транспорт" })[id];
    expect(
      formatLimitBudgetLabel(
        {
          label: "Їжа",
          categoryId: "food",
          categoryIds: ["food", "restaurant"],
        },
        resolve,
      ),
    ).toBe("Їжа");
    expect(formatLimitBudgetLabel({ categoryId: "food" }, resolve)).toBe(
      "Продукти",
    );
    expect(
      formatLimitBudgetLabel(
        { categoryId: "food", categoryIds: ["food", "restaurant"] },
        resolve,
      ),
    ).toBe("Продукти + Кафе");
    expect(
      formatLimitBudgetLabel(
        {
          categoryId: "food",
          categoryIds: ["food", "restaurant", "transport"],
        },
        resolve,
      ),
    ).toBe("Продукти + ще 2");
    // Нерезолвнутий id деградує до самого id, а не в порожнечу.
    expect(formatLimitBudgetLabel({ categoryId: "custom_x" }, resolve)).toBe(
      "custom_x",
    );
  });

  it("findLimitCategoryOverlaps returns shared ids per existing limit", () => {
    const existing = [
      { id: "b1", type: "limit", categoryId: "restaurant", limit: 12000 },
      {
        id: "b2",
        type: "limit",
        categoryId: "food",
        categoryIds: ["food", "transport"],
        limit: 9000,
      },
      { id: "g1", type: "goal", name: "Ціль", targetAmount: 1 },
    ] as never;
    const overlaps = findLimitCategoryOverlaps(
      ["food", "restaurant"],
      existing,
    );
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]?.budget.id).toBe("b1");
    expect(overlaps[0]?.categoryIds).toEqual(["restaurant"]);
    expect(overlaps[1]?.budget.id).toBe("b2");
    expect(overlaps[1]?.categoryIds).toEqual(["food"]);
    // excludeBudgetId — для редагування власного ліміту.
    expect(
      findLimitCategoryOverlaps(["restaurant"], existing, {
        excludeBudgetId: "b1",
      }),
    ).toEqual([]);
  });

  it("validateLimitBudgetForm blocks only the EXACT same category set", () => {
    const existing = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        categoryIds: ["food", "restaurant"],
        limit: 20000,
      },
    ] as never;
    // Точний збіг набору (в іншому порядку) — дублікат.
    expect(
      validateLimitBudgetForm(
        { categoryIds: ["restaurant", "food"], limit: 500 },
        existing,
      ).error,
    ).toBe("Ліміт для цього набору категорій вже існує");
    // Частковий перетин — дозволено.
    const partial = validateLimitBudgetForm(
      { categoryIds: ["restaurant"], limit: 500 },
      existing,
    );
    expect(partial.error).toBeNull();
    expect(partial.normalized).toMatchObject({
      categoryId: "restaurant",
      categoryIds: ["restaurant"],
    });
    // Legacy-вхід із самим categoryId нормалізується в categoryIds.
    const legacy = validateLimitBudgetForm({
      categoryId: "transport",
      limit: 100,
    });
    expect(legacy.normalized).toMatchObject({
      categoryId: "transport",
      categoryIds: ["transport"],
    });
    // Порожній набір — стара помилка.
    expect(validateLimitBudgetForm({ categoryIds: [], limit: 100 }).error).toBe(
      "Оберіть категорію",
    );
  });
});
