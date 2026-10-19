import { describe, expect, it } from "vitest";

import { buildFinykExcludedTxIds } from "../lib/metrics.js";
import { CASH_ACCOUNT_ID } from "../constants.js";
import {
  computeCashBalanceMinor,
  createCashOnHand,
  findCashTransferTxIds,
  sanitizeCashOnHand,
  toggleCashCountAsExpense,
  withCashAdjustment,
} from "./cashOnHand.js";
import {
  aggregateSpendingByAccount,
  filterByAccountKey,
  NO_ACCOUNT_KEY,
} from "./accountBreakdown.js";
import { getMonthlySummary } from "./selectors.js";
import {
  manualExpenseToTransaction,
  normalizeTransaction,
} from "./transactions.js";

const CREATED = Date.UTC(2026, 9, 10, 9, 0, 0);
const sec = (ms: number) => Math.floor(ms / 1000);

const withdrawal = (id: string, ms: number, amount = -50_000) => ({
  id,
  amount,
  time: sec(ms),
  mcc: 6011,
});

describe("cashOnHand — баланс", () => {
  it("1 000 ₴ + зняття 500 ₴ - готівкова витрата 200 ₴ + поправка -50 ₴ = 1 250 ₴", () => {
    const base = createCashOnHand(100_000, CREATED);
    const bankTxs = [withdrawal("w1", CREATED + 3_600_000)];
    const manualExpenses = [
      {
        id: "m1",
        date: new Date(CREATED + 7_200_000).toISOString(),
        amount: 200,
        category: "food",
        account: "cash" as const,
      },
    ];
    const before = computeCashBalanceMinor({
      cash: base,
      bankTxs,
      manualExpenses,
    });
    expect(before).toBe(130_000);

    const cash = withCashAdjustment(
      base,
      before ?? 0,
      125_000,
      CREATED + 9e6,
      "a1",
    );
    expect(cash.adjustments).toEqual([
      { id: "a1", amount: -5_000, at: CREATED + 9e6 },
    ]);
    expect(computeCashBalanceMinor({ cash, bankTxs, manualExpenses })).toBe(
      125_000,
    );

    // Поправка не є витратою: у всесвіті статистики її немає, а зняття
    // виходить переказом, тож витратою лишаються рівно 200 ₴.
    const txs = [
      normalizeTransaction(bankTxs[0]!, { source: "mono", accountId: "card" }),
      manualExpenseToTransaction(manualExpenses[0]),
    ];
    const excluded = buildFinykExcludedTxIds({
      transactions: txs,
      cashOnHand: cash,
    });
    expect(getMonthlySummary(txs, { excludedTxIds: excluded }).spentMinor).toBe(
      20_000,
    );
  });

  it("без рахунку баланс null і зняття лишається витратою", () => {
    expect(computeCashBalanceMinor({ cash: null })).toBeNull();
    expect(findCashTransferTxIds([withdrawal("w", CREATED)], null).size).toBe(
      0,
    );
  });

  it("готівковий дохід додається, запис «Без рахунку» баланс не чіпає", () => {
    const cash = createCashOnHand(0, CREATED);
    const at = new Date(CREATED + 1000).toISOString();
    expect(
      computeCashBalanceMinor({
        cash,
        manualExpenses: [
          { id: "i", date: at, amount: 300, kind: "income", account: "cash" },
          { id: "n", date: at, amount: 999, category: "food" },
        ],
      }),
    ).toBe(30_000);
  });
});

