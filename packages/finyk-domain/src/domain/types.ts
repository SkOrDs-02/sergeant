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
  [key: string]: unknown;
}

/** Базова категорія витрат / доходів. */
export interface Category {
  id: string;
  label: string;
  mccs?: number[] | undefined;
  keywords?: string[] | undefined;
  color?: string | undefined;
}

/**
 * Бюджет-ліміт — стеля витрат на одну категорію за місяць.
 */
export interface LimitBudget {
  id: string;
  type: "limit";
  categoryId: string;
  limit: number;
  /** Calendar window used to reset/aggregate the limit. Legacy records omit it. */
  period?: "month" | "week" | "one_time";
  /** ISO instant from which a one-time limit starts accumulating expenses. */
  createdAt?: string;
  /** Необов'язкова людино-читана назва (UI). */
  label?: string;
}

/**
 * Бюджет-ціль — накопичення до `targetAmount` (з опційним дедлайном).
 * Поля віддзеркалюють те, що пише `AddBudgetForm` і читає `GoalBudgetCard`.
 */
export interface GoalBudget {
  id: string;
  type: "goal";
  name: string;
  emoji?: string;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string;
  label?: string;
}

/**
 * Конфіг одного бюджету (з finyk_budgets). Дискримінований union за `type`,
 * тож goal-поля (`targetAmount`/`savedAmount`/…) звужуються типобезпечно
 * замість читання через `(b as { … }).x` cast-и (page-audit-05 F15).
 */
export type Budget = LimitBudget | GoalBudget;

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
  excludedTxIds?: Set<string> | Iterable<string> | undefined;
  txSplits?: TxSplitsMap | undefined;
  txCategories?: TxCategoriesMap | undefined;
  customCategories?: Category[] | undefined;
  month?: MonthFilter | undefined;
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

/** Результат обчислень calculateRemainingBudget. */
export interface RemainingBudget {
  remaining: number;
  pct: number;
  isOver: boolean;
}
