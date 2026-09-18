// Типи контексту для фінансових правил. Сам білдер (`buildFinanceContext`)
// читає `localStorage` і тому залишається у `apps/web`; сюди винесені
// лише платформо-незалежні типи + маленький helper `txTimeMs`.

import { limitBudgetCategoryIds } from "@sergeant/finyk-domain/domain/budget";
import type { TxSplitsLike } from "@sergeant/finyk-domain/lib/transactions";

export interface Transaction {
  id: string;
  amount: number;
  time: number;
  description?: string;
  mcc?: number;
}

export interface ManualExpense {
  id?: string;
  amount: number;
  date: string;
  category?: string;
}

export interface Budget {
  id?: string;
  type: string;
  categoryId?: string;
  /** Мульти-категорійний ліміт; `categoryId` = перша категорія набору. */
  categoryIds?: string[];
  /** Власна назва комбо-ліміту. */
  label?: string;
  limit?: number;
}

/** Набір категорій ліміту з фолбеком на legacy `categoryId` (канон finyk-domain). */
export function budgetCategoryIds(budget: Budget): string[] {
  return limitBudgetCategoryIds({
    categoryId: budget.categoryId ?? "",
    ...(budget.categoryIds !== undefined
      ? { categoryIds: budget.categoryIds }
      : {}),
  });
}

export interface CustomCategory {
  id: string;
  label: string;
}

export interface FinanceContext {
  now: Date;
  monthStart: Date;
  transactions: Transaction[];
  manualExpenses: ManualExpense[];
  budgets: Budget[];
  limits: Budget[];
  txCategories: Record<string, string>;
  customCategories: CustomCategory[];
  hiddenTxIds: Set<string>;
  transferIds: Set<string>;
  /** Спліт-мапа транзакцій (id → частини за категоріями), для getTxStatAmount/calcFinykPeriodAggregate. */
  txSplits?: TxSplitsLike;
  thisMonthTx: Transaction[];
  /** Суми витрат за цей місяць, ключ — сирий override/label (legacy формат). */
  categorySpend: Record<string, number>;
  /** Суми за canonical id — для нових правил. */
  canonicalMonthSpend: Map<string, number>;
  /** Лічильник транзакцій за весь період, canonical id → count. */
  canonicalTotalCount: Map<string, number>;
}

/**
 * Таймстемп транзакції у мс. `time` зберігаються або як Unix-seconds
 * (Monobank API), або як JS ms; евристика 1e10 відрізняє їх.
 */
export function txTimeMs(tx: Transaction): number {
  return tx.time > 1e10 ? tx.time : tx.time * 1000;
}

// ponytail: alias for existing callers (noTxRecent.ts, apps/web) — rename them to txTimeMs when next touched.
export const txTimestamp = txTimeMs;

/** Обʼєднаний excluded-set (сховані + перекази) для банк-агрегаторів витрат. */
export function financeExcludedTxIds(
  ctx: Pick<FinanceContext, "hiddenTxIds" | "transferIds">,
): Set<string> {
  return new Set([...ctx.hiddenTxIds, ...ctx.transferIds]);
}
