import type {
  Debt,
  Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";

export type Subscription = {
  id: string;
  name: string;
  emoji: string;
  keyword: string;
  billingDay: number;
  currency: string;
  linkedTxId?: string;
  [extra: string]: unknown;
};

export type RecurringCandidate = {
  key: string;
  displayName?: string;
  billingDay?: number;
  currency?: string;
  sampleTxIds?: string[];
};

export type Budget = {
  id: string;
  type?: "limit" | "goal";
  categoryId?: string;
  [extra: string]: unknown;
};

export type ManualAsset = {
  id: string;
  amount: number;
  emoji?: string;
  name?: string;
  currency?: string;
  linkedTxIds?: string[];
  [extra: string]: unknown;
};

export type ManualExpense = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
};

export type CustomCategory = {
  id: string;
  label: string;
  color?: string;
  icon?: string;
  parentId?: string;
};

export type TxCategoriesMap = Record<string, string | undefined>;
export type MonoDebtLinkedMap = Record<string, string[]>;

export type MonthlyPlan = {
  income: string | number;
  expense: string | number;
  savings: string | number;
};

export type NetworthEntry = { month: string; networth: number };

export type NetworthSnap = { date: string | null; value: number | null };

// Re-export domain types so callers can import everything from one place.
export type { Debt, Receivable, TxSplit, TxSplitsMap };
