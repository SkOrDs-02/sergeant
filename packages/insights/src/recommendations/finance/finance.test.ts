// Per-rule тести для модуля Finyk. Доводимо цінність реєстру: правило можна
// юніт-тестити без LS-мокінгу цілого engine.
import { describe, it, expect } from "vitest";
import {
  calculateLimitUsage,
  type LimitUsageEntry,
} from "@sergeant/finyk-domain/domain/budget";
import { budgetLimitsRule } from "./budgetLimits.js";
import { frequentNoBudgetRule } from "./frequentNoBudget.js";
import { goalProgressRule } from "./goalProgress.js";
import { noTxRecentRule } from "./noTxRecent.js";
import { dailyVsWeeklyPaceRule } from "./dailyVsWeeklyPace.js";

function baseCtx(overrides = {}) {
  return {
    now: new Date("2025-06-15T12:00:00Z"),
    monthStart: new Date("2025-06-01T00:00:00Z"),
    transactions: [],
    manualExpenses: [],
    budgets: [],
    limits: [],
    txCategories: {},
    customCategories: [],
    hiddenTxIds: new Set<string>(),
    transferIds: new Set<string>(),
    thisMonthTx: [],
    limitUsage: [],
    canonicalMonthSpend: new Map(),
    canonicalTotalCount: new Map(),
    ...overrides,
  };
}

// Стан ліміту так, як його віддає `calcLimitUsages` у finyk-domain; правило
// не рахує нічого саме, тож тест сіє готовий результат.
function usage(
  budget: {
    id: string;
    categoryId: string;
    categoryIds?: string[];
    label?: string;
    limit: number;
  },
  spent: number,
): LimitUsageEntry {
  const categoryIds = budget.categoryIds ?? [budget.categoryId];
  return {
    ...calculateLimitUsage(budget, spent),
    budget: { type: "limit", ...budget },
    categoryIds,
    key: categoryIds.join("+"),
  };
}

