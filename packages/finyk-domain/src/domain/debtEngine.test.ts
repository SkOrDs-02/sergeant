import { describe, expect, it } from "vitest";
import {
  calcDebtRemaining,
  calcReceivableRemaining,
  defaultDebtTxRole,
  defaultReceivableTxRole,
  describeLinkedTxRole,
  getDebtEffectiveTotal,
  getDebtOriginated,
  getDebtPaid,
  getDebtTxRole,
  getLinkedTxRole,
  getReceivableEffectiveTotal,
  getReceivableOriginated,
  getReceivablePaid,
  getReceivableTxRole,
} from "./debtEngine.js";

describe("debtEngine — борг (я винен)", () => {
  it("calcDebtRemaining: база + збільшення − сплати", () => {
    const debt = {
      totalAmount: 1000,
      linkedTxIds: ["origin1", "pay1"],
      txLinks: {
        origin1: { role: "increase", amount: 500 },
        pay1: { role: "payment", amount: 200 },
      },
    } as never;
    // ефективно: 1000 + 500 − 200 = 1300
    expect(calcDebtRemaining(debt, [])).toBe(1300);
  });

  it("роль source лише пояснює борг і НЕ додається до суми", () => {
    const debt = {
      totalAmount: 1000,
      linkedTxIds: ["origin1"],
      txLinks: { origin1: { role: "source", amount: 1000 } },
    } as never;
    expect(getDebtOriginated(debt, [])).toBe(0);
    expect(calcDebtRemaining(debt, [])).toBe(1000);
  });

  it("legacy-привʼязка з origin-знаком трактується як source (не роздуває пасив)", () => {
    const debt = { totalAmount: 1000, linkedTxIds: ["origin1"] } as never;
    const transactions = [{ id: "origin1", amount: 100_000 }];
    expect(getDebtOriginated(debt, transactions)).toBe(0);
    expect(calcDebtRemaining(debt, transactions)).toBe(1000);
  });

  it("legacy-привʼязка з відʼємним знаком лишається сплатою", () => {
    const debt = { totalAmount: 1000, linkedTxIds: ["pay1"] } as never;
    const transactions = [{ id: "pay1", amount: -200_00 }];
    expect(getDebtPaid(debt, transactions)).toBe(200);
    expect(calcDebtRemaining(debt, transactions)).toBe(800);
  });

  it("сума береться зі знімка привʼязки, навіть коли транзакції немає у вікні", () => {
    const debt = {
      totalAmount: 1000,
      linkedTxIds: ["pay1"],
      txLinks: { pay1: { role: "payment", amount: 250 } },
    } as never;
    // порожній список транзакцій — знімок усе одно дає 250
    expect(getDebtPaid(debt, [])).toBe(250);
  });

  it("calcDebtRemaining: не менше нуля при переплаті", () => {
    const debt = {
      totalAmount: 100,
      linkedTxIds: ["p1"],
      txLinks: { p1: { role: "payment", amount: 500 } },
    } as never;
    expect(calcDebtRemaining(debt, [])).toBe(0);
  });

  it("getDebtPaid рахує лише привʼязки з роллю payment", () => {
    const debt = {
      linkedTxIds: ["a", "b"],
      txLinks: {
        a: { role: "payment", amount: 100 },
        b: { role: "increase", amount: 50 },
      },
    } as never;
    expect(getDebtPaid(debt, [])).toBe(100);
  });

  it("getDebtEffectiveTotal зводить базу та збільшення", () => {
    const debt = {
      totalAmount: 300,
      linkedTxIds: ["o"],
      txLinks: { o: { role: "increase", amount: 100 } },
    } as never;
    expect(getDebtEffectiveTotal(debt, [])).toBe(400);
  });

  it("defaultDebtTxRole: надходження → source, витрата → payment", () => {
    expect(defaultDebtTxRole({ amount: 100 })).toBe("source");
    expect(defaultDebtTxRole({ amount: -50 })).toBe("payment");
  });

  it("getDebtTxRole розрізняє виникнення та сплату", () => {
    expect(getDebtTxRole({ amount: 100 }).kind).toBe("origin");
    expect(getDebtTxRole({ amount: -50 }).kind).toBe("payment");
  });
});

