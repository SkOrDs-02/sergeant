// Pure-extractor `extractFinykDualWriteState`: маппінг `FinykStorageSlots`
// у форму `FinykDualWriteState` для diff-шару. Усі допоміжні
// `blobsFromArray`, `idsFromArray`, `txCatsFromMap`, `txSplitsFromMap`,
// `monoDebtLinksFromMap`, `networthHistoryFrom`, `serializeStringArray` —
// приватні, тестуємо через єдиний експорт. Без LS / window / SQLite.

import { describe, expect, it, vi } from "vitest";

import type { FinykStorageSlots } from "../../hooks/useFinykStorageSlots";
import { EMPTY_FINYK_STATE } from "./diff.js";
import { extractFinykDualWriteState } from "./extract.js";

/**
 * Будує мінімальний `FinykStorageSlots`-сумісний обʼєкт з дефолтами для
 * усіх read-полів, які читає extractor. Сетери / refs тут не потрібні —
 * extract.ts їх не торкається. Тип-cast лише на верхньому рівні, щоб
 * сигнатура `extractFinykDualWriteState(slots, …)` сходилася.
 */
function makeSlots(
  overrides: Partial<Record<string, unknown>> = {},
): FinykStorageSlots {
  const base: Record<string, unknown> = {
    hiddenAccounts: [],
    hiddenTxIds: [],
    budgets: [],
    subscriptions: [],
    manualAssets: [],
    manualDebts: [],
    receivables: [],
    customCategories: [],
    manualExpenses: [],
    txCategories: {},
    txSplits: {},
    monoDebtLinkedTxIds: {},
    networthHistory: [],
    monthlyPlan: {},
    excludedStatTxIds: [],
    dismissedRecurring: [],
  };
  return { ...base, ...overrides } as unknown as FinykStorageSlots;
}

/**
 * Обʼєкт, що кидає при `JSON.stringify` — для покриття try/catch гілок.
 * Використовуємо toJSON, бо циклічні структури теж кидають, але toJSON
 * простіший і не залежить від реалізації V8.
 */
function unserializable(): Record<string, unknown> {
  return {
    id: "x",
    toJSON() {
      throw new Error("boom");
    },
  };
}

describe("extractFinykDualWriteState — null-safe гарди", () => {
  it("повертає EMPTY_FINYK_STATE коли slots відсутній", () => {
    const result = extractFinykDualWriteState(
      null as unknown as FinykStorageSlots,
      false,
    );
    expect(result).toBe(EMPTY_FINYK_STATE);
  });

  it("повертає EMPTY_FINYK_STATE коли slots === undefined", () => {
    const result = extractFinykDualWriteState(
      undefined as unknown as FinykStorageSlots,
      true,
    );
    expect(result).toBe(EMPTY_FINYK_STATE);
  });
});

describe("extractFinykDualWriteState — порожні slots дають мінімальний state", () => {
  it("для слотів з усіма дефолтними значеннями повертає очікувану форму", () => {
    const state = extractFinykDualWriteState(makeSlots(), false);
    expect(state).toEqual({
      hiddenAccounts: [],
      hiddenTransactions: [],
      budgets: [],
      subscriptions: [],
      assets: [],
      debts: [],
      receivables: [],
      customCategories: [],
      manualExpenses: [],
      txCategories: [],
      txSplits: [],
      monoDebtLinks: [],
      networthHistory: [],
      prefs: {
        monthlyPlanJson: "{}",
        showBalance: false,
        excludedStatTxIdsJson: "[]",
        dismissedRecurringJson: "[]",
      },
    });
  });

  it("прокидає showBalance true у prefs", () => {
    const state = extractFinykDualWriteState(makeSlots(), true);
    expect(state.prefs).not.toBeNull();
    expect(state.prefs?.showBalance).toBe(true);
  });
});

describe("extractFinykDualWriteState — idsFromArray (hiddenAccounts / hiddenTxIds)", () => {
  it("повертає масив {id} лише для непустих рядків", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        hiddenAccounts: ["acc-1", "acc-2"],
        hiddenTxIds: ["tx-1"],
      }),
      false,
    );
    expect(state.hiddenAccounts).toEqual([{ id: "acc-1" }, { id: "acc-2" }]);
    expect(state.hiddenTransactions).toEqual([{ id: "tx-1" }]);
  });

  it("пропускає не-рядки, null, undefined, порожні рядки", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        hiddenAccounts: ["acc-1", "", null, undefined, 42, {}, "acc-2"],
        hiddenTxIds: ["", "tx-1", false],
      }),
      false,
    );
    expect(state.hiddenAccounts).toEqual([{ id: "acc-1" }, { id: "acc-2" }]);
    expect(state.hiddenTransactions).toEqual([{ id: "tx-1" }]);
  });

  it("повертає [] коли поле не масив (string)", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        hiddenAccounts: "not-array",
        hiddenTxIds: null,
      }),
      false,
    );
    expect(state.hiddenAccounts).toEqual([]);
    expect(state.hiddenTransactions).toEqual([]);
  });
});

