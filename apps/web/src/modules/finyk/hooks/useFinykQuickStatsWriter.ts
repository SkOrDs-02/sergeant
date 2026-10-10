import { getFinykDayPlan } from "../lib/dayPlan";
import { useEffect } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { computeFinykQuickStats } from "@sergeant/finyk-domain/utils";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { getLimitBudgets } from "@sergeant/finyk-domain/domain/budget";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { getKyivDayKey, parseKyivDate } from "@shared/lib/time/kyivTime";

import type { useStorage } from "./useStorage";
import type { useUnifiedFinanceData } from "./useUnifiedFinanceData";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

interface FinykQuickStatsSnapshotInput {
  transactions: Transaction[];
  excludedTxIds?: Set<string> | string[];
  txSplits?: TxSplitsMap;
  planExpense?: number;
  /** Кількість лімітів на категорії: доказ кроку чекліста «Встановити бюджет». */
  limitsCount?: number;
  subscriptions?: StorageLike["subscriptions"];
  manualDebts?: StorageLike["manualDebts"];
  receivables?: StorageLike["receivables"];
  scheduleTransactions?: Transaction[];
  nowMs?: number;
}

/**
 * Kyiv-anchored `[todayStart, todayEnd)` and month-start epochs for `nowMs`.
 * `parseKyivDate` returns the Kyiv-midnight instant for a `YYYY-MM-DD` key; the
 * +25h probe lands firmly inside the next Kyiv day across any DST shift before
 * snapping back to its midnight.
 */
function kyivWindows(nowMs: number) {
  const todayKey = getKyivDayKey(nowMs);
  const todayStart = parseKyivDate(todayKey)?.getTime() ?? nowMs;
  const todayEnd =
    parseKyivDate(getKyivDayKey(todayStart + 25 * 60 * 60 * 1000))?.getTime() ??
    todayStart + 24 * 60 * 60 * 1000;
  const monthStart =
    parseKyivDate(`${todayKey.slice(0, 7)}-01`)?.getTime() ?? todayStart;
  return { todayStart, todayEnd, monthStart };
}

/**
 * Rebuilds the Hub card's derived snapshot from canonical Finyk data.
 *
 * Kept outside the screen-scoped hook so the authenticated app boot can
 * restore the card before the user opens Finyk. Returns the serialized value
 * for deterministic tests and skips the write/bus event when nothing changed.
 */
export function writeFinykQuickStatsSnapshot({
  transactions,
  excludedTxIds = [],
  txSplits = {},
  planExpense = 0,
  limitsCount = 0,
  scheduleTransactions,
  subscriptions = [],
  manualDebts = [],
  receivables = [],
  nowMs = Date.now(),
}: FinykQuickStatsSnapshotInput): string {
  const { todayStart, todayEnd, monthStart } = kyivWindows(nowMs);
  const stats = computeFinykQuickStats({
    transactions,
    excludedTxIds,
    txSplits,
    planExpense,
    todayStartMs: todayStart,
    todayEndMs: todayEnd,
    monthStartMs: monthStart,
  });
  const { dayPlan, todaySpent } = getFinykDayPlan({
    transactions,
    scheduleTransactions,
    subscriptions,
    manualDebts,
    receivables,
    planExpense,
    excludedTxIds,
    txSplits,
    nowMs,
  });
  const payload = JSON.stringify({
    ...stats,
    todaySpent,
    ...(dayPlan !== null ? { dayPlan } : {}),
    ...(limitsCount > 0 ? { limitsCount } : {}),
  });

  if (safeReadStringLS(STORAGE_KEYS.FINYK_QUICK_STATS) === payload) {
    return payload;
  }
  if (safeWriteLS(STORAGE_KEYS.FINYK_QUICK_STATS, payload)) {
    emitHubBus("storageUpdated", undefined);
  }
  return payload;
}

/**
 * Production writer for the Hub finyk quick-stats snapshot.
 *
 * The Hub bento card reads `todaySpent` / `budgetLeft` from
 * `STORAGE_KEYS.FINYK_QUICK_STATS`, but the only historic writer was the
 * onboarding demo seeder — so a real user's card stayed on the empty-state
 * promise no matter how many transactions they added (test-observations A1).
 *
 * Mounted once at the finyk module root (where the merged transaction stream
 * and storage slots both live), this recomputes the snapshot whenever finyk
 * data changes — manual add/edit/delete, Monobank sync, exclusions, splits or
 * the monthly plan. A `storageUpdated` bump lets any same-tab Hub consumer
 * re-read immediately.
 */
export function useFinykQuickStatsWriter({
  mono,
  storage,
}: {
  mono: MergedMonoLike;
  storage: StorageLike;
}): void {
  const { realTx, transactions: scheduleBankTx } = mono;
  const {
    manualExpenses,
    excludedTxIds,
    txSplits,
    monthlyPlan,
    budgets,
    subscriptions,
    manualDebts,
    receivables,
  } = storage;

  useEffect(() => {
    const manualTxs = manualExpenses.map((e) => manualExpenseToTransaction(e));
    const transactions =
      manualTxs.length > 0 ? [...realTx, ...manualTxs] : realTx;

    writeFinykQuickStatsSnapshot({
      transactions,
      scheduleTransactions: [...scheduleBankTx, ...manualTxs],
      excludedTxIds,
      txSplits,
      planExpense: Number(monthlyPlan?.expense || 0),
      limitsCount: getLimitBudgets(budgets).length,
      subscriptions,
      manualDebts,
      receivables,
    });
  }, [
    realTx,
    scheduleBankTx,
    manualExpenses,
    excludedTxIds,
    txSplits,
    monthlyPlan,
    budgets,
    subscriptions,
    manualDebts,
    receivables,
  ]);
}
