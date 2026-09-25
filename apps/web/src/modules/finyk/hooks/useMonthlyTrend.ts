/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { useMemo } from "react";
import { getCurrentMonthContext } from "@sergeant/finyk-domain/domain/budget";
import { withManualExpenses } from "@sergeant/finyk-domain/domain/transactions";
import {
  buildMonthlyTrend,
  getAverageMonthlySpendMinor,
  type MonthlyTrendPoint,
} from "@sergeant/finyk-domain/domain/trends";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type {
  Category,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { getVisibleFinykMonoMirrorState } from "../lib/monoMirrorReader";
import { useFinykMonoMirrorTick } from "../lib/monoMirrorGate";

/** Банківська історія з SQLite-дзеркала, реактивна до його оновлень. */
export function useFinykMirrorTransactions() {
  const mirrorTick = useFinykMonoMirrorTick();
  return useMemo(() => {
    void mirrorTick; // mirror cache refresh tick
    return getVisibleFinykMonoMirrorState().transactions;
  }, [mirrorTick]);
}

export interface MonthlyTrendStorage {
  excludedTxIds: Set<string> | Iterable<string>;
  txSplits: TxSplitsMap;
  manualExpenses?: ManualExpense[] | undefined;
  txCategories?: Record<string, string | undefined> | undefined;
  customCategories?: Category[] | undefined;
}

export interface MonthlyTrend {
  points: MonthlyTrendPoint[];
  /** Середнє за завершені місяці з записами, копійки (Р14). */
  averageMinor: number | null;
  /** Середнє на день за дні поточного місяця, копійки (Р14). */
  perDayMinor: number | null;
}

/**
 * Тренд витрат за 12 місяців (Р11) або однієї категорії (Р13).
 *
 * Джерело не місячний fetch Аналітики, а повна історія: SQLite-дзеркало
 * банку плюс ручні витрати. Інакше графік знав би лише ті місяці, які
 * людина встигла відкрити стрілками.
 */
export function useMonthlyTrend(
  storage: MonthlyTrendStorage,
  categoryId: string | null = null,
): MonthlyTrend {
  const bank = useFinykMirrorTransactions();
  const {
    excludedTxIds,
    txSplits,
    manualExpenses,
    txCategories,
    customCategories,
  } = storage;
  return useMemo(() => {
    const points = buildMonthlyTrend(withManualExpenses(bank, manualExpenses), {
      excludedTxIds,
      txSplits,
      txCategories: txCategories ?? {},
      customCategories: customCategories ?? [],
      categoryId,
    });
    const current = points.at(-1);
    const { daysPassed } = getCurrentMonthContext();
    return {
      points,
      averageMinor: getAverageMonthlySpendMinor(points),
      perDayMinor:
        current?.isCurrent && current.spentMinor > 0 && daysPassed > 0
          ? current.spentMinor / daysPassed
          : null,
    };
  }, [
    bank,
    manualExpenses,
    excludedTxIds,
    txSplits,
    txCategories,
    customCategories,
    categoryId,
  ]);
}