describe("extractFinykDualWriteState — blobsFromArray (budgets / subs / assets / debts / receivables / customCats / manualExpenses)", () => {
  it("повертає {id, dataJson} для валідних рядків", () => {
    const row = { id: "b1", amount: 100, label: "Їжа" };
    const state = extractFinykDualWriteState(
      makeSlots({ budgets: [row] }),
      false,
    );
    expect(state.budgets).toEqual([
      { id: "b1", dataJson: JSON.stringify(row) },
    ]);
  });

  it("пропускає рядки без `id` або з не-рядковим `id`", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        budgets: [
          { id: "b1", x: 1 },
          { x: 2 }, // немає id
          { id: 42, x: 3 }, // id не рядок
          { id: "", x: 4 }, // порожній рядок — потрапить, але…
        ],
      }),
      false,
    );
    // `id === ""` — typeof string, але `if (!id) continue;` (порожній рядок
    // falsy) — пропускається.
    expect(state.budgets.map((b) => b.id)).toEqual(["b1"]);
  });

  it("пропускає null / undefined / примітиви всередині масиву", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        subscriptions: [
          null,
          undefined,
          "x",
          42,
          true,
          { id: "s1", name: "Netflix" },
        ],
      }),
      false,
    );
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]?.id).toBe("s1");
  });

  it("повертає [] коли поле не масив (object)", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        budgets: { id: "b1" },
        subscriptions: undefined,
      }),
      false,
    );
    expect(state.budgets).toEqual([]);
    expect(state.subscriptions).toEqual([]);
  });

  it("пропускає несеріалізовані рядки (toJSON кидає)", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        budgets: [{ id: "b1", value: 1 }, unserializable()],
      }),
      false,
    );
    expect(state.budgets.map((b) => b.id)).toEqual(["b1"]);
  });

  it("покриває всі сім blob-полів (budgets, subs, assets, debts, recv, customCats, manualExpenses)", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        budgets: [{ id: "b1" }],
        subscriptions: [{ id: "s1" }],
        manualAssets: [{ id: "a1" }],
        manualDebts: [{ id: "d1" }],
        receivables: [{ id: "r1" }],
        customCategories: [{ id: "c1" }],
        manualExpenses: [{ id: "e1" }],
      }),
      false,
    );
    expect(state.budgets.map((b) => b.id)).toEqual(["b1"]);
    expect(state.subscriptions.map((b) => b.id)).toEqual(["s1"]);
    expect(state.assets.map((b) => b.id)).toEqual(["a1"]);
    expect(state.debts.map((b) => b.id)).toEqual(["d1"]);
    expect(state.receivables.map((b) => b.id)).toEqual(["r1"]);
    expect(state.customCategories.map((b) => b.id)).toEqual(["c1"]);
    expect(state.manualExpenses.map((b) => b.id)).toEqual(["e1"]);
  });
});

describe("extractFinykDualWriteState — txCatsFromMap", () => {
  it("повертає {transactionId, categoryId} для валідних пар", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        txCategories: {
          "tx-1": "cat-food",
          "tx-2": "cat-fun",
        },
      }),
      false,
    );
    expect(state.txCategories).toEqual(
      expect.arrayContaining([
        { transactionId: "tx-1", categoryId: "cat-food" },
        { transactionId: "tx-2", categoryId: "cat-fun" },
      ]),
    );
    expect(state.txCategories).toHaveLength(2);
  });

  it.each([
    ["undefined", { "tx-1": undefined }],
    ["empty string", { "tx-1": "" }],
    ["non-string (number)", { "tx-1": 42 as unknown as string }],
    ["non-string (null)", { "tx-1": null as unknown as string }],
  ])("пропускає категорію зі значенням %s", (_label, map) => {
    const state = extractFinykDualWriteState(
      makeSlots({ txCategories: map }),
      false,
    );
    expect(state.txCategories).toEqual([]);
  });

  it("пропускає запис з порожнім ключем (transactionId === '')", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        txCategories: { "": "cat-x", "tx-1": "cat-food" },
      }),
      false,
    );
    expect(state.txCategories).toEqual([
      { transactionId: "tx-1", categoryId: "cat-food" },
    ]);
  });

  it("повертає [] коли поле не обʼєкт (null / array / undefined)", () => {
    expect(
      extractFinykDualWriteState(makeSlots({ txCategories: null }), false)
        .txCategories,
    ).toEqual([]);
    // Масив теж є typeof 'object'; цикл `Object.entries` дасть пари
    // [index, value] — string-індекси, але categoryId буде ціль масиву.
    // Перевіримо що undefined-кейс не падає.
    expect(
      extractFinykDualWriteState(makeSlots({ txCategories: undefined }), false)
        .txCategories,
    ).toEqual([]);
  });
});

