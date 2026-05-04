// Per-rule тести для модуля Finyk. Доводимо цінність реєстру: правило можна
// юніт-тестити без LS-мокінгу цілого engine.
import { describe, it, expect } from "vitest";
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
    categorySpend: {},
    canonicalMonthSpend: new Map(),
    canonicalTotalCount: new Map(),
    ...overrides,
  };
}

describe("budgetLimitsRule", () => {
  it("генерує over при >=100% ліміту", () => {
    const ctx = baseCtx({
      limits: [{ id: "b", type: "limit", categoryId: "food", limit: 500 }],
      categorySpend: { food: 900 },
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
      limits: [{ id: "b", type: "limit", categoryId: "cafe", limit: 100 }],
      categorySpend: { cafe: 95 },
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_warn_cafe");
    expect(recs[0]?.severity).toBe("warning");
    expect(recs[0]?.pwaAction).toBeUndefined();
  });

  it("генерує warn при 90..99%", () => {
    const ctx = baseCtx({
      limits: [{ id: "b", type: "limit", categoryId: "cafe", limit: 100 }],
      categorySpend: { cafe: 95 },
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_warn_cafe");
  });

  it("використовує canonicalMonthSpend замість legacy categorySpend, коли він є", () => {
    // Mono-транзакція з MCC цигарок без явного override → потрапляє у
    // canonicalMonthSpend["smoking"], але не в legacy categorySpend.
    // Інсайт повинен показувати ту саму суму, що й картка ліміту.
    const ctx = baseCtx({
      limits: [{ id: "b", type: "limit", categoryId: "smoking", limit: 500 }],
      categorySpend: {},
      canonicalMonthSpend: new Map([["smoking", 590]]),
    });
    const recs = budgetLimitsRule.evaluate(ctx);
    expect(recs[0]?.id).toBe("budget_over_smoking");
    // 590/500 = 1.18 → перевищено на 18%
    expect(recs[0]?.title).toContain("18%");
  });

  it("додає actionHash з категорією для глибокого лінка на Планування", () => {
    const ctx = baseCtx({
      limits: [{ id: "b", type: "limit", categoryId: "smoking", limit: 100 }],
      canonicalMonthSpend: new Map([["smoking", 95]]),
    });
    const rec = budgetLimitsRule.evaluate(ctx)[0];
    expect(rec?.actionHash).toBe("budgets?cat=smoking");
  });

  it("нічого не повертає при 0 лімітах", () => {
    expect(budgetLimitsRule.evaluate(baseCtx())).toEqual([]);
  });

  it("ігнорує ліміти без categoryId або <=0", () => {
    const ctx = baseCtx({
      limits: [
        { id: "b1", type: "limit", categoryId: null, limit: 100 },
        { id: "b2", type: "limit", categoryId: "food", limit: 0 },
      ],
      categorySpend: { food: 200 },
    });
    expect(budgetLimitsRule.evaluate(ctx)).toEqual([]);
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
