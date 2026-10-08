/**
 * Легкий стан кешу Фініка з SQLite: інтерфейс, порожній знімок і геттер.
 *
 * AI-CONTEXT: винесено з `sqliteReader.ts` (2026-10-08), бо eager-хук
 * `core/activation/useActivationV2Boot.ts` читає лише `budgets.length` і
 * `refreshedAt`, а статичний імпорт рідера тягнув на критичний шлях сам
 * рідер, `finyk-domain/lib/merchantRules` + `recurringDetect` і
 * `finyk-domain/constants` (разом ~6 kB brotli). Пише кеш ЛИШЕ `sqliteReader.ts` через `setFinykSqliteCache`;
 * eager-код імпортує звідси, а не з рідера — інакше ребро повертається.
 */

import type {
  Budget,
  CustomCategory,
  ManualAsset,
  ManualExpense,
  MonoDebtLinkedMap,
  MonthlyPlan,
  NetworthEntry,
  Subscription,
  TxCategoriesMap,
  TxSplitsMap,
} from "../hooks/useStorage.types";
import type { Debt, Receivable } from "@sergeant/finyk-domain/domain";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";

export interface SqliteFinykCache {
  /** Account ids hidden from balances (set membership). */
  hiddenAccounts: string[];
  /** Transaction ids hidden from feeds (set membership). */
  hiddenTransactions: string[];
  /** User budgets (parsed from `data_json`). */
  budgets: Budget[];
  /** Subscriptions (parsed from `data_json`). */
  subscriptions: Subscription[];
  /** Manual assets (parsed from `data_json`). */
  manualAssets: ManualAsset[];
  /** Manual debts (parsed from `data_json`). */
  manualDebts: Debt[];
  /** Receivables (parsed from `data_json`). */
  receivables: Receivable[];
  /** Custom categories (parsed from `data_json`). */
  customCategories: CustomCategory[];
  /** Manual expenses (parsed from `data_json`). */
  manualExpenses: ManualExpense[];
  /** Per-tx category overrides keyed by transactionId. */
  txCategories: TxCategoriesMap;
  /** Per-tx splits keyed by transactionId. */
  txSplits: TxSplitsMap;
  /** Per-tx mono-debt links keyed by transactionId. */
  monoDebtLinkedTxIds: MonoDebtLinkedMap;
  /** Time-series networth history (oldest → newest). */
  networthHistory: NetworthEntry[];
  /** Singleton monthly plan (parsed from `monthly_plan_json`). */
  monthlyPlan: MonthlyPlan | null;
  /** Singleton balance-visibility flag from prefs. */
  showBalance: boolean | null;
  /**
   * Singleton list of Mono transaction ids excluded from statistics
   * (parsed from `excluded_stat_tx_ids_json`). `null` until the first
   * refresh completes — mirrors `monthlyPlan`/`showBalance` semantics.
   */
  excludedStatTxIds: string[] | null;
  /**
   * Singleton list of recurring-banner ids the user dismissed
   * (parsed from `dismissed_recurring_json`).
   */
  dismissedRecurring: string[] | null;
  /**
   * Правила «Завжди так для цього магазину» (parsed from
   * `prefs_json.merchantRules`). `null` — як і в сусідніх prefs-полів — до
   * першого прогріву й коли рядка prefs ще немає: тоді слот лишає те, що має,
   * а не затирає його порожнім списком.
   */
  merchantRules: MerchantRule[] | null;
  /** ISO timestamp of the last successful refresh, or null. */
  refreshedAt: string | null;
}

export const EMPTY_FINYK_SQLITE_CACHE: SqliteFinykCache = {
  hiddenAccounts: [],
  hiddenTransactions: [],
  budgets: [],
  subscriptions: [],
  manualAssets: [],
  manualDebts: [],
  receivables: [],
  customCategories: [],
  manualExpenses: [],
  txCategories: {},
  txSplits: {},
  monoDebtLinkedTxIds: {},
  networthHistory: [],
  monthlyPlan: null,
  showBalance: null,
  excludedStatTxIds: null,
  dismissedRecurring: null,
  merchantRules: null,
  refreshedAt: null,
};

let cache: SqliteFinykCache = { ...EMPTY_FINYK_SQLITE_CACHE };

/** Returns the current cached finyk state (sync, zero-cost). */
export function getCachedFinykSqliteState(): SqliteFinykCache {
  return cache;
}

/** Публікує новий знімок. Викликає лише `sqliteReader.ts`. */
export function setFinykSqliteCache(next: SqliteFinykCache): void {
  cache = next;
}
