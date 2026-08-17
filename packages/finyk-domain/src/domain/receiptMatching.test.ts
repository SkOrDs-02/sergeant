import { describe, expect, it } from "vitest";
import {
  matchReceiptsToTransactions,
  type MonoTxForReceiptMatching,
  type ReceiptForMatching,
} from "./receiptMatching";

/** 2026-08-10 12:00 Kyiv (UTC+3 влітку) → 09:00 UTC. */
const NOON_KYIV_MS = Date.UTC(2026, 7, 10, 9, 0, 0);

function receipt(over: Partial<ReceiptForMatching> = {}): ReceiptForMatching {
  return {
    receiptId: "r-1",
    totalKop: 84_750,
    purchasedAtMs: NOON_KYIV_MS,
    ...over,
  };
}

function tx(
  over: Partial<MonoTxForReceiptMatching> = {},
): MonoTxForReceiptMatching {
  return {
    id: "tx-1",
    amountKop: -84_750,
    timeSeconds: Math.floor(NOON_KYIV_MS / 1000),
    mcc: 5411,
    description: "Сільпо",
    receiptId: null,
    ...over,
  };
}

describe("matchReceiptsToTransactions", () => {
  it("матчить точну суму й дату з confidence amount_date", () => {
    const result = matchReceiptsToTransactions([receipt()], [tx()]);
    expect(result.matches).toEqual([
      { receiptId: "r-1", transactionId: "tx-1", confidence: "amount_date" },
    ]);
    expect(result.unmatchedReceiptIds).toEqual([]);
    expect(result.ambiguousReceiptIds).toEqual([]);
  });

  it("збіг receipt_id — сильний сигнал навіть при різниці сум", () => {
    const result = matchReceiptsToTransactions(
      [receipt({ receiptId: "ЧЕК-77" })],
      [tx({ receiptId: "ЧЕК-77", amountKop: -10_000 })],
    );
    expect(result.matches).toEqual([
      { receiptId: "ЧЕК-77", transactionId: "tx-1", confidence: "receipt_id" },
    ]);
  });

  it("дозволяє зсув доби через київську межу (чек ввечері, списання після півночі)", () => {
    // Чек 23:30 Kyiv 10-го = 20:30 UTC; транзакція 00:20 Kyiv 11-го = 21:20 UTC.
    const receiptMs = Date.UTC(2026, 7, 10, 20, 30, 0);
    const txSec = Math.floor(Date.UTC(2026, 7, 10, 21, 20, 0) / 1000);
    const result = matchReceiptsToTransactions(
      [receipt({ purchasedAtMs: receiptMs })],
      [tx({ timeSeconds: txSec })],
    );
    expect(result.matches).toHaveLength(1);
  });

  it("не матчить, коли різниця понад одну київську добу", () => {
    const result = matchReceiptsToTransactions(
      [receipt()],
      [tx({ timeSeconds: Math.floor(NOON_KYIV_MS / 1000) + 3 * 24 * 3600 })],
    );
    expect(result.matches).toEqual([]);
    expect(result.unmatchedReceiptIds).toEqual(["r-1"]);
  });

  it("два чеки на одну суму в один день → амбігуїті, нічого не матчиться", () => {
    const result = matchReceiptsToTransactions(
      [receipt({ receiptId: "r-1" }), receipt({ receiptId: "r-2" })],
      [tx()],
    );
    expect(result.matches).toEqual([]);
    expect(result.ambiguousReceiptIds).toEqual(
      expect.arrayContaining(["r-1", "r-2"]),
    );
  });

  it("дві транзакції-кандидати на один чек → амбігуїті", () => {
    const result = matchReceiptsToTransactions(
      [receipt()],
      [tx({ id: "tx-1" }), tx({ id: "tx-2" })],
    );
    expect(result.matches).toEqual([]);
    expect(result.ambiguousReceiptIds).toEqual(["r-1"]);
  });

  it("поповнення «Власного Рахунку» виключене з кандидатів", () => {
    const result = matchReceiptsToTransactions(
      [receipt()],
      [tx({ description: "Поповнення Власного Рахунку Сільпо" })],
    );
    expect(result.matches).toEqual([]);
    expect(result.unmatchedReceiptIds).toEqual(["r-1"]);
  });

  it("додатні суми (повернення) не є кандидатами", () => {
    const result = matchReceiptsToTransactions(
      [receipt()],
      [tx({ amountKop: 84_750 })],
    );
    expect(result.unmatchedReceiptIds).toEqual(["r-1"]);
  });

  it("не-грошові збіги без MCC 5411 і без «сільпо» в описі ігноруються", () => {
    const result = matchReceiptsToTransactions(
      [receipt()],
      [tx({ mcc: 5732, description: "Комора техніки" })],
    );
    expect(result.unmatchedReceiptIds).toEqual(["r-1"]);
  });

  it("чек без транзакції — першокласний unmatched, без force-match", () => {
    const result = matchReceiptsToTransactions([receipt()], []);
    expect(result.matches).toEqual([]);
    expect(result.unmatchedReceiptIds).toEqual(["r-1"]);
  });
});
