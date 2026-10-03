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

  it("не виключає операцію лише за наявність категорії", () => {
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

  it("виключає переказ, позначений на самій операції (categoryId / type)", () => {
    // Мапа `finyk_tx_cats` ключується банківськими id — ручний запис або
    // імпорт несе мітку переказу в самій транзакції. Без цієї гілки такий
    // запис рахувався витратою в дайджесті й у коуча.
    const excluded = buildFinykExcludedTxIds({
      transactions: [
        {
          id: "tx-transfer",
          amount: -50_000,
          categoryId: INTERNAL_TRANSFER_ID,
        },
        { id: "typed-transfer", amount: -50_000, type: "transfer" },
        { id: "food-1", amount: -30_000, categoryId: "food", type: "expense" },
        null,
      ],
    });

    expect([...excluded].sort()).toEqual(["tx-transfer", "typed-transfer"]);
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

  // Рядок виписки, позначений «Внутрішнім переказом» у bulk-review, лягає в
  // сховище звичайним ручним записом із `category: "internal_transfer"`.
  // Тест тримає ланцюжок category → categoryId → excluded: доки чипа в
  // пікері імпорту не було, розмітити зняття готівки не було чим, а тепер
  // є — і воно мусить справді виходити з підсумків, не лише малюватись.
  it("ручний запис із категорією переказу виключається з підсумків", () => {
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      manualExpenses: [
        {
          id: "atm",
          date: "2026-05-06",
          amount: 505,
          kind: "expense",
          category: INTERNAL_TRANSFER_ID,
        },
        { id: "coffee", date: "2026-05-06", amount: 80, kind: "expense" },
      ],
    });

    expect(excludedTxIds.has("manual_atm")).toBe(true);
    expect(excludedTxIds.has("manual_coffee")).toBe(false);
    // Гривні: 505 зняття не рахується, лишається сама кава.
    expect(calcFinykSpendingTotal(transactions, { excludedTxIds })).toBe(80);
  });

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

  it("ручний переказ між власними рахунками не рахується витратою", () => {
    // Ручний запис із переказною категорією нормалізується у
    // `type: "transfer"` (`resolveType`), тож всесвіт має віддати його
    // id в excluded-set — навіть якщо в `finyk_tx_cats` рядка немає.
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs: [],
      manualExpenses: [
        {
          id: "t1",
          date: "2026-05-06",
          amount: 500,
          kind: "expense",
          category: INTERNAL_TRANSFER_ID,
        },
      ],
    });

    expect(excludedTxIds.has("manual_t1")).toBe(true);
    expect(calcFinykSpendingTotal(transactions, { excludedTxIds })).toBe(0);
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

  it("повертає канонічний excluded-set поруч із операціями", () => {
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

// Рішення власника 2026-10-01 (варіант А): «Uklon −189» і «Скасування. Uklon
// +189» рахувались витратою (Транспорт) і доходом (Інше). Тепер обидві ноги
// пари виходять зі статистики в самому excluded-set, тож кожен споживач
// набору успадковує правило без власної арифметики.
describe("скасування платежів у excluded-set", () => {
  const T0 = MONDAY / 1000 + 3_600;
  const bankTxs = [
    { id: "uklon-out", amount: -18_900, time: T0, description: "Uklon" },
    {
      id: "uklon-in",
      amount: 18_900,
      time: T0 + 7_200,
      description: "Скасування. Uklon",
    },
    { id: "bolt-out", amount: -49_989, time: T0 + 86_400, description: "Bolt" },
    {
      id: "bolt-in",
      amount: 49_989,
      time: T0 + 86_400 + 900,
      description: "Скасування. Bolt",
    },
    {
      id: "coffee",
      amount: -9_500,
      time: T0 + 2 * 86_400,
      description: "Кава",
    },
    // Часткове скасування: сума інша, пара не ставиться.
    {
      id: "taxi-out",
      amount: -30_000,
      time: T0 + 3 * 86_400,
      description: "Taxi",
    },
    {
      id: "taxi-in",
      amount: 12_000,
      time: T0 + 3 * 86_400 + 600,
      description: "Скасування. Taxi",
    },
  ];

  it("buildFinykExcludedTxIds виключає обидві ноги кожної пари", () => {
    const excluded = buildFinykExcludedTxIds({ transactions: bankTxs });
    expect([...excluded].sort()).toEqual([
      "bolt-in",
      "bolt-out",
      "uklon-in",
      "uklon-out",
    ]);
  });

  it("без банківських транзакцій у вході правило нічого не виключає", () => {
    expect(buildFinykExcludedTxIds({ txCategories: {} }).size).toBe(0);
    expect(buildFinykExcludedTxIds({ transactions: [] }).size).toBe(0);
  });

  it("всесвіт витрат: скасована поїздка не рахується ні витратою, ні доходом", () => {
    const { transactions, excludedTxIds } = buildFinykSpendingUniverse({
      bankTxs,
    });
    // Лишились кава 95 + таксі 300 (часткове скасування не парується).
    expect(calcFinykSpendingTotal(transactions, { excludedTxIds })).toBe(395);
    // Без правила: 189 + 499,89 + 95 + 300 = 1083,89.
    expect(calcFinykSpendingTotal(transactions)).toBeCloseTo(1_083.89, 2);
    // Дохід теж: скасування Uklon/Bolt не рахується, часткове — так.
    const income = transactions
      .filter((t) => t.amount > 0 && !excludedTxIds.has(t.id))
      .reduce((sum, t) => sum + t.amount / 100, 0);
    expect(income).toBe(120);
  });

  it("явне виключення й приховування працюють разом із парою", () => {
    const excluded = buildFinykExcludedTxIds({
      transactions: bankTxs,
      hiddenTxIds: ["coffee"],
      excludedStatTxIds: ["taxi-out"],
    });
    expect([...excluded].sort()).toEqual([
      "bolt-in",
      "bolt-out",
      "coffee",
      "taxi-out",
      "uklon-in",
      "uklon-out",
    ]);
  });
});
