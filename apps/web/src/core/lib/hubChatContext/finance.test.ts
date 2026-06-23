// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { appendFinanceLines } from "./finance";
import type { AllData } from "./types";

function joined(d: AllData, now: Date): string {
  const lines: string[] = [];
  appendFinanceLines(lines, d, now);
  return lines.join("\n");
}

function baseData(overrides: Partial<AllData> = {}): AllData {
  return {
    transactions: [],
    accounts: [],
    clientName: "",
    cacheTime: null,
    hiddenAccounts: [],
    budgets: [],
    manualDebts: [],
    receivables: [],
    txCategories: {},
    txSplits: {},
    customCategories: [],
    monthlyPlan: {},
    subscriptions: [],
    monoDebtLinked: {},
    statTx: [],
    excludedIds: new Set<string>(),
    ...overrides,
  };
}

const NOW = new Date("2026-06-15T12:00:00Z");

describe("appendFinanceLines", () => {
  it("always emits overview lines (today, day-of-month)", () => {
    const out = joined(baseData(), NOW);
    expect(out).toContain("[Сьогодні]");
    expect(out).toContain("[День місяця]");
  });

  it("emits cache time and client name when present", () => {
    const out = joined(
      baseData({ cacheTime: NOW.getTime(), clientName: "Тарас" }),
      NOW,
    );
    expect(out).toContain("[Оновлено]");
    expect(out).toContain("[Користувач] Тарас");
  });

  it("emits balance lines when accounts exist", () => {
    const out = joined(
      baseData({
        accounts: [{ id: "a1", balance: 500000, creditLimit: 0 }],
      }),
      NOW,
    );
    expect(out).toContain("[Баланс карток]");
    expect(out).toContain("[Борг кредитки]");
    expect(out).toContain("[Борг загальний]");
  });

  it("emits monthly totals + categories + recent ops when statTx present", () => {
    const out = joined(
      baseData({
        statTx: [
          {
            id: "t1",
            amount: -25000,
            time: Math.floor(NOW.getTime() / 1000) - 100,
            description: "ATB",
          },
          {
            id: "t2",
            amount: 100000,
            time: Math.floor(NOW.getTime() / 1000) - 200,
            description: "Зарплата",
          },
        ],
        transactions: [],
      }),
      NOW,
    );
    expect(out).toContain("[Витрати місяця]");
    expect(out).toContain("[Дохід місяця]");
    expect(out).toContain("[Баланс місяця]");
    expect(out).toContain("[Середня витрата/день]");
    expect(out).toContain("[Прогноз витрат до кінця місяця]");
    expect(out).toContain("[Останні операції]");
  });

  it("emits debt details for active manual debts", () => {
    const out = joined(
      baseData({
        manualDebts: [
          {
            id: "d1",
            name: "Банк",
            amount: 1000,
            totalAmount: 5000,
          },
        ],
      }),
      NOW,
    );
    expect(out).toContain("[Деталі боргів]");
    expect(out).toContain("Банк");
  });

  it("emits receivables when present", () => {
    const out = joined(
      baseData({
        receivables: [{ id: "r1", name: "Друг", amount: 2000 }],
      }),
      NOW,
    );
    expect(out).toContain("[Мені винні]");
    expect(out).toContain("Друг");
  });

  it("emits budget limits and goals", () => {
    const out = joined(
      baseData({
        budgets: [
          { id: "b1", type: "limit", categoryId: "food", limit: 5000 },
          {
            id: "b2",
            type: "goal",
            name: "Відпустка",
            targetAmount: 30000,
            savedAmount: 10000,
          },
        ],
      }),
      NOW,
    );
    expect(out).toContain("[Ліміти]");
    expect(out).toContain("[Цілі]");
    expect(out).toContain("Відпустка");
  });

  it("emits monthly plan and subscriptions", () => {
    const out = joined(
      baseData({
        monthlyPlan: { income: 50000, expense: 30000 },
        subscriptions: [{ id: "s1", name: "Netflix" }],
      }),
      NOW,
    );
    expect(out).toContain("[Фінплан]");
    expect(out).toContain("[Підписки] Netflix");
  });

  it("always emits the category catalog line", () => {
    const out = joined(baseData(), NOW);
    expect(out).toContain("[Категорії]");
  });
});
