// Типи контексту для фінансових правил. Сам білдер (`buildFinanceContext`)
// читає `localStorage` і тому залишається у `apps/web`; сюди винесені
// лише платформо-незалежні типи + маленький helper `txTimestamp`.

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

/** Набір категорій ліміту з фолбеком на legacy `categoryId`. */
export function budgetCategoryIds(budget: Budget): string[] {
  const raw =
    Array.isArray(budget.categoryIds) && budget.categoryIds.length > 0
      ? budget.categoryIds
      : [budget.categoryId];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out;
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
export function txTimestamp(tx: Transaction): number {
  return tx.time > 1e10 ? tx.time : tx.time * 1000;
}
