import { describe, it, expect } from "vitest";
import {
  getFrequentCategories,
  getFrequentMerchants,
  manualCategoryToCanonicalId,
} from "./personalization.js";

// Зручний helper: робить банківську транзакцію-витрату у canonical-формі
// finyk (amount у копійках, time у секундах).
type BankTxOverrides = { id?: string; dateMs?: number } & Record<
  string,
  unknown
>;
function bankTx(overrides: BankTxOverrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    amount: -10000,
    time: Math.floor((overrides.dateMs ?? Date.now()) / 1000),
    description: "Test",
    mcc: 0,
    ...overrides,
  };
}

type ManualOverrides = { id?: string; date?: string } & Record<string, unknown>;
function manual(overrides: ManualOverrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    date: overrides.date || new Date().toISOString(),
    description: "ATB",
    amount: 100,
    category: "їжа",
    ...overrides,
  };
}

describe("manualCategoryToCanonicalId", () => {
  it("мапить стандартні підписи на canonical id", () => {
    expect(manualCategoryToCanonicalId("їжа")).toBe("food");
    expect(manualCategoryToCanonicalId("Транспорт")).toBe("transport");
    expect(manualCategoryToCanonicalId("інше")).toBe("other");
  });

  it("невідомі підписи лишає як є (нижній регістр)", () => {
    expect(manualCategoryToCanonicalId("Кальян")).toBe("кальян");
  });

  it("пусті значення → other", () => {
    expect(manualCategoryToCanonicalId("")).toBe("other");
    expect(manualCategoryToCanonicalId(undefined)).toBe("other");
  });
});

describe("getFrequentCategories", () => {
  const now = new Date("2025-03-15T12:00:00Z");

  it("порожні входи → порожній масив", () => {
    expect(getFrequentCategories([], [], { now })).toEqual([]);
    expect(getFrequentCategories(null, null, { now })).toEqual([]);
  });

  it("рахує частоту по банку і manual разом", () => {
    const txs = [
      bankTx({
        id: "t1",
        amount: -20000,
        dateMs: now.getTime() - 2 * 86400000,
        mcc: 5411,
        description: "АТБ",
      }),
      bankTx({
        id: "t2",
        amount: -15000,
        dateMs: now.getTime() - 5 * 86400000,
        mcc: 5411,
        description: "Сільпо",
      }),
      bankTx({
        id: "t3",
        amount: -30000,
        dateMs: now.getTime() - 1 * 86400000,
        mcc: 4121,
        description: "Bolt",
      }),
    ];
    const manuals = [
      manual({
        id: "m1",
        amount: 120,
        category: "їжа",
        date: new Date(now.getTime() - 3 * 86400000).toISOString(),
      }),
    ];
    const result = getFrequentCategories(txs as never, manuals as never, {
      now,
    });
    const ids = result.map((r) => r.id);
    expect(ids[0]).toBe("food"); // 3 використання (2 банк + 1 manual)
    expect(result[0]!.count).toBe(3);
    expect(ids).toContain("transport");
  });

  it("ігнорує транзакції поза вікном", () => {
    const txs = [
      bankTx({
        id: "old",
        mcc: 5411,
        dateMs: now.getTime() - 120 * 86400000,
      }),
      bankTx({
        id: "new",
        mcc: 5411,
        dateMs: now.getTime() - 2 * 86400000,
      }),
    ];
    const res = getFrequentCategories(txs as never, [], {
      now,
      windowDays: 60,
    });
    expect(res[0]!.count).toBe(1);
  });

  it("ігнорує виключені id", () => {
    const txs = [
      bankTx({ id: "x", mcc: 5411, dateMs: now.getTime() }),
      bankTx({ id: "y", mcc: 5411, dateMs: now.getTime() }),
    ];
    const res = getFrequentCategories(txs as never, [], {
      now,
      excludedTxIds: new Set(["x"]),
    });
    expect(res[0]!.count).toBe(1);
  });

  it("поважає overrides з txCategories", () => {
    const txs = [
      bankTx({
        id: "t1",
        mcc: 5411,
        description: "АТБ",
        dateMs: now.getTime(),
      }),
    ];
    const res = getFrequentCategories(txs as never, [], {
      now,
      txCategories: { t1: "entertainment" },
    });
    expect(res[0]!.id).toBe("entertainment");
  });
});

describe("getFrequentMerchants", () => {
  const now = new Date("2025-03-15T12:00:00Z");

  it("групує повторення одного мерчанта", () => {
    const txs = [
      bankTx({
        id: "a",
        description: "АТБ",
        amount: -10000,
        dateMs: now.getTime() - 1 * 86400000,
        mcc: 5411,
      }),
      bankTx({
        id: "b",
        description: "атб  ",
        amount: -20000,
        dateMs: now.getTime() - 2 * 86400000,
        mcc: 5411,
      }),
      bankTx({
        id: "c",
        description: "Сільпо",
        amount: -50000,
        dateMs: now.getTime(),
        mcc: 5411,
      }),
    ];
    const res = getFrequentMerchants(txs as never, [], { now });
    // АТБ — 2 хіти → у топі; Сільпо — 1, отже відфільтрований (threshold = 2).
    expect(res.length).toBe(1);
    expect(res[0]!.count).toBe(2);
    expect(res[0]!.total).toBe(300);
    expect(res[0]!.suggestedCategoryId).toBe("food");
  });

  it("manual-витрати рахуються разом із банковими", () => {
    const txs = [
      bankTx({
        id: "a",
        description: "Bolt",
        amount: -10000,
        dateMs: now.getTime(),
        mcc: 4121,
      }),
    ];
    const manuals = [
      manual({
        description: "bolt",
        amount: 200,
        category: "транспорт",
        date: new Date(now.getTime() - 1 * 86400000).toISOString(),
      }),
    ];
    const res = getFrequentMerchants(txs as never, manuals as never, { now });
    expect(res[0]!.count).toBe(2);
    expect(res[0]!.suggestedCategoryId).toBe("transport");
  });

  it("поважає limit", () => {
    const txs: ReturnType<typeof bankTx>[] = [];
    for (let i = 0; i < 10; i++) {
      txs.push(
        bankTx({
          id: `m${i}a`,
          description: `Merchant_${i}`,
          dateMs: now.getTime() - i * 86400000,
          mcc: 5411,
        }),
      );
      txs.push(
        bankTx({
          id: `m${i}b`,
          description: `Merchant_${i}`,
          dateMs: now.getTime() - i * 86400000,
          mcc: 5411,
        }),
      );
    }
    const res = getFrequentMerchants(txs as never, [], { now, limit: 3 });
    expect(res).toHaveLength(3);
  });
});