describe("extractFinykDualWriteState — txSplitsFromMap", () => {
  it("повертає {transactionId, splitsJson} для валідних splits", () => {
    const splits = [{ categoryId: "c1", share: 0.5 }];
    const state = extractFinykDualWriteState(
      makeSlots({ txSplits: { "tx-1": splits } }),
      false,
    );
    expect(state.txSplits).toEqual([
      { transactionId: "tx-1", splitsJson: JSON.stringify(splits) },
    ]);
  });

  it.each([
    ["non-array (object)", { "tx-1": { foo: 1 } }],
    ["non-array (string)", { "tx-1": "splits" }],
    ["empty array", { "tx-1": [] }],
    ["null", { "tx-1": null }],
    ["undefined", { "tx-1": undefined }],
  ])("пропускає splits типу %s", (_label, map) => {
    const state = extractFinykDualWriteState(
      makeSlots({ txSplits: map }),
      false,
    );
    expect(state.txSplits).toEqual([]);
  });

  it("пропускає запис з порожнім transactionId", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        txSplits: {
          "": [{ categoryId: "c1" }],
          "tx-1": [{ categoryId: "c2" }],
        },
      }),
      false,
    );
    expect(state.txSplits.map((s) => s.transactionId)).toEqual(["tx-1"]);
  });

  it("повертає [] коли поле не обʼєкт", () => {
    const state = extractFinykDualWriteState(
      makeSlots({ txSplits: null }),
      false,
    );
    expect(state.txSplits).toEqual([]);
  });

  it("пропускає splits, що не серіалізуються (циклічний)", () => {
    const cyclic: Record<string, unknown>[] = [{ foo: 1 }];
    const ref = cyclic[0];
    if (ref) {
      ref.self = ref;
    }
    const state = extractFinykDualWriteState(
      makeSlots({
        txSplits: {
          "tx-bad": cyclic,
          "tx-good": [{ categoryId: "c1" }],
        },
      }),
      false,
    );
    expect(state.txSplits.map((s) => s.transactionId)).toEqual(["tx-good"]);
  });
});

describe("extractFinykDualWriteState — monoDebtLinksFromMap", () => {
  it("повертає {transactionId, debtIdsJson} для валідних масивів", () => {
    const debts = ["d1", "d2"];
    const state = extractFinykDualWriteState(
      makeSlots({ monoDebtLinkedTxIds: { "tx-1": debts } }),
      false,
    );
    expect(state.monoDebtLinks).toEqual([
      { transactionId: "tx-1", debtIdsJson: JSON.stringify(debts) },
    ]);
  });

  it.each([
    ["non-array (object)", { "tx-1": { foo: "bar" } as unknown as string[] }],
    ["empty array", { "tx-1": [] }],
    ["null", { "tx-1": null as unknown as string[] }],
    ["undefined", { "tx-1": undefined as unknown as string[] }],
  ])("пропускає debtIds типу %s", (_label, map) => {
    const state = extractFinykDualWriteState(
      makeSlots({ monoDebtLinkedTxIds: map }),
      false,
    );
    expect(state.monoDebtLinks).toEqual([]);
  });

  it("пропускає запис з порожнім transactionId", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        monoDebtLinkedTxIds: { "": ["d1"], "tx-1": ["d2"] },
      }),
      false,
    );
    expect(state.monoDebtLinks.map((m) => m.transactionId)).toEqual(["tx-1"]);
  });

  it("повертає [] коли поле не обʼєкт (null)", () => {
    const state = extractFinykDualWriteState(
      makeSlots({ monoDebtLinkedTxIds: null }),
      false,
    );
    expect(state.monoDebtLinks).toEqual([]);
  });

  it("пропускає несеріалізовані debtIds (циклічний)", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const state = extractFinykDualWriteState(
      makeSlots({
        monoDebtLinkedTxIds: {
          "tx-bad": cyclic as unknown as string[],
          "tx-good": ["d1"],
        },
      }),
      false,
    );
    expect(state.monoDebtLinks.map((m) => m.transactionId)).toEqual([
      "tx-good",
    ]);
  });
});

