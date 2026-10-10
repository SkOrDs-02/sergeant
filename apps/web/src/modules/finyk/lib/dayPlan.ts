import { calculateFinykDayPlan } from "@sergeant/finyk-domain/domain/dayPlan";
import { calcFinykSpendingTotal } from "@sergeant/finyk-domain/lib/spending";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { getFlowSchedule, type UseFlowScheduleParams } from "./flowSchedule";
import { filterToKyivMonth, txEpochMs } from "./monthWindow";

type DayPlanInput = Pick<
  UseFlowScheduleParams,
  "subscriptions" | "manualDebts" | "receivables"
> & {
  transactions: readonly UseFlowScheduleParams["transactions"][number][];
  planExpense: number;
  excludedTxIds?: Set<string> | string[];
  txSplits?: TxSplitsMap;
  nowMs: number;
  /** The subscription/debt picker may hold more history than the month list. */
  scheduleTransactions?:
    readonly UseFlowScheduleParams["transactions"][number][] | undefined;
};

/** One data selector for Finyk's day allowance, the Hub snapshot and Planning.
 * Legacy storage values in UAH are converted at this boundary; the canonical
 * financial calculation uses minor units and never rounds or clamps a deficit.
 */
export function getFinykDayPlan({
  transactions,
  scheduleTransactions = transactions,
  subscriptions,
  manualDebts,
  receivables,
  planExpense,
  excludedTxIds = [],
  txSplits = {},
  nowMs,
}: DayPlanInput) {
  const parts = getKyivDateParts(nowMs);
  const dayKey = getKyivDayKey(nowMs);
  const monthTx = filterToKyivMonth(transactions, dayKey.slice(0, 7));
  const todaySpent = calcFinykSpendingTotal(
    monthTx.filter((tx) => {
      const ms = txEpochMs(tx);
      return ms != null && getKyivDayKey(ms) === dayKey;
    }),
    { excludedTxIds, txSplits },
  );
  const spent = calcFinykSpendingTotal(monthTx, { excludedTxIds, txSplits });
  const flows = getFlowSchedule({
    subscriptions,
    manualDebts,
    receivables,
    transactions: [...scheduleTransactions],
    kyivYear: parts.year,
    kyivMonth: parts.month - 1,
    kyivDay: parts.day,
  });
  const monthFlows = [
    ...flows.subscriptionFlows,
    ...flows.debtOutFlows,
    ...flows.debtInFlows,
  ].filter(
    (f) => f.daysLeft >= 0 && f.dueDate <= new Date(parts.year, parts.month, 0),
  );
  const recurringMinor = (sign: string) =>
    monthFlows.reduce(
      (sum, f) =>
        sum +
        (f.sign === sign && typeof f.amount === "number"
          ? Math.round(f.amount * 100)
          : 0),
      0,
    );
  const daysInMonth = new Date(
    Date.UTC(parts.year, parts.month, 0),
  ).getUTCDate();
  const dayPlanMinor = calculateFinykDayPlan({
    planExpenseMinor: Math.round(planExpense * 100),
    spentBeforeTodayMinor:
      Math.round(spent * 100) - Math.round(todaySpent * 100),
    recurringOutMinor: recurringMinor("-"),
    recurringInMinor: recurringMinor("+"),
    remainingDays: daysInMonth - parts.day + 1,
  });
  return {
    dayPlan: dayPlanMinor === null ? null : dayPlanMinor / 100,
    todaySpent,
  };
}
