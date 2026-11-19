import { calculateFinykDayPlan } from "@sergeant/finyk-domain/domain/dayPlan";
import { calcFinykSpendingTotal } from "@sergeant/finyk-domain/lib/spending";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  getFlowSchedule,
  selectPlannedOutflows,
  type UseFlowScheduleParams,
} from "./flowSchedule";
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
  const monthEnd = new Date(parts.year, parts.month, 0);
  const inMonth = (f: { dueDate: Date }) => f.dueDate <= monthEnd;
  const sumMinor = (list: readonly { amount: number | null }[]) =>
    list.reduce(
      (sum, f) =>
        sum + (typeof f.amount === "number" ? Math.round(f.amount * 100) : 0),
      0,
    );
  // Заплановані списання — спільний предикат із рядком «спишеться» на хабі
  // (`selectPlannedOutflows`, OD-26 Ф-4): не дублюй фільтр тут.
  const outflowsMinor = sumMinor(selectPlannedOutflows(flows).filter(inMonth));
  const inflowsMinor = sumMinor(
    flows.debtInFlows.filter(
      (f) => f.sign === "+" && f.daysLeft >= 0 && inMonth(f),
    ),
  );
  const daysInMonth = new Date(
    Date.UTC(parts.year, parts.month, 0),
  ).getUTCDate();
  const dayPlanMinor = calculateFinykDayPlan({
    planExpenseMinor: Math.round(planExpense * 100),
    spentBeforeTodayMinor:
      Math.round(spent * 100) - Math.round(todaySpent * 100),
    recurringOutMinor: outflowsMinor,
    recurringInMinor: inflowsMinor,
    remainingDays: daysInMonth - parts.day + 1,
  });
  return {
    dayPlan: dayPlanMinor === null ? null : dayPlanMinor / 100,
    todaySpent,
  };
}
