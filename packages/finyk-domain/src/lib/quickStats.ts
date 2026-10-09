import { calcFinykPeriodAggregate } from "./spending.js";
import {
  getTxStatAmount,
  txTimeMs,
  type SpendingTxLike,
  type TxSplitsLike,
} from "./transactions.js";

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
  /**
   * Today's spends for the hub's cumulative day line: `[minutes since the
   * Kyiv day start, UAH]`, in time order. Same exclusion and split rules
   * as `todaySpent`, so the line ends exactly at it.
   */
  todayPoints: Array<[number, number]>;
}

function todaySpendPoints(
  transactions: QuickStatsTx[] | null | undefined,
  excludedTxIds: Set<string> | string[],
  txSplits: TxSplitsLike,
  start: number,
  end: number,
): Array<[number, number]> {
  const excluded = new Set(excludedTxIds);
  const points: Array<[number, number]> = [];
  for (const tx of transactions ?? []) {
    if (!tx || excluded.has(tx.id) || (tx.amount ?? 0) >= 0) continue;
    const ms = txTimeMs(tx.time);
    if (!Number.isFinite(ms) || ms < start || ms >= end) continue;
    const amt = getTxStatAmount(tx, txSplits);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    points.push([Math.floor((ms - start) / 60_000), Math.round(amt)]);
  }
  return points.sort((a, b) => a[0] - b[0]);
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

  const todayPoints = todaySpendPoints(
    transactions,
    excludedTxIds,
    txSplits,
    todayStartMs,
    todayEndMs,
  );

  return { todaySpent, budgetLeft, todayPoints };
}