describe("budgetLimitsRule", () => {
  it("генерує over при >=100% ліміту", () => {
    const ctx = baseCtx({
      limitUsage: [usage({ id: "b", categoryId: "food", limit: 500 }, 900)],
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_over_food");
    expect(recs[0]?.priority).toBeGreaterThanOrEqual(80);
    expect(recs[0]?.severity).toBe("danger");
    // Over-budget тягне pwaAction, щоб одним тапом дописати ще свіжі витрати.
    expect(recs[0]?.pwaAction).toBe("add_expense");
  });

  it("warn-стадія НЕ тягне pwaAction (review-only)", () => {
    const ctx = baseCtx({
      limitUsage: [usage({ id: "b", categoryId: "cafe", limit: 100 }, 95)],
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_warn_cafe");
    expect(recs[0]?.severity).toBe("warning");
    expect(recs[0]?.pwaAction).toBeUndefined();
  });

  it("генерує warn при 90..99%", () => {
    const ctx = baseCtx({
      limitUsage: [usage({ id: "b", categoryId: "cafe", limit: 100 }, 95)],
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_warn_cafe");
  });

  it("бере відсоток з `limitUsage`, того самого, що й картка ліміту", () => {
    const ctx = baseCtx({
      limitUsage: [usage({ id: "b", categoryId: "smoking", limit: 500 }, 590)],
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_over_smoking");
    // 590/500 = 1.18 → перевищено на 18%
    expect(recs[0]?.title).toContain("18%");
  });

  it("не округлює факт до відсотка: 807,50 з 500 → перевищено на 62%", () => {
    // Сліпий замір 2026-09-24: та сама сума, що й на картці «Перевищено на
    // 307,50 ₴», без проміжного округлення до 808.
    const ctx = baseCtx({
      limitUsage: [usage({ id: "b", categoryId: "food", limit: 500 }, 807.5)],
    });
    const rec = budgetLimitsRule.evaluate(ctx)[0];
    expect(rec?.title).toContain("62%");
    expect(rec?.body).toContain("808 ₴ з 500 ₴");
  });

  it("мульти-категорійний ліміт: ключує rec набором і показує власну назву", () => {
    const ctx = baseCtx({
      limitUsage: [
        usage(
          {
            id: "b",
            categoryId: "food",
            categoryIds: ["food", "restaurant"],
            label: "Їжа",
            limit: 1000,
          },
          1100,
        ),
      ],
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_over_food+restaurant");
    expect(recs[0]?.title).toContain('"Їжа"');
  });

  it("показує кастомний label у бюджетному ліміті", () => {
    const ctx = baseCtx({
      customCategories: [{ id: "pets", label: "Песики" }],
      limitUsage: [usage({ id: "b", categoryId: "pets", limit: 100 }, 95)],
    });

    const rec = budgetLimitsRule.evaluate(ctx)[0];
    expect(rec?.id).toBe("budget_warn_pets");
    expect(rec?.title).toContain('"Песики"');
  });

  it("додає actionHash з категорією для глибокого лінка на Планування", () => {
    const ctx = baseCtx({
      limitUsage: [usage({ id: "b", categoryId: "smoking", limit: 100 }, 95)],
    });
    const rec = budgetLimitsRule.evaluate(ctx)[0];
    expect(rec?.actionHash).toBe("budgets?cat=smoking");
  });

  it("нічого не повертає при 0 лімітах", () => {
    expect(budgetLimitsRule.evaluate(baseCtx())).toEqual([]);
  });
});

describe("frequentNoBudgetRule", () => {
  it("повертає підказку для найчастішої категорії без ліміту", () => {
    const ctx = baseCtx({
      canonicalTotalCount: new Map([
        ["food", 10],
        ["transport", 3],
      ]),
      canonicalMonthSpend: new Map([["food", 1500]]),
    });
    const recs = frequentNoBudgetRule.evaluate(ctx);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.id).toBe("finyk_frequent_no_budget_food");
    expect(recs[0]?.title).toContain("Продукти");
    expect(recs[0]?.body).toContain("1");
  });

  it("пропускає категорії, для яких уже є ліміт", () => {
    const ctx = baseCtx({
      limits: [{ id: "b", type: "limit", categoryId: "food", limit: 500 }],
      canonicalTotalCount: new Map([["food", 20]]),
    });
    expect(frequentNoBudgetRule.evaluate(ctx)).toEqual([]);
  });

  it("не тригериться, якщо максимум <5 використань", () => {
    const ctx = baseCtx({
      canonicalTotalCount: new Map([["food", 4]]),
    });
    expect(frequentNoBudgetRule.evaluate(ctx)).toEqual([]);
  });

  it("підхоплює кастомний label", () => {
    const ctx = baseCtx({
      canonicalTotalCount: new Map([["myId", 7]]),
      customCategories: [{ id: "myId", label: "Собача їжа" }],
    });
    const rec = frequentNoBudgetRule.evaluate(ctx)[0];
    expect(rec?.title).toContain("Собача їжа");
  });
});

describe("goalProgressRule", () => {
  it("тригериться при 80..99%", () => {
    const ctx = baseCtx({
      budgets: [
        {
          id: "g1",
          type: "goal",
          name: "Авто",
          targetAmount: 1000,
          savedAmount: 850,
        },
      ],
    });
    const recs = goalProgressRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("goal_almost_g1");
    expect(recs[0]?.body).toContain("150");
  });

  it("ігнорує вже досягнуті цілі", () => {
    const ctx = baseCtx({
      budgets: [
        {
          id: "g1",
          type: "goal",
          targetAmount: 100,
          savedAmount: 100,
        },
      ],
    });
    expect(goalProgressRule.evaluate(ctx)).toEqual([]);
  });
});

describe("noTxRecentRule", () => {
  // Допоміжні хелпери: tx (amount у копійках, time у секундах), manual expense.
  const DAY = 86_400_000;
  const now = new Date("2025-06-15T12:00:00Z");
  const mkTx = (id: string, daysAgo: number) => ({
    id,
    amount: -10000, // 100 ₴ expense
    time: Math.floor((now.getTime() - daysAgo * DAY) / 1000),
  });
  const mkManual = (daysAgo: number) => ({
    date: new Date(now.getTime() - daysAgo * DAY).toISOString(),
    amount: 120,
  });

  it("тригериться, якщо ≥5 записів і останній ≥3 дні тому (5 днів → many)", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("t1", 10),
        mkTx("t2", 9),
        mkTx("t3", 8),
        mkTx("t4", 7),
        mkTx("t5", 5),
      ],
    });
    const recs = noTxRecentRule.evaluate(ctx);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.id).toBe("finyk_no_tx_recent");
    expect(recs[0]?.pwaAction).toBe("add_expense");
    expect(recs[0]?.title).toMatch(/5 днів/);
  });

  it("плюралізація: 3 дні (few), а не «3 днів»", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("t1", 10),
        mkTx("t2", 9),
        mkTx("t3", 8),
        mkTx("t4", 7),
        mkTx("t5", 3),
      ],
    });
    const recs = noTxRecentRule.evaluate(ctx);
    expect(recs[0]?.title).toMatch(/^3 дні /);
  });

  it("не тригериться, якщо активність була сьогодні", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("t1", 10),
        mkTx("t2", 9),
        mkTx("t3", 8),
        mkTx("t4", 7),
        mkTx("t5", 0),
      ],
    });
    expect(noTxRecentRule.evaluate(ctx)).toEqual([]);
  });

  it("не тригериться на новачків (<5 записів)", () => {
    const ctx = baseCtx({
      now,
      transactions: [mkTx("t1", 10), mkTx("t2", 9)],
    });
    expect(noTxRecentRule.evaluate(ctx)).toEqual([]);
  });

  it("рахує manualExpenses як активність", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("t1", 10),
        mkTx("t2", 9),
        mkTx("t3", 8),
        mkTx("t4", 7),
      ],
      // Разом 5 записів, але найсвіжіший — сьогодні → не тригеримось.
      manualExpenses: [mkManual(0)],
    });
    expect(noTxRecentRule.evaluate(ctx)).toEqual([]);
  });

  it("ігнорує hidden/transfer-tx у підрахунку", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("t1", 10),
        mkTx("t2", 9),
        mkTx("t3", 8),
        mkTx("t4", 7),
        mkTx("h", 0), // найсвіжіший, але hidden — не має рятувати від тригеру
      ],
      hiddenTxIds: new Set(["h"]),
    });
    // 4 expense-tx видимі → <5, правило мовчить.
    expect(noTxRecentRule.evaluate(ctx)).toEqual([]);
  });
});