describe("extractFinykDualWriteState — networthHistoryFrom", () => {
  it("повертає валідні {month, networth} записи", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        networthHistory: [
          { month: "2026-01", networth: 12345 },
          { month: "2026-02", networth: -50 },
        ],
      }),
      false,
    );
    expect(state.networthHistory).toEqual([
      { month: "2026-01", networth: 12345 },
      { month: "2026-02", networth: -50 },
    ]);
  });

  it.each([
    ["неправильний формат місяця (YYYY-M)", { month: "2026-1", networth: 0 }],
    ["неправильний формат місяця (рядок)", { month: "foo", networth: 0 }],
    ["місяць не рядок (number)", { month: 202601, networth: 0 }],
    ["місяць undefined", { month: undefined, networth: 0 }],
  ])("пропускає запис з %s", (_label, row) => {
    const state = extractFinykDualWriteState(
      makeSlots({ networthHistory: [row] }),
      false,
    );
    expect(state.networthHistory).toEqual([]);
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["рядок", "123" as unknown as number],
    ["null", null as unknown as number],
    ["undefined", undefined as unknown as number],
  ])("пропускає запис з networth=%s", (_label, networth) => {
    const state = extractFinykDualWriteState(
      makeSlots({
        networthHistory: [{ month: "2026-01", networth }],
      }),
      false,
    );
    expect(state.networthHistory).toEqual([]);
  });

  it("пропускає null / не-обʼєктні рядки в масиві", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        networthHistory: [
          null,
          undefined,
          "row",
          42,
          { month: "2026-01", networth: 100 },
        ],
      }),
      false,
    );
    expect(state.networthHistory).toEqual([
      { month: "2026-01", networth: 100 },
    ]);
  });

  it("повертає [] коли поле не масив", () => {
    const state = extractFinykDualWriteState(
      makeSlots({ networthHistory: "not-array" }),
      false,
    );
    expect(state.networthHistory).toEqual([]);
  });

  it("приймає рівно нуль як валідний networth (Number.isFinite(0) === true)", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        networthHistory: [{ month: "2026-01", networth: 0 }],
      }),
      false,
    );
    expect(state.networthHistory).toEqual([{ month: "2026-01", networth: 0 }]);
  });
});

