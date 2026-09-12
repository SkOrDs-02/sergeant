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
      // Сервер уже резолвить категорію з MCC через той самий
      // `MCC_CATEGORIES` (packages/finyk-domain/src/constants.ts), тож тут
      // не вгадуємо її вдруге — передаємо як canonical `categoryId`.
      // `resolveCategoryId` у домені читає САМЕ це поле; користувацький
      // override (`txCategories[txId]`) застосовується ОКРЕМО, вище по
      // стеку (`getExpenseCategoryForTransaction(tx, overrideId, …)`) і
      // завжди має пріоритет над цим значенням. Без цього поля серверне
      // рішення губилось і категорія вгадувалась удруге на клієнті.
      //
      // `categorySlug` може бути NULL — і це НЕ дірка, а контракт: NULL
      // означає «сервер не вирішив», і тоді `getCategory` рахує категорію
      // з опису й MCC, як робила завжди. Саме так тепер класифікується
      // переказ card-to-card (MCC 4829): сервер мовчить, а боргом рядок
      // стає лише за борговим словом в описі — регресія 2026-09-12,
      // розбір у коментарі біля `id: "debt"` у `finyk-domain/constants.ts`.
      //
      // Лише для ВИТРАТИ (`amount < 0`). `categorySlug` — завжди слаг зі
      // списку категорій ВИТРАТ (`MCC_CATEGORIES`), а не доходу. Якщо
      // передати його й для надходження (рефанд/кешбек на той самий MCC
      // мерчанта), `getIncomeCategoryForTransaction` знаходить збіг id у
      // `MCC_CATEGORIES` (це один із трьох джерел її фолбеку) і малює
      // рядок надходження категорією витрати — напр. рефанд із «Сільпо»
      // отримав би чип «Продукти» замість нейтрального «Надходження».
      // Виявлено цим фіксом; перевірено скретч-тестом на
      // `getIncomeCategoryForTransaction`.
      categoryId: dto.amount < 0 ? (dto.categorySlug ?? undefined) : undefined,
    },
    { source: "monobank", accountId: dto.monoAccountId },
  );
}
