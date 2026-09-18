/**
 * Shared types for the Finyk Overview screen (mobile port).
 *
 * Mirrors the shape that `apps/web/src/modules/finyk/pages/Overview.tsx`
 * receives via `mono` + `storage` props. We keep everything that's not
 * yet wired on mobile optional so the `useFinykOverviewData` stub can
 * return a minimal empty payload while future PRs (MMKV + mono hook)
 * progressively fill it in.
 */
import type {
  Budget,
  Transaction,
  MonthlyPlan,
  TxCategoriesMap,
  TxSplitsMap,
  Category,
} from "@sergeant/finyk-domain/domain";
import type {
  DebtLike,
  ReceivableLike,
} from "@sergeant/finyk-domain/domain/overview";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

export type { MonoAccount };

export interface NetworthPoint {
  date: string;
  value: number;
}

export interface ManualAsset {
  id: string;
  amount: number;
  currency: string;
}

export interface ManualExpense {
  id: string;
}

export interface Subscription {
  id: string;
  name: string;
  emoji?: string;
  billingDay: number;
  linkedTxId?: string;
  keyword?: string;
  currency?: string;
}

export interface FrequentCategory {
  id: string;
  label?: string;
  manualLabel?: string;
  count: number;
}

export interface FrequentMerchant {
  key: string;
  name: string;
  count: number;
  total: number;
  suggestedManualCategory?: string | null;
}

/**
 * Strongly-typed view-model consumed by `<Overview />`. Matches the
 * existing web-side merge of `mono` + `storage` but as a single object
 * so callers can spread a simple hook return.
 */
export interface FinykOverviewData {
  // --- Mono / real-tx side ------------------------------------------
  realTx: Transaction[];
  loadingTx: boolean;
  clientInfo: { name?: string } | null;
  accounts: MonoAccount[];
  transactions: Transaction[];
  privatTotal: number;

  // --- Storage side --------------------------------------------------
  budgets: Budget[];
  subscriptions: Subscription[];
  manualDebts: DebtLike[];
  receivables: ReceivableLike[];
  hiddenAccounts: string[];
  excludedTxIds: Set<string>;
  monthlyPlan: MonthlyPlan & { savings?: number };
  networthHistory: NetworthPoint[];
  txCategories: TxCategoriesMap;
  txSplits: TxSplitsMap;
  manualAssets: ManualAsset[];
  customCategories: Category[];
  manualExpenses: ManualExpense[];

  // --- Personalisation ----------------------------------------------
  frequentCategories: FrequentCategory[];
  frequentMerchants: FrequentMerchant[];

  // --- User preferences ---------------------------------------------
  showBalance: boolean;
}
