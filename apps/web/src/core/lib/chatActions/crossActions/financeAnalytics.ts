import { ls } from "../../hubChatUtils";
import {
  calcCategorySpent,
  getTxStatAmount,
} from "../../../../modules/finyk/utils";
import {
  INTERNAL_TRANSFER_ID,
  mergeExpenseCategoryDefinitions,
} from "../../../../modules/finyk/constants";
import type {
  CategoryBreakdownAction,
  DetectAnomaliesAction,
  SpendingTrendAction,
} from "../types";

export function spendingTrend(action: SpendingTrendAction): string {
  const { period_days } = (action as SpendingTrendAction).input || {};
  const days = Number(period_days) || 30;
  const now = Date.now();
  const currentStart = now - days * 86400000;
  const prevStart = currentStart - days * 86400000;
  const txCache = ls<{
    txs?: Array<{
      id: string;
      amount: number;
      time?: number;
      description?: string;
      mcc?: number;
    }>;
  } | null>("finyk_tx_cache", null);
  const allTxs = txCache?.txs || [];
  const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
  const trendSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const txs = allTxs.filter((t) => !hiddenTxIds.includes(t.id || ""));
  const currentPeriod = txs.filter((t) => {
    const ts = (t.time || 0) * 1000;
    return ts >= currentStart && ts <= now;
  });
  const prevPeriod = txs.filter((t) => {
    const ts = (t.time || 0) * 1000;
    return ts >= prevStart && ts < currentStart;
  });
  const sumExpenses = (arr: typeof txs) =>
    arr
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + getTxStatAmount(t, trendSplits), 0);
  const sumIncome = (arr: typeof txs) =>
    arr.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount / 100, 0);
  const curExp = sumExpenses(currentPeriod);
  const prevExp = sumExpenses(prevPeriod);
  const curInc = sumIncome(currentPeriod);
  const change =
    prevExp > 0 ? Math.round(((curExp - prevExp) / prevExp) * 100) : 0;
  const avgPerDay = days > 0 ? Math.round(curExp / days) : 0;
  const parts: string[] = [
    `Тренд витрат за ${days} днів:`,
    `Витрати: ${Math.round(curExp)} грн (${avgPerDay} грн/день)`,
    `Дохід: ${Math.round(curInc)} грн`,
    `Попередній період: ${Math.round(prevExp)} грн`,
    `Зміна: ${change >= 0 ? "+" : ""}${change}%`,
    `Транзакцій: ${currentPeriod.length}`,
  ];
  return parts.join("\n");
}

export function categoryBreakdown(action: CategoryBreakdownAction): string {
  const { period_days } = (action as CategoryBreakdownAction).input || {};
  const days = Number(period_days) || 30;
  const cutoff = Date.now() - days * 86400000;
  const txCache = ls<{
    txs?: Array<{
      id: string;
      amount: number;
      time?: number;
      description?: string;
      mcc?: number;
    }>;
  } | null>("finyk_tx_cache", null);
  const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
  const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
  const catMap = ls<Record<string, string>>("finyk_tx_cats", {});
  const breakdownSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const expenses = (txCache?.txs || []).filter((t) => {
    if (hiddenTxIds.includes(t.id || "")) return false;
    const ts = (t.time || 0) * 1000;
    return t.amount < 0 && ts >= cutoff;
  });
  interface CatDef {
    id: string;
    label: string;
  }
  const sorted = (mergeExpenseCategoryDefinitions(customC) as CatDef[])
    .filter((c) => c.id !== "income" && c.id !== INTERNAL_TRANSFER_ID)
    .map((c) => ({
      label: c.label,
      amount: calcCategorySpent(
        expenses,
        c.id,
        catMap,
        breakdownSplits,
        customC,
      ),
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, c) => s + c.amount, 0);
  const parts: string[] = [
    `Витрати по категоріях за ${days} днів (${Math.round(total)} грн):`,
  ];
  for (const c of sorted.slice(0, 15)) {
    const pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
    parts.push(`  ${c.label}: ${Math.round(c.amount)} грн (${pct}%)`);
  }
  return parts.join("\n");
}

export function detectAnomalies(action: DetectAnomaliesAction): string {
  const { period_days, threshold_multiplier } =
    (action as DetectAnomaliesAction).input || {};
  const days = Number(period_days) || 30;
  const threshold = Number(threshold_multiplier) || 3;
  const cutoff = Date.now() - days * 86400000;
  const txCache = ls<{
    txs?: Array<{
      id: string;
      amount: number;
      time?: number;
      description?: string;
      mcc?: number;
    }>;
  } | null>("finyk_tx_cache", null);
  const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
  const anomalySplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const expenses = (txCache?.txs || []).filter((t) => {
    if (hiddenTxIds.includes(t.id || "")) return false;
    const ts = (t.time || 0) * 1000;
    return t.amount < 0 && ts >= cutoff;
  });
  if (expenses.length < 3)
    return "Недостатньо транзакцій для аналізу аномалій.";
  const amounts = expenses
    .map((t) => getTxStatAmount(t, anomalySplits))
    .filter((a) => a > 0);
  if (amounts.length < 3) return "Недостатньо транзакцій для аналізу аномалій.";
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const anomalies = expenses
    .filter((t) => getTxStatAmount(t, anomalySplits) > avg * threshold)
    .sort(
      (a, b) =>
        getTxStatAmount(b, anomalySplits) - getTxStatAmount(a, anomalySplits),
    )
    .slice(0, 5);
  if (anomalies.length === 0) {
    return `За ${days} днів аномалій не виявлено (середня витрата: ${Math.round(avg)} грн, поріг: ${Math.round(avg * threshold)} грн).`;
  }
  const parts: string[] = [
    `Аномальні витрати за ${days} днів (середня: ${Math.round(avg)} грн, поріг ×${threshold}):`,
  ];
  for (const tx of anomalies) {
    const d = tx.time
      ? new Date(tx.time * 1000).toLocaleDateString("uk-UA")
      : "?";
    parts.push(
      `  ${d}: ${Math.round(getTxStatAmount(tx, anomalySplits))} грн — ${tx.description || "(без опису)"}`,
    );
  }
  return parts.join("\n");
}
