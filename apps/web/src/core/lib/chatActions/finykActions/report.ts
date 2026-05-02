import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import type { ExportReportAction, ChatActionResult } from "../types";

export function exportReport(action: ExportReportAction): ChatActionResult {
  const { period, from, to } = action.input || {};
  const now = new Date();
  let fromDate: Date;
  let toDate = now;
  if (period === "week") {
    fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 7);
  } else if (period === "custom" && from && to) {
    fromDate = new Date(`${from}T00:00:00`);
    toDate = new Date(`${to}T23:59:59`);
  } else {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const fromTs = fromDate.getTime();
  const toTs = toDate.getTime();
  const txCache = ls<{
    txs?: Array<{
      id: string;
      amount: number;
      description?: string;
      mcc?: number;
      time?: number;
    }>;
  } | null>("finyk_tx_cache", null);
  const reportSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const txs = (txCache?.txs || []).filter((t) => {
    const ts = (t.time || 0) * 1000;
    return ts >= fromTs && ts <= toTs;
  });
  const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
  const filtered = txs.filter((t) => !hiddenTxIds.includes(t.id));
  const expenses = filtered.filter((t) => t.amount < 0);
  const income = filtered.filter((t) => t.amount > 0);
  const totalExpense = expenses.reduce(
    (s, t) => s + getTxStatAmount(t, reportSplits),
    0,
  );
  const totalIncome = income.reduce((s, t) => s + t.amount / 100, 0);
  const fromStr = fromDate.toLocaleDateString("uk-UA");
  const toStr = toDate.toLocaleDateString("uk-UA");
  return [
    `Звіт за ${fromStr} — ${toStr}:`,
    `Дохід: ${Math.round(totalIncome)} грн`,
    `Витрати: ${Math.round(totalExpense)} грн`,
    `Баланс: ${Math.round(totalIncome - totalExpense)} грн`,
    `Транзакцій: ${filtered.length} (витрат: ${expenses.length}, доходів: ${income.length})`,
  ].join("\n");
}
