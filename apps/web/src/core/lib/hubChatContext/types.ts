// Internal interfaces for the hub-chat context aggregator. Kept module-private
// (no `@sergeant/finyk-domain` / `@sergeant/fizruk-domain` types) because the
// shapes are intentionally loose — `buildContext` reads several legacy
// `localStorage` slices that pre-date the domain packages and only consumes a
// subset of each field.

export interface Transaction {
  id: string;
  amount: number;
  description?: string;
  mcc?: number;
  time?: number;
}

export interface Account {
  id?: string;
  balance?: number;
  creditLimit?: number;
}

export interface InfoCache {
  accounts?: Account[];
  name?: string;
}

export interface TxCache {
  txs?: Transaction[];
  timestamp?: number;
}

export interface Debt {
  id: string;
  name: string;
  amount: number;
  totalAmount: number;
  dueDate?: string | null;
  emoji?: string;
  linkedTxIds?: string[];
  [extra: string]: unknown;
}

export interface Receivable {
  id: string;
  name: string;
  amount: number;
  linkedTxIds?: string[];
  [extra: string]: unknown;
}

export interface BudgetLimit {
  id: string;
  type: "limit";
  categoryId: string;
  limit: number;
}

export interface BudgetGoal {
  id: string;
  type: "goal";
  name: string;
  targetAmount: number;
  savedAmount?: number;
}

export type Budget = BudgetLimit | BudgetGoal;

export interface MonthlyPlan {
  income?: string | number;
  expense?: string | number;
  savings?: string | number;
}

export interface Subscription {
  id: string;
  name: string;
}

export interface AllData {
  transactions: Transaction[];
  accounts: Account[];
  clientName: string;
  cacheTime: number | null;
  hiddenAccounts: string[];
  budgets: Budget[];
  manualDebts: Debt[];
  receivables: Receivable[];
  txCategories: Record<string, string>;
  txSplits: Record<string, unknown>;
  customCategories: unknown[];
  monthlyPlan: MonthlyPlan;
  subscriptions: Subscription[];
  monoDebtLinked: Record<string, unknown>;
  statTx: Transaction[];
  excludedIds: Set<string>;
}

export interface HabitState {
  habits?: Array<{
    id: string;
    name?: string;
    emoji?: string;
    archived?: boolean;
  }>;
  completions?: Record<string, string[]>;
}

export interface NutritionMeal {
  name?: string;
  macros?: {
    kcal?: number;
    protein_g?: number;
    fat_g?: number;
    carbs_g?: number;
  };
}

export interface NutritionDay {
  meals?: NutritionMeal[];
}

export interface NutritionPrefs {
  dailyTargetKcal?: number;
  dailyTargetProtein_g?: number;
  dailyTargetProtein?: number;
}

export interface CategoryDef {
  id: string;
  label: string;
}
