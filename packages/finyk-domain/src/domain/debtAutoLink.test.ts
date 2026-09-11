import { describe, expect, it } from "vitest";
import { matchDebtAutoLinkTxIds, type AutoLinkableTx } from "./debtAutoLink.js";

const TX = (
  id: string,
  amount: number,
  description: string,
): AutoLinkableTx => ({ id, amount, description });

describe("debtAutoLink — авто-привʼязка за ключовим словом (Level 2, 2026-09-11)", () => {
  it("порожнє ключове слово → жодних збігів", () => {
    const debt = { autoLinkKeyword: "" };
    expect(
      matchDebtAutoLinkTxIds(debt, [TX("tx1", -50000, "Кредит Приват")]),
    ).toEqual([]);
  });

  it("ключове слово лише з пробілів → жодних збігів", () => {
    const debt = { autoLinkKeyword: "   " };
    expect(
      matchDebtAutoLinkTxIds(debt, [TX("tx1", -50000, "Кредит Приват")]),
    ).toEqual([]);
  });

  it("матчить лише ВИТРАТИ, регістронезалежно, за підрядком опису", () => {
    const debt = { autoLinkKeyword: "Кредит" };
    const matches = matchDebtAutoLinkTxIds(debt, [
      TX("tx-expense", -50000, "оплата кредиту приватбанк"),
      TX("tx-income", 50000, "Кредит поповнення"), // надходження — не борг-payment
      TX("tx-unrelated", -1000, "Кава"),
    ]);
    expect(matches).toEqual(["tx-expense"]);
  });

  it("виключає вже привʼязані id — ідемпотентність повторного проходу", () => {
    const debt = {
      autoLinkKeyword: "кредит",
      linkedTxIds: ["tx1"],
    };
    const matches = matchDebtAutoLinkTxIds(debt, [
      TX("tx1", -50000, "Кредит Приват"),
      TX("tx2", -30000, "Кредит Приват"),
    ]);
    expect(matches).toEqual(["tx2"]);
  });

  it("anti-resurrection: відвʼязана транзакція не повертається матчером", () => {
    const debt = {
      autoLinkKeyword: "кредит",
      linkedTxIds: [] as string[],
      autoLinkDismissedTxIds: ["tx1"],
    };
    const matches = matchDebtAutoLinkTxIds(debt, [
      TX("tx1", -50000, "Кредит Приват"),
      TX("tx2", -30000, "Кредит Приват"),
    ]);
    expect(matches).toEqual(["tx2"]);
  });

  it("порожній транзакційний опис не кидає — просто не матчить", () => {
    const debt = { autoLinkKeyword: "кредит" };
    expect(
      matchDebtAutoLinkTxIds(debt, [
        { id: "tx1", amount: -1000, description: null },
        { id: "tx2", amount: -1000 },
      ]),
    ).toEqual([]);
  });
});
