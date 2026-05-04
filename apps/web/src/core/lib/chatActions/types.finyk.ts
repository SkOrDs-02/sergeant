/**
 * Finyk-доменні chat-action payload-и + share-shape entities (Budget,
 * Debt, Receivable, MonthlyPlan). Виокремлено з `types.ts` (initiative
 * 0001 Phase 2). Імпортуються через barrel `./types` без зміни
 * шляхів у consumer-ах.
 */

// ─── Action payload-и ──────────────────────────────────────────────────────

export interface ChangeCategoryAction {
  name: "change_category";
  input: { tx_id: string; category_id: string };
}

export interface FindTransactionAction {
  name: "find_transaction";
  input: {
    query?: string;
    amount?: number | string;
    amount_tolerance?: number | string;
    date_from?: string;
    date_to?: string;
    limit?: number | string;
  };
}

export interface BatchCategorizeAction {
  name: "batch_categorize";
  input: {
    pattern: string;
    category_id: string;
    dry_run?: boolean;
    amount?: number | string;
    amount_tolerance?: number | string;
    date_from?: string;
    date_to?: string;
    limit?: number | string;
  };
}

export interface CreateDebtAction {
  name: "create_debt";
  input: {
    name: string;
    amount: number | string;
    due_date?: string;
    emoji?: string;
  };
}

export interface CreateReceivableAction {
  name: "create_receivable";
  input: { name: string; amount: number | string };
}

export interface HideTransactionAction {
  name: "hide_transaction";
  input: { tx_id: string };
}

export interface SetBudgetLimitAction {
  name: "set_budget_limit";
  input: { category_id: string; limit: number | string };
}

export interface SetMonthlyPlanAction {
  name: "set_monthly_plan";
  input: {
    income?: number | string | null;
    expense?: number | string | null;
    savings?: number | string | null;
  };
}

export interface CreateTransactionAction {
  name: "create_transaction";
  input: {
    type?: string;
    amount: number | string;
    category?: string;
    description?: string;
    date?: string;
  };
}

export interface DeleteTransactionAction {
  name: "delete_transaction";
  input: { tx_id: string };
}

export interface UpdateBudgetAction {
  name: "update_budget";
  input: {
    scope: "limit" | "goal";
    category_id?: string;
    limit?: number | string;
    name?: string;
    target_amount?: number | string;
    saved_amount?: number | string;
  };
}

export interface MarkDebtPaidAction {
  name: "mark_debt_paid";
  input: {
    debt_id: string;
    amount?: number | string;
    note?: string;
  };
}

export interface AddAssetAction {
  name: "add_asset";
  input: {
    name: string;
    amount: number | string;
    currency?: string;
  };
}

export interface ImportMonobankRangeAction {
  name: "import_monobank_range";
  input: { from: string; to: string };
}

export interface SplitTransactionAction {
  name: "split_transaction";
  input: {
    tx_id: string;
    parts: Array<{ category_id: string; amount: number | string }>;
  };
}

export interface RecurringExpenseAction {
  name: "recurring_expense";
  input: {
    name: string;
    amount: number | string;
    day_of_month?: number | string;
    category?: string;
  };
}

export interface ExportReportAction {
  name: "export_report";
  input: { period?: string; from?: string; to?: string };
}

// ─── Domain entities (зберігаються в localStorage та повертаються з handler-ів) ─

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

export interface Debt {
  id: string;
  name: string;
  totalAmount: number;
  dueDate: string;
  emoji: string;
  linkedTxIds: string[];
}

export interface Receivable {
  id: string;
  name: string;
  amount: number;
  linkedTxIds: string[];
}

export interface MonthlyPlan {
  income?: string;
  expense?: string;
  savings?: string;
}
