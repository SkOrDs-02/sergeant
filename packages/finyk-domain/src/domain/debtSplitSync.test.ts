import { describe, expect, it } from "vitest";
import {
  decideDebtPaymentAfterSplitChange,
  sumDebtSplitAmountUAH,
} from "./debtSplitSync";
import type { Debt } from "./debtEngine";

const TX_ID = "bank-1";

/** Пасив, що тримає TX_ID платежем на 300 ₴. */
const debtWithPayment = (amount = 300): Debt => ({
  id: "d1",
  amount: 5000,
  name: "Кредитка ПриватБанк",
  linkedTxIds: [TX_ID],
  txLinks: { [TX_ID]: { role: "payment", amount } },
});

describe("sumDebtSplitAmountUAH", () => {
  it("повертає null, коли спліту немає — це НЕ нуль", () => {
    // Різниця принципова: null означає «транзакція ціла, бери повну суму»,
    // а 0 означає «людина розписала все повз борг».
    expect(sumDebtSplitAmountUAH(null)).toBeNull();
    expect(sumDebtSplitAmountUAH([])).toBeNull();
  });

  it("підсумовує лише частки категорії debt", () => {
    expect(
      sumDebtSplitAmountUAH([
        { categoryId: "debt", amount: 100 },
        { categoryId: "food", amount: 150 },
        { categoryId: "debt", amount: 50 },
      ]),
    ).toBe(150);
  });

  it("дає 0, коли частки debt у спліті немає", () => {
    expect(
      sumDebtSplitAmountUAH([
        { categoryId: "food", amount: 150 },
        { categoryId: "transport", amount: 100 },
      ]),
    ).toBe(0);
  });
});

describe("decideDebtPaymentAfterSplitChange", () => {
  it("транзакція без привʼязки — нічого не робимо", () => {
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 250,
        nextSplits: [{ categoryId: "debt", amount: 100 }],
        debts: [{ id: "d1", amount: 5000, linkedTxIds: [] }],
      }),
    ).toEqual({ kind: "none" });
  });

  it("привʼязка з роллю source не зачіпається", () => {
    // Ролі надходження живуть поза спліт-редактором (він лише для витрат).
    const debt: Debt = {
      id: "d1",
      amount: 5000,
      name: "Позика",
      linkedTxIds: [TX_ID],
      txLinks: { [TX_ID]: { role: "source", amount: 5000 } },
    };
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 5000,
        nextSplits: [{ categoryId: "food", amount: 5000 }],
        debts: [debt],
      }),
    ).toEqual({ kind: "none" });
  });

  it("частку debt зменшено — оновлюємо суму й показуємо перехід", () => {
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 1000,
        nextSplits: [
          { categoryId: "debt", amount: 150 },
          { categoryId: "food", amount: 850 },
        ],
        debts: [debtWithPayment(300)],
      }),
    ).toEqual({
      kind: "update",
      debtId: "d1",
      debtName: "Кредитка ПриватБанк",
      previousAmountUAH: 300,
      nextAmountUAH: 150,
    });
  });

  it("частку debt збільшено — так само оновлюємо", () => {
    const decision = decideDebtPaymentAfterSplitChange({
      txId: TX_ID,
      txAmountUAH: 1000,
      nextSplits: [
        { categoryId: "debt", amount: 700 },
        { categoryId: "food", amount: 300 },
      ],
      debts: [debtWithPayment(300)],
    });
    expect(decision).toMatchObject({ kind: "update", nextAmountUAH: 700 });
  });

  it("спліт прибрано повністю — платіж повертається до ПОВНОЇ суми", () => {
    // Саме цей напрямок неможливо порахувати всередині `setSplitTx`: там
    // немає сирої суми транзакції.
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 1000,
        nextSplits: null,
        debts: [debtWithPayment(300)],
      }),
    ).toMatchObject({
      kind: "update",
      previousAmountUAH: 300,
      nextAmountUAH: 1000,
    });
  });

  it("частки debt не лишилось — питаємо, а не відвʼязуємо мовчки", () => {
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 1000,
        nextSplits: [
          { categoryId: "food", amount: 850 },
          { categoryId: "transport", amount: 150 },
        ],
        debts: [debtWithPayment(300)],
      }),
    ).toEqual({
      kind: "confirm-unlink",
      debtId: "d1",
      debtName: "Кредитка ПриватБанк",
      previousAmountUAH: 300,
    });
  });

  it("сума не змінилась — жодного тосту й жодного запису", () => {
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 1000,
        nextSplits: [
          { categoryId: "debt", amount: 300 },
          { categoryId: "food", amount: 700 },
        ],
        debts: [debtWithPayment(300)],
      }),
    ).toEqual({ kind: "none" });
  });

  it("копійчана різниця округлення не вважається зміною", () => {
    expect(
      decideDebtPaymentAfterSplitChange({
        txId: TX_ID,
        txAmountUAH: 1000,
        nextSplits: [
          { categoryId: "debt", amount: 100.1 },
          { categoryId: "debt", amount: 200.2 },
        ],
        debts: [debtWithPayment(300.3)],
      }),
    ).toEqual({ kind: "none" });
  });

  it("пасив без назви має читабельний підпис для діалогу", () => {
    const decision = decideDebtPaymentAfterSplitChange({
      txId: TX_ID,
      txAmountUAH: 1000,
      nextSplits: [{ categoryId: "food", amount: 1000 }],
      debts: [
        {
          id: "d1",
          amount: 5000,
          name: "   ",
          linkedTxIds: [TX_ID],
          txLinks: { [TX_ID]: { role: "payment", amount: 300 } },
        },
      ],
    });
    expect(decision).toMatchObject({ debtName: "пасив без назви" });
  });
});
