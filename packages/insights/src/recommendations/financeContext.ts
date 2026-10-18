// Типи контексту для фінансових правил. Сам білдер (`buildFinanceContext`)
// читає `localStorage` і тому залишається у `apps/web`; сюди винесені
// лише платформо-незалежні типи + маленький helper `txTimeMs`.

import {
  limitBudgetCategoryIds,
  type LimitUsageEntry,
} from "@sergeant/finyk-domain/domain/budget";
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
  /**
   * Канонічний excluded-set Фініка (`buildFinykExcludedTxIds` по bank+manual:
   * приховані, перекази, дебіторка, «виключити зі статистики», пари
   * «Скасування»). Id ручних записів у ньому — `manual_<id>`, як у всесвіті
   * витрат. Коли заданий, `financeExcludedTxIds` повертає саме його, а
   * `hiddenTxIds`/`transferIds` лишаються для сумісності (logic-08).
   */
  excludedTxIds?: ReadonlySet<string>;
  /** Спліт-мапа транзакцій (id → частини за категоріями), для getTxStatAmount/calcFinykPeriodAggregate. */
  txSplits?: TxSplitsLike;
  thisMonthTx: Transaction[];
  /**
   * Стан кожного ліміту з `calcLimitUsages` (finyk-domain): той самий
   * результат, що й на картці ліміту в Плануванні та в хаб-картці
   * перевищення. Правило `budget_limits` читає лише його.
   */
  limitUsage: readonly LimitUsageEntry[];
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

/**
 * Excluded-set для банк-агрегаторів витрат: канонічний `excludedTxIds`, коли
 * білдер контексту його поклав, інакше — сховані + перекази (старий вузький
 * набір для контекстів без канонічного).
 */
export function financeExcludedTxIds(
  ctx: Pick<FinanceContext, "hiddenTxIds" | "transferIds" | "excludedTxIds">,
): Set<string> {
  if (ctx.excludedTxIds) return new Set(ctx.excludedTxIds);
  return new Set([...ctx.hiddenTxIds, ...ctx.transferIds]);
}

/**
 * Id ручної витрати у всесвіті витрат Фініка: `manualExpenseToTransaction`
 * (finyk-domain) кладе `manual_<id>`, і саме під цим id вона потрапляє в
 * excluded-set, коли її сховали чи позначили «Не враховувати».
 */
export function manualExpenseTxId(
  me: Pick<ManualExpense, "id">,
): string | null {
  return me.id ? `manual_${me.id}` : null;
}

/** Чи ручну витрату виключено зі статистики (за тим самим набором, що й банк). */
export function isManualExpenseExcluded(
  excluded: ReadonlySet<string>,
  me: Pick<ManualExpense, "id">,
): boolean {
  const id = manualExpenseTxId(me);
  return id !== null && excluded.has(id);
}
