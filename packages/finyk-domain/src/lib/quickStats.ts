import { calcFinykPeriodAggregate } from "./spending.js";
import type { SpendingTxLike, TxSplitsLike } from "./transactions.js";

interface QuickStatsTx extends SpendingTxLike {
  time?: number;
}

export interface FinykQuickStatsInput {
  transactions: QuickStatsTx[] | null | undefined;
  excludedTxIds?: Set<string> | string[];
  txSplits?: TxSplitsLike;
  /** Planned monthly expense in UAH (`monthlyPlan.expense`). `0`/absent → no `budgetLeft`. */
  planExpense?: number;
  /** Epoch ms — start of "today" in Kyiv local time (inclusive). */
  todayStartMs: number;
  /** Epoch ms — start of the next Kyiv day (exclusive upper bound for both windows). */
  todayEndMs: number;
  /** Epoch ms — start of the current month in Kyiv local time (inclusive). */
  monthStartMs: number;
}

export interface FinykQuickStats {
  /** Rounded UAH spent today (Kyiv day). */
  todaySpent: number;
  /** Rounded UAH left of the monthly expense plan, or `null` when no plan is set. */
  budgetLeft: number | null;
}

/**
 * Recompute the Hub finyk quick-stats snapshot (`todaySpent` / `budgetLeft`)
 * from the merged transaction stream. Reuses `calcFinykPeriodAggregate` so the
 * exclusion / split / sign rules match Overview 1:1 — the caller only supplies
 * the Kyiv-anchored day/month window boundaries (the domain time invariant).
 */
export function computeFinykQuickStats({
  transactions,
  excludedTxIds = [],
  txSplits = {},
  planExpense = 0,
  todayStartMs,
  todayEndMs,
  monthStartMs,
}: FinykQuickStatsInput): FinykQuickStats {
  const todaySpent = calcFinykPeriodAggregate(transactions, {
    start: todayStartMs,
    end: todayEndMs,
    excludedTxIds,
    txSplits,
  }).totalSpent;

  const budgetLeft =
    planExpense > 0
      ? Math.round(
          planExpense -
            calcFinykPeriodAggregate(transactions, {
              start: monthStartMs,
              end: todayEndMs,
              excludedTxIds,
              txSplits,
            }).totalSpent,
        )
      : null;

  return { todaySpent, budgetLeft };
}
