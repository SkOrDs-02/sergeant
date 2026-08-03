/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * AI-NOTE: винесено з `useMonobankWebhook.ts`, щоб пікер привʼязки
 * (`useLinkableTransactions`) міг мапити свій власний, ширший діапазон
 * транзакцій, не імпортуючи весь webhook-хук.
 */
import type { MonoTransactionDto } from "@shared/api";
import { normalizeTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

export function webhookTxToNormalized(dto: MonoTransactionDto): Transaction {
  return normalizeTransaction(
    {
      id: dto.monoTxId,
      time: Math.floor(new Date(dto.time).getTime() / 1000),
      amount: dto.amount,
      description: dto.description ?? "",
      mcc: dto.mcc ?? 0,
      originalMcc: dto.originalMcc ?? undefined,
      hold: dto.hold ?? undefined,
      operationAmount: dto.operationAmount,
      currencyCode: dto.currencyCode,
      commissionRate: dto.commissionRate ?? undefined,
      cashbackAmount: dto.cashbackAmount ?? undefined,
      balance: dto.balance ?? undefined,
      comment: dto.comment ?? undefined,
      receiptId: dto.receiptId ?? undefined,
      invoiceId: dto.invoiceId ?? undefined,
      counterEdrpou: dto.counterEdrpou ?? undefined,
      counterIban: dto.counterIban ?? undefined,
      counterName: dto.counterName ?? undefined,
    },
    { source: "monobank", accountId: dto.monoAccountId },
  );
}
