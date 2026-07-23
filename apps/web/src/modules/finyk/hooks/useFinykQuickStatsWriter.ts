import { useEffect, useRef } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { computeFinykQuickStats } from "@sergeant/finyk-domain/utils";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { getKyivDayKey, parseKyivDate } from "@shared/lib/time/kyivTime";
import type { useStorage } from "./useStorage";
import type { useUnifiedFinanceData } from "./useUnifiedFinanceData";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

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
  const [year, month] = todayKey.split("-");
  const monthStart =
    parseKyivDate(`${year}-${month}-01`)?.getTime() ?? todayStart;
  return { todayStart, todayEnd, monthStart };
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
 * the monthly plan — and writes it back on the Europe/Kyiv day boundary. A
 * `storageUpdated` bump lets any same-tab Hub consumer re-read immediately.
 */
export function useFinykQuickStatsWriter({
  mono,
  storage,
}: {
  mono: MergedMonoLike;
  storage: StorageLike;
}): void {
  const { realTx } = mono;
  const { manualExpenses, excludedTxIds, txSplits, monthlyPlan } = storage;
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    const manualTxs = manualExpenses.map((e) => manualExpenseToTransaction(e));
    const transactions =
      manualTxs.length > 0 ? [...realTx, ...manualTxs] : realTx;
    const { todayStart, todayEnd, monthStart } = kyivWindows(Date.now());

    const stats = computeFinykQuickStats({
      transactions,
      excludedTxIds,
      txSplits,
      planExpense: Number(monthlyPlan?.expense || 0),
      todayStartMs: todayStart,
      todayEndMs: todayEnd,
      monthStartMs: monthStart,
    });

    const payload = JSON.stringify(stats);
    if (payload === lastWrittenRef.current) return;
    if (safeReadStringLS(STORAGE_KEYS.FINYK_QUICK_STATS) === payload) {
      lastWrittenRef.current = payload;
      return;
    }
    if (safeWriteLS(STORAGE_KEYS.FINYK_QUICK_STATS, payload)) {
      lastWrittenRef.current = payload;
      emitHubBus("storageUpdated", undefined);
    }
  }, [realTx, manualExpenses, excludedTxIds, txSplits, monthlyPlan]);
}
