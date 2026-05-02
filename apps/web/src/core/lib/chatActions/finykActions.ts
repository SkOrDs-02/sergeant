import { addAsset, recurringExpense } from "./finykActions/assets";
import {
  setBudgetLimit,
  setMonthlyPlan,
  updateBudget,
} from "./finykActions/budgets";
import {
  createDebt,
  createReceivable,
  markDebtPaid,
} from "./finykActions/debts";
import { importMonobankRange } from "./finykActions/monobank";
import { exportReport } from "./finykActions/report";
import {
  batchCategorize,
  changeCategory,
  findTransaction,
} from "./finykActions/search";
import {
  createTransaction,
  deleteTransaction,
  hideTransaction,
  splitTransaction,
} from "./finykActions/transactions";
import type {
  AddAssetAction,
  BatchCategorizeAction,
  ChangeCategoryAction,
  ChatAction,
  ChatActionResult,
  CreateDebtAction,
  CreateReceivableAction,
  CreateTransactionAction,
  DeleteTransactionAction,
  ExportReportAction,
  FindTransactionAction,
  HideTransactionAction,
  ImportMonobankRangeAction,
  MarkDebtPaidAction,
  RecurringExpenseAction,
  SetBudgetLimitAction,
  SetMonthlyPlanAction,
  SplitTransactionAction,
  UpdateBudgetAction,
} from "./types";

/**
 * Finyk-domain HubChat tool dispatcher. Routes each `ChatAction.name`
 * to the matching per-domain handler in `finykActions/*`. Handlers
 * return either a `string` (plain `tool_result`) або `ChatActionUndoableResult`
 * (string + undo callback). Original 758-LOC switch був декомпозований
 * на 7 файлів за доменами (search/transactions/debts/budgets/assets/
 * monobank/report); цей файл лишається thin router < 100 LOC.
 */
export function handleFinykAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "change_category":
      return changeCategory(action as ChangeCategoryAction);
    case "find_transaction":
      return findTransaction(action as FindTransactionAction);
    case "batch_categorize":
      return batchCategorize(action as BatchCategorizeAction);
    case "create_debt":
      return createDebt(action as CreateDebtAction);
    case "create_receivable":
      return createReceivable(action as CreateReceivableAction);
    case "hide_transaction":
      return hideTransaction(action as HideTransactionAction);
    case "set_budget_limit":
      return setBudgetLimit(action as SetBudgetLimitAction);
    case "set_monthly_plan":
      return setMonthlyPlan(action as SetMonthlyPlanAction);
    case "create_transaction":
      return createTransaction(action as CreateTransactionAction);
    case "delete_transaction":
      return deleteTransaction(action as DeleteTransactionAction);
    case "update_budget":
      return updateBudget(action as UpdateBudgetAction);
    case "mark_debt_paid":
      return markDebtPaid(action as MarkDebtPaidAction);
    case "add_asset":
      return addAsset(action as AddAssetAction);
    case "import_monobank_range":
      return importMonobankRange(action as ImportMonobankRangeAction);
    case "split_transaction":
      return splitTransaction(action as SplitTransactionAction);
    case "recurring_expense":
      return recurringExpense(action as RecurringExpenseAction);
    case "export_report":
      return exportReport(action as ExportReportAction);
    default:
      return undefined;
  }
}
