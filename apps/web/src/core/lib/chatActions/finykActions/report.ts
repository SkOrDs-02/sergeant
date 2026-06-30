/* eslint-disable sergeant-design/no-raw-storage-key --
   Chat-action executor (outside React): the bank tx cache + splits stay
   on LS (no SQLite canon); the hidden-tx read moved to the SQLite cache.
   Raw-key burndown: 2026-Q3. */
import { getKyivDateParts, parseKyivDate } from "@shared/lib/time/kyivTime";
import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import type { ExportReportAction, ChatActionResult } from "../types";

export function exportReport(action: ExportReportAction): ChatActionResult {
  const { period, from, to } = action.input || {};
  const now = new Date();
  let fromDate: Date;
  let toDate = now;
  if (period === "week") {
    fromDate = new Date(now.getTime() - 7 * 86400000);
  } else if (period === "custom" && from && to) {
    fromDate = new Date(`${from}T00:00:00`);
    toDate = new Date(`${to}T23:59:59`);
  } else {
    // Default: from the 1st of the current Kyiv month (00:00 Kyiv) so the
    // period boundary follows Europe/Kyiv, not the host timezone.
    const { year, month } = getKyivDateParts(now);
    fromDate =
      parseKyivDate(`${year}-${String(month).padStart(2, "0")}-01`) ?? now;
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
  const hiddenTxIds = getCachedFinykSqliteState().hiddenTransactions;
  const filtered = txs.filter((t) => !hiddenTxIds.includes(t.id));
  const expenses = filtered.filter((t) => t.amount < 0);
  const income = filtered.filter((t) => t.amount > 0);
  const totalExpense = expenses.reduce(
    (s, t) => s + getTxStatAmount(t, reportSplits),
    0,
  );
  const totalIncome = income.reduce((s, t) => s + t.amount / 100, 0);
  const dayFmt = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv" });
  const fromStr = dayFmt.format(fromDate);
  const toStr = dayFmt.format(toDate);
  return [
    `Звіт за ${fromStr} — ${toStr}:`,
    `Дохід: ${Math.round(totalIncome)} грн`,
    `Витрати: ${Math.round(totalExpense)} грн`,
    `Баланс: ${Math.round(totalIncome - totalExpense)} грн`,
    `Транзакцій: ${filtered.length} (витрат: ${expenses.length}, доходів: ${income.length})`,
  ].join("\n");
}