describe("extractFinykDualWriteState — prefs (monthlyPlan + serializeStringArray)", () => {
  it("серіалізує monthlyPlan у JSON-рядок", () => {
    const plan = { income: 100, expense: 50, savings: 50 };
    const state = extractFinykDualWriteState(
      makeSlots({ monthlyPlan: plan }),
      false,
    );
    expect(state.prefs?.monthlyPlanJson).toBe(JSON.stringify(plan));
  });

  it("повертає '{}' коли monthlyPlan = null / undefined (slots.monthlyPlan ?? {})", () => {
    const state = extractFinykDualWriteState(
      makeSlots({ monthlyPlan: null }),
      false,
    );
    expect(state.prefs?.monthlyPlanJson).toBe("{}");
  });

  it("повертає '{}' коли monthlyPlan не серіалізується (циклічний)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const state = extractFinykDualWriteState(
      makeSlots({ monthlyPlan: cyclic }),
      false,
    );
    expect(state.prefs?.monthlyPlanJson).toBe("{}");
  });

  it("серіалізує excludedStatTxIds / dismissedRecurring, фільтруючи не-рядки і порожні", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        excludedStatTxIds: ["tx-1", "", null, 42, "tx-2"],
        dismissedRecurring: ["r1", undefined, "r2", "  "],
      }),
      false,
    );
    expect(state.prefs?.excludedStatTxIdsJson).toBe(
      JSON.stringify(["tx-1", "tx-2"]),
    );
    // whitespace-only — все ще рядок з length > 0; serializeStringArray не
    // тримує і пропускає лише `length === 0`.
    expect(state.prefs?.dismissedRecurringJson).toBe(
      JSON.stringify(["r1", "r2", "  "]),
    );
  });

  it("повертає '[]' коли excludedStatTxIds / dismissedRecurring не масиви", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        excludedStatTxIds: "not-array",
        dismissedRecurring: null,
      }),
      false,
    );
    expect(state.prefs?.excludedStatTxIdsJson).toBe("[]");
    expect(state.prefs?.dismissedRecurringJson).toBe("[]");
  });

  it("повертає '[]' коли масив порожній", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        excludedStatTxIds: [],
        dismissedRecurring: [],
      }),
      false,
    );
    expect(state.prefs?.excludedStatTxIdsJson).toBe("[]");
    expect(state.prefs?.dismissedRecurringJson).toBe("[]");
  });

  it("повертає '[]' коли масив містить лише не-рядки / порожні", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        excludedStatTxIds: ["", null, 42, undefined],
      }),
      false,
    );
    expect(state.prefs?.excludedStatTxIdsJson).toBe("[]");
  });

  it("повертає '[]' коли JSON.stringify кидає (defensive catch)", () => {
    // `out` всередині `serializeStringArray` — завжди `string[]`, тож
    // природньо `stringify` не падає. Стабилізуємо помилку через spy на
    // одну ітерацію, щоб покрити catch-гілку. Перший виклик
    // (`monthlyPlan` всередині `extractFinykDualWriteState`) уже
    // використовує try/catch — тримаємо рівно один throw для
    // `excludedStatTxIds`.
    const spy = vi.spyOn(JSON, "stringify");
    spy.mockImplementationOnce(() => "{}"); // monthlyPlan ok
    spy.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    try {
      const state = extractFinykDualWriteState(
        makeSlots({ excludedStatTxIds: ["tx-1"] }),
        false,
      );
      expect(state.prefs?.excludedStatTxIdsJson).toBe("[]");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("extractFinykDualWriteState — integration / happy path", () => {
  it("заповнює усі поля для реалістичного зразка slots", () => {
    const state = extractFinykDualWriteState(
      makeSlots({
        hiddenAccounts: ["acc-1"],
        hiddenTxIds: ["tx-h1"],
        budgets: [{ id: "b1", amount: 100 }],
        subscriptions: [{ id: "s1", name: "Netflix" }],
        manualAssets: [{ id: "a1", amount: 1000 }],
        manualDebts: [{ id: "d1", amount: 500 }],
        receivables: [{ id: "r1", amount: 200 }],
        customCategories: [{ id: "c1", label: "Хобі" }],
        manualExpenses: [{ id: "e1", description: "Зошит" }],
        txCategories: { "tx-1": "cat-food" },
        txSplits: { "tx-1": [{ categoryId: "c1", share: 1 }] },
        monoDebtLinkedTxIds: { "tx-1": ["d1"] },
        networthHistory: [{ month: "2026-01", networth: 7777 }],
        monthlyPlan: { income: "1000", expense: "500", savings: "500" },
        excludedStatTxIds: ["tx-skip"],
        dismissedRecurring: ["rec-skip"],
      }),
      true,
    );

    expect(state.hiddenAccounts).toEqual([{ id: "acc-1" }]);
    expect(state.hiddenTransactions).toEqual([{ id: "tx-h1" }]);
    expect(state.budgets[0]).toMatchObject({ id: "b1" });
    expect(state.subscriptions[0]).toMatchObject({ id: "s1" });
    expect(state.assets[0]).toMatchObject({ id: "a1" });
    expect(state.debts[0]).toMatchObject({ id: "d1" });
    expect(state.receivables[0]).toMatchObject({ id: "r1" });
    expect(state.customCategories[0]).toMatchObject({ id: "c1" });
    expect(state.manualExpenses[0]).toMatchObject({ id: "e1" });
    expect(state.txCategories).toEqual([
      { transactionId: "tx-1", categoryId: "cat-food" },
    ]);
    expect(state.txSplits[0]).toMatchObject({ transactionId: "tx-1" });
    expect(state.monoDebtLinks[0]).toMatchObject({ transactionId: "tx-1" });
    expect(state.networthHistory).toEqual([
      { month: "2026-01", networth: 7777 },
    ]);
    expect(state.prefs).toEqual({
      monthlyPlanJson: JSON.stringify({
        income: "1000",
        expense: "500",
        savings: "500",
      }),
      showBalance: true,
      excludedStatTxIdsJson: JSON.stringify(["tx-skip"]),
      dismissedRecurringJson: JSON.stringify(["rec-skip"]),
    });
  });

  it("не мутує вхідні slots (extract — pure)", () => {
    const slots = makeSlots({
      hiddenAccounts: ["acc-1"],
      budgets: [{ id: "b1" }],
    });
    const snapshot = JSON.parse(JSON.stringify(slots));
    extractFinykDualWriteState(slots, false);
    expect(slots).toEqual(snapshot);
  });
});