describe("dailyVsWeeklyPaceRule", () => {
  const DAY = 86_400_000;
  // 16:00 локального часу, щоб пройти MIN_HOUR=14.
  const now = new Date("2025-06-15T16:00:00");
  const mkTx = (id: string, daysAgo: number, uah: number) => ({
    id,
    amount: -Math.round(uah * 100),
    time: Math.floor((now.getTime() - daysAgo * DAY) / 1000),
  });
  const mkManual = (daysAgo: number, uah: number) => ({
    id: `me-${daysAgo}`,
    amount: uah,
    date: new Date(now.getTime() - daysAgo * DAY).toISOString(),
  });

  it("тригериться коли сьогодні > 1.5× середньої за 7 днів", () => {
    // prev7 = 7 × 200 = 1400 ₴ (avg=200); today = 500 ₴ → ratio=2.5.
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("p1", 1, 200),
        mkTx("p2", 2, 200),
        mkTx("p3", 3, 200),
        mkTx("p4", 4, 200),
        mkTx("p5", 5, 200),
        mkTx("p6", 6, 200),
        mkTx("p7", 7, 200),
        mkTx("t1", 0, 500),
      ],
    });
    const recs = dailyVsWeeklyPaceRule.evaluate(ctx);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.id).toBe("finyk_daily_vs_weekly_pace");
    expect(recs[0]?.pwaAction).toBe("add_expense");
    expect(recs[0]?.title).toMatch(/500.*₴/);
  });

  it("рахує manual expenses у today/prev7 темпі", () => {
    const ctx = baseCtx({
      now,
      manualExpenses: [
        mkManual(1, 100),
        mkManual(2, 100),
        mkManual(3, 100),
        mkManual(4, 100),
        mkManual(5, 100),
        mkManual(6, 100),
        mkManual(7, 100),
        mkManual(0, 250),
      ],
    });

    const rec = dailyVsWeeklyPaceRule.evaluate(ctx)[0];
    expect(rec?.id).toBe("finyk_daily_vs_weekly_pace");
    expect(rec?.title).toMatch(/250.*₴/);
  });

  it("мовчить до 14:00", () => {
    const early = new Date("2025-06-15T10:00:00");
    const ctx = baseCtx({
      now: early,
      transactions: [
        {
          id: "p1",
          amount: -140000,
          time: Math.floor((early.getTime() - DAY) / 1000),
        },
        { id: "t1", amount: -50000, time: Math.floor(early.getTime() / 1000) },
      ],
    });
    expect(dailyVsWeeklyPaceRule.evaluate(ctx)).toEqual([]);
  });

  it("мовчить під noise floor", () => {
    // prev7 = 600 (<700) — занадто мало історії.
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("p1", 1, 100),
        mkTx("p2", 2, 100),
        mkTx("p3", 3, 100),
        mkTx("p4", 4, 100),
        mkTx("p5", 5, 100),
        mkTx("p6", 6, 100),
        mkTx("t1", 0, 500),
      ],
    });
    expect(dailyVsWeeklyPaceRule.evaluate(ctx)).toEqual([]);
  });

  it("мовчить коли сьогодні < noise floor 200₴", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("p1", 1, 200),
        mkTx("p2", 2, 200),
        mkTx("p3", 3, 200),
        mkTx("p4", 4, 200),
        mkTx("p5", 5, 200),
        mkTx("p6", 6, 200),
        mkTx("p7", 7, 200),
        mkTx("t1", 0, 150), // < 200
      ],
    });
    expect(dailyVsWeeklyPaceRule.evaluate(ctx)).toEqual([]);
  });

  it("мовчить коли ratio < 1.5", () => {
    // today = 250, avg = 200 → ratio=1.25.
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("p1", 1, 200),
        mkTx("p2", 2, 200),
        mkTx("p3", 3, 200),
        mkTx("p4", 4, 200),
        mkTx("p5", 5, 200),
        mkTx("p6", 6, 200),
        mkTx("p7", 7, 200),
        mkTx("t1", 0, 250),
      ],
    });
    expect(dailyVsWeeklyPaceRule.evaluate(ctx)).toEqual([]);
  });

  it("ігнорує hidden/transfer tx", () => {
    const ctx = baseCtx({
      now,
      transactions: [
        mkTx("p1", 1, 200),
        mkTx("p2", 2, 200),
        mkTx("p3", 3, 200),
        mkTx("p4", 4, 200),
        mkTx("p5", 5, 200),
        mkTx("p6", 6, 200),
        mkTx("p7", 7, 200),
        mkTx("h", 0, 5000), // hidden — не має тригерити
      ],
      hiddenTxIds: new Set(["h"]),
    });
    expect(dailyVsWeeklyPaceRule.evaluate(ctx)).toEqual([]);
  });
});