describe("debtEngine — дебіторка (мені винні)", () => {
  it("calcReceivableRemaining: база + збільшення − погашення", () => {
    const rec = {
      amount: 800,
      linkedTxIds: ["orig", "pay"],
      txLinks: {
        orig: { role: "increase", amount: 40 },
        pay: { role: "payment", amount: 250 },
      },
    } as never;
    // ефективно: 800 + 40 − 250 = 590
    expect(calcReceivableRemaining(rec, [])).toBe(590);
  });

  it("legacy-привʼязка з origin-знаком не роздуває актив", () => {
    const rec = { amount: 800, linkedTxIds: ["orig"] } as never;
    const transactions = [{ id: "orig", amount: -40_00 }];
    expect(getReceivableOriginated(rec, transactions)).toBe(0);
    expect(calcReceivableRemaining(rec, transactions)).toBe(800);
  });

  it("calcReceivableRemaining: не менше нуля", () => {
    const rec = {
      amount: 100,
      linkedTxIds: ["p"],
      txLinks: { p: { role: "payment", amount: 500 } },
    } as never;
    expect(calcReceivableRemaining(rec, [])).toBe(0);
  });

  it("getReceivablePaid рахує лише привʼязки з роллю payment", () => {
    const rec = { linkedTxIds: ["a", "b"] } as never;
    const transactions = [
      { id: "a", amount: 300_00 },
      { id: "b", amount: -50_00 },
    ];
    expect(getReceivablePaid(rec, transactions)).toBe(300);
  });

  it("getReceivableEffectiveTotal", () => {
    const rec = {
      amount: 500,
      linkedTxIds: ["x"],
      txLinks: { x: { role: "increase", amount: 100 } },
    } as never;
    expect(getReceivableEffectiveTotal(rec, [])).toBe(600);
  });

  it("defaultReceivableTxRole: витрата → source, надходження → payment", () => {
    expect(defaultReceivableTxRole({ amount: -30 })).toBe("source");
    expect(defaultReceivableTxRole({ amount: 100 })).toBe("payment");
  });

  it("getReceivableTxRole розрізняє виникнення та погашення", () => {
    expect(getReceivableTxRole({ amount: -30 }).kind).toBe("origin");
    expect(getReceivableTxRole({ amount: 100 }).kind).toBe("payment");
  });
});

describe("debtEngine — ролі привʼязок", () => {
  it("getLinkedTxRole повертає null для непривʼязаної транзакції", () => {
    const debt = { linkedTxIds: ["a"] } as never;
    expect(getLinkedTxRole(debt, "b", [])).toBeNull();
  });

  it("getLinkedTxRole віддає збережену роль", () => {
    const debt = {
      linkedTxIds: ["a"],
      txLinks: { a: { role: "increase", amount: 10 } },
    } as never;
    expect(getLinkedTxRole(debt, "a", [])).toBe("increase");
  });

  it("getLinkedTxRole для legacy-привʼязки виводить роль зі знаку", () => {
    const debt = { linkedTxIds: ["a"] } as never;
    expect(getLinkedTxRole(debt, "a", [{ id: "a", amount: -100 }])).toBe(
      "payment",
    );
    expect(getLinkedTxRole(debt, "a", [{ id: "a", amount: 100 }])).toBe(
      "source",
    );
  });

  it("describeLinkedTxRole розрізняє формулювання пасиву й активу", () => {
    expect(describeLinkedTxRole("source", "debt").label).toContain(
      "Виникнення",
    );
    expect(describeLinkedTxRole("increase", "debt").label).toContain(
      "Збільшення",
    );
    expect(describeLinkedTxRole("payment", "debt").label).toContain("Сплата");
    expect(describeLinkedTxRole("payment", "receivable").label).toContain(
      "Погашення",
    );
  });
});
