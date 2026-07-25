import { describe, expect, it } from "vitest";

import { INTERNAL_TRANSFER_ID } from "../constants";
import {
  buildFinykExcludedTxIds,
  buildFinykSpendingUniverse,
} from "./metrics.js";
import { calcFinykSpendingTotal } from "./spending.js";

const DAY = 86_400_000;
const MONDAY = Date.parse("2026-05-04T00:00:00.000Z");

describe("buildFinykExcludedTxIds", () => {
  it("збирає всі чотири джерела виключень (канонічна четвірка)", () => {
    const excluded = buildFinykExcludedTxIds({
      hiddenTxIds: ["hidden-1"],
      txCategories: { "transfer-1": INTERNAL_TRANSFER_ID, "food-1": "food" },
      receivables: [{ linkedTxIds: ["recv-1", "recv-2"] }, null],
      excludedStatTxIds: ["stat-1"],
    });

    expect([...excluded].sort()).toEqual([
      "hidden-1",
      "recv-1",
      "recv-2",
      "stat-1",
      "transfer-1",
    ]);
  });

  it("не виключає транзакцію лише за наявність категорії", () => {
    const excluded = buildFinykExcludedTxIds({
      txCategories: { "food-1": "food" },
    });
    expect(excluded.size).toBe(0);
  });

  it("толерує null/undefined/битий вхід і повертає порожній set", () => {
    expect(buildFinykExcludedTxIds().size).toBe(0);
    expect(
      buildFinykExcludedTxIds({
        hiddenTxIds: null,
        txCategories: null,
        receivables: null,
        excludedStatTxIds: null,
      }).size,
    ).toBe(0);
  });

  it("`finyk_excluded_stat_txs` входить у набір — саме цього бракує hubChat-контексту", () => {
    const excluded = buildFinykExcludedTxIds({ excludedStatTxIds: ["stat-1"] });
    expect(excluded.has("stat-1")).toBe(true);
  });
});

describe("buildFinykSpendingUniverse", () => {
  const bankTxs = [
    { id: "bank-1", amount: -25_000, time: (MONDAY + DAY) / 1000 },
    { id: "bank-2", amount: -10_000, time: (MONDAY + 2 * DAY) / 1000 },
  ];
  const manualExpenses = [
    { id: "m1", date: "2026-05-06", amount: 150, kind: "expense" },
  ];

  it("мерджить ручні витрати в один список із банківськими", () => {
    const { transactions } = buildFinykSpendingUniverse({
      bankTxs,
      manualExpenses,
    });
    expect(transactions.map((t) => t.id)).toEqual([
      "bank-1",
      "bank-2",
      "manual_m1",
    ]);
  });

  it("ручна витрата потрапляє у суму витрат (готівка перестає бути невидимою)", () => {
    const bankOnly = calcFinykSpendingTotal(bankTxs);
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs,
      manualExpenses,
    });
    const withManual = calcFinykSpendingTotal(transactions, { excludedTxIds });

    expect(bankOnly).toBe(350);
    expect(withManual).toBe(500);
  });

  it("ручний дохід не потрапляє у витрати, але лишається у всесвіті", () => {
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs: [],
      manualExpenses: [
        { id: "i1", date: "2026-05-06", amount: 900, kind: "income" },
      ],
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount).toBe(90_000);
    expect(calcFinykSpendingTotal(transactions, { excludedTxIds })).toBe(0);
  });

  it("вікно [start, end) ріже і банк, і ручні записи", () => {
    // `2026-05-06` (ручний запис) = MONDAY + 2 дні → потрапляє у це вікно
    // разом із bank-2.
    expect(
      buildFinykSpendingUniverse({
        bankTxs,
        manualExpenses,
        start: MONDAY + 2 * DAY,
        end: MONDAY + 3 * DAY,
      }).transactions.map((t) => t.id),
    ).toEqual(["bank-2", "manual_m1"]);

    // Вужче вікно лишає лише банківський запис — ручний відрізано за часом.
    expect(
      buildFinykSpendingUniverse({
        bankTxs,
        manualExpenses,
        start: MONDAY + DAY,
        end: MONDAY + 2 * DAY,
      }).transactions.map((t) => t.id),
    ).toEqual(["bank-1"]);
  });

  it("повертає канонічний excluded-set поруч із транзакціями", () => {
    const { excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs,
      manualExpenses,
      hiddenTxIds: ["bank-1"],
      excludedStatTxIds: ["bank-2"],
    });
    expect([...excludedTxIds].sort()).toEqual(["bank-1", "bank-2"]);
  });

  it("виключений зі статистики банк-запис не рахується у витратах", () => {
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs,
      manualExpenses,
      excludedStatTxIds: ["bank-1"],
    });
    expect(calcFinykSpendingTotal(transactions, { excludedTxIds })).toBe(250);
  });

  it("порожній вхід дає порожній всесвіт без кидання", () => {
    const universe = buildFinykSpendingUniverse();
    expect(universe.transactions).toEqual([]);
    expect(universe.excludedTxIds.size).toBe(0);
  });
});
