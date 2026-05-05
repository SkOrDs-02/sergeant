/**
 * Shared domain types for the Finyk module.
 *
 * These types are intentionally loose (optional fields, string unions kept
 * open where the existing runtime accepts legacy data) so that gradual TS
 * adoption does not break existing JS callers or persisted localStorage
 * payloads.
 */

/** Канонічний тип транзакції. */
export type TransactionType = "expense" | "income" | "transfer";

/** Канонічне джерело транзакції. */
export type TransactionSource = "manual" | "mono" | "ai" | "import";

/**
 * Уніфікована модель транзакції Фініка.
 *
 * amount — у signed minor units (копійках). Окрім канонічних полів
 * лишаємо legacy-поля (time/description/mcc/_source/_accountId…),
 * щоб не ламати UI та персистовані дані.
 */
export interface Transaction {
  // Канонічні поля
  id: string;
  amount: number;
  date: string;
  categoryId: string;
  type: TransactionType;
  merchant?: string | undefined;
  note?: string | undefined;
  source: TransactionSource;

  // Legacy/back-compat
  time: number;
  description: string;
  mcc: number;
  accountId: string | null;
  manual: boolean;
  manualId?: string | undefined;
  raw?: unknown;

  _source: string;
  _accountId: string | null;
  _manual: boolean;
  _manualId?: string | undefined;
}

/** Базова категорія витрат / доходів. */
export interface Category {
  id: string;
  label: string;
  mccs?: number[];
  keywords?: string[];
  color?: string;
}

/** Тип бюджету. */
export type BudgetType = "limit" | "goal";

/**
 * Конфіг одного бюджету (з finyk_budgets).
 * Схема тримається сумісною з існуючими сутностями у UI.
 */
export interface Budget {
  id: string;
  type?: BudgetType;
  limit?: number;
  categoryId?: string;
  label?: string;
  /** Для goal-бюджетів. */
  target?: number;
  current?: number;
  [extra: string]: unknown;
}

/** План місячних доходів/витрат. */
export interface MonthlyPlan {
  income?: number;
  expense?: number;
}

/** Split однієї транзакції на декілька категорій. */
export interface TxSplit {
  categoryId: string;
  amount: number;
}

export type TxSplitsMap = Record<string, TxSplit[] | undefined>;
export type TxCategoriesMap = Record<string, string | undefined>;

/** Фільтр календарного місяця: "YYYY-MM" або {year, month}. */
export type MonthFilter = string | { year: number; month: number } | null;

/** Опції для аналітичних селекторів. */
export interface SelectorOptions {
  excludedTxIds?: Set<string> | Iterable<string>;
  txSplits?: TxSplitsMap;
  txCategories?: TxCategoriesMap;
  customCategories?: Category[];
  month?: MonthFilter;
}

/**
 * Агрегат витрат/доходів за місяць — основний результат analytics-селекторів.
 */
export interface AnalyticsResult {
  spent: number;
  income: number;
  balance: number;
  txCount: number;
  /** Публічна назва `spent` (контракт селекторів). */
  totalExpense: number;
  /** Публічна назва `income` (контракт селекторів). */
  totalIncome: number;
}

/** Alias: результат getMonthlySummary. */
export type MonthlySummary = AnalyticsResult;

/** Попередньо обчислений індекс витрат по категоріях. */
export interface CategorySpendIndex {
  catSpend: Record<string, number>;
  totalSpent: number;
}

/** Елемент топ-категорій / розподілу по категоріях. */
export interface TopCategory {
  categoryId: string;
  label: string;
  spent: number;
  pct: number;
  color: string;
}

/** Порівняння поточного місяця з попереднім. */
export interface TrendComparison {
  currentSpent: number;
  prevSpent: number;
  diff: number;
  diffPct: number | null;
  currentIncome: number;
  prevIncome: number;
  incomeDiff: number;
  incomeDiffPct: number | null;
}

/**
 * Порівняння двох календарних періодів, побудоване на одному списку
 * транзакцій: містить метрики `TrendComparison` плюс самі ярлики
 * періодів у форматі "YYYY-MM" для підписів у UI.
 */
export interface PeriodComparison extends TrendComparison {
  currentMonth: string;
  previousMonth: string;
}

/** Елемент топу мерчантів. */
export interface MerchantStat {
  name: string;
  count: number;
  total: number;
}

/** Агрегат місячного бюджету. */
export interface MonthBudgetSummary {
  totalPlan: number;
  planIncome: number;
  totalFact: number;
  totalRemaining: number;
  safePerDay: number;
  isOverall: boolean;
  daysLeft: number;
}

/** Результат обчислень calculateRemainingBudget. */
export interface RemainingBudget {
  remaining: number;
  pct: number;
  isOver: boolean;
}