describe("cashOnHand — forward-only і перебиття", () => {
  it("зняття до створення рахунку лишається як було, після стає переказом", () => {
    const cash = createCashOnHand(0, CREATED);
    const old = withdrawal("old", CREATED - 1000);
    const fresh = withdrawal("new", CREATED + 1000);
    const ids = findCashTransferTxIds([old, fresh], cash);
    expect([...ids]).toEqual(["new"]);
    expect(computeCashBalanceMinor({ cash, bankTxs: [old, fresh] })).toBe(
      50_000,
    );
  });

  it("«Рахувати як витрату» повертає зняття у витрати й прибирає з балансу", () => {
    const cash = toggleCashCountAsExpense(createCashOnHand(0, CREATED), "new");
    const fresh = withdrawal("new", CREATED + 1000);
    expect(findCashTransferTxIds([fresh], cash).size).toBe(0);
    expect(computeCashBalanceMinor({ cash, bankTxs: [fresh] })).toBe(0);
    expect(toggleCashCountAsExpense(cash, "new").countAsExpenseTxIds).toEqual(
      [],
    );
  });

  it("інший MCC, надходження і ручний запис не є банківським зняттям", () => {
    const cash = createCashOnHand(0, CREATED);
    const t = sec(CREATED + 1000);
    const ids = findCashTransferTxIds(
      [
        { id: "shop", amount: -100, time: t, mcc: 5411 },
        { id: "in", amount: 100, time: t, mcc: 6011 },
        { id: "man", amount: -100, time: t, mcc: 6011, manual: true },
      ],
      cash,
    );
    expect(ids.size).toBe(0);
  });

  it("зняття з імпорту з чипом переказу після створення поповнює готівку", () => {
    const cash = createCashOnHand(100_000, CREATED);
    const row = (id: string, ms: number) => ({
      id,
      date: new Date(ms).toISOString(),
      amount: 300,
      category: "internal_transfer",
      kind: "expense",
      description: "Зняття готівки в банкоматі",
    });
    const balance = computeCashBalanceMinor({
      cash,
      manualExpenses: [
        row("after", CREATED + 1000),
        row("before", CREATED - 1000),
        { ...row("jar", CREATED + 1000), description: "Поповнення банки" },
      ],
    });
    expect(balance).toBe(130_000);
  });
});

describe("cashOnHand — sanitize", () => {
  it("відкидає зіпсовану форму і чистить поля", () => {
    expect(sanitizeCashOnHand(null)).toBeNull();
    expect(sanitizeCashOnHand({ initialAmount: "1" })).toBeNull();
    expect(
      sanitizeCashOnHand({
        initialAmount: 100,
        createdAt: 5,
        adjustments: [{ id: "a", amount: 1, at: 2 }, { id: 3 }],
        countAsExpenseTxIds: ["x", 1, ""],
      }),
    ).toEqual({
      initialAmount: 100,
      createdAt: 5,
      adjustments: [{ id: "a", amount: 1, at: 2 }],
      countAsExpenseTxIds: ["x"],
      preferForManual: false,
    });
  });
});

describe("accountBreakdown", () => {
  it("сума рядків дорівнює витратам періоду, переказ на готівку не зʼявляється", () => {
    const cash = createCashOnHand(0, CREATED);
    const t = sec(CREATED + 1000);
    const txs = [
      normalizeTransaction(
        { id: "w", amount: -50_000, time: t, mcc: 6011 },
        { source: "mono", accountId: "black" },
      ),
      normalizeTransaction(
        { id: "s", amount: -12_345, time: t, mcc: 5411 },
        { source: "mono", accountId: "black" },
      ),
      normalizeTransaction(
        { id: "f", amount: -1_001, time: t, mcc: 5411 },
        { source: "mono", accountId: "white" },
      ),
      manualExpenseToTransaction({
        id: "c",
        date: new Date(CREATED + 2000).toISOString(),
        amount: 200,
        category: "food",
        account: "cash",
      }),
      manualExpenseToTransaction({
        id: "n",
        date: new Date(CREATED + 2000).toISOString(),
        amount: 10.5,
        category: "food",
      }),
    ];
    const excludedTxIds = buildFinykExcludedTxIds({
      transactions: txs,
      cashOnHand: cash,
    });
    const rows = aggregateSpendingByAccount(txs, { excludedTxIds });
    expect(rows).toEqual([
      { accountKey: CASH_ACCOUNT_ID, spentMinor: 20_000 },
      { accountKey: "black", spentMinor: 12_345 },
      { accountKey: NO_ACCOUNT_KEY, spentMinor: 1_050 },
      { accountKey: "white", spentMinor: 1_001 },
    ]);
    const total = rows.reduce((s, r) => s + r.spentMinor, 0);
    expect(total).toBe(getMonthlySummary(txs, { excludedTxIds }).spentMinor);
    expect(filterByAccountKey(txs, CASH_ACCOUNT_ID).map((t) => t.id)).toEqual([
      "manual_c",
    ]);
    expect(filterByAccountKey(txs, null)).toBe(txs);
  });
});
