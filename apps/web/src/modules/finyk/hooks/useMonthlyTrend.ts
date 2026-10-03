/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { useEffect, useMemo } from "react";
import { getCurrentMonthContext } from "@sergeant/finyk-domain/domain/budget";
import { withManualExpenses } from "@sergeant/finyk-domain/domain/transactions";
import {
  buildMonthlyTrend,
  getAverageMonthlySpendMinor,
  TREND_MONTHS,
  type MonthlyTrendPoint,
} from "@sergeant/finyk-domain/domain/trends";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import { withMerchantRuleOverrides } from "@sergeant/finyk-domain/lib/merchantRuleOverrides";
import type { MerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";
import type {
  Category,
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { kyivMonthRangeIso } from "../lib/monthWindow";
import { useFinykMirrorTransactions } from "./useFinykStatTransactions";

export interface MonthlyTrendStorage {
  excludedTxIds: Set<string> | Iterable<string>;
  txSplits: TxSplitsMap;
  manualExpenses?: ManualExpense[] | undefined;
  txCategories?: Record<string, string | undefined> | undefined;
  /** Правила «Завжди так для цього магазину»: тренд категорії бачить їх так само, як список. */
  merchantRules?: MerchantRuleIndex | undefined;
  customCategories?: Category[] | undefined;
}

export interface MonthlyTrend {
  points: MonthlyTrendPoint[];
  /** Середнє за завершені місяці з записами, копійки (Р14). */
  averageMinor: number | null;
  /** Середнє на день за дні поточного місяця, копійки (Р14). */
  perDayMinor: number | null;
}

/** Завантажує банківський діапазон у дзеркало (`useMonobankWebhook.fetchRange`). */
export type FetchBankRange = (from: string, to: string) => Promise<unknown>;

/** Завершені місяці вікна тренду: від 11 місяців тому до кінця минулого. */
function trendHistoryRange(): { from: string; to: string } {
  const { year, month } = getKyivDateParts();
  const idx = year * 12 + (month - 1);
  const at = (i: number) => kyivMonthRangeIso(Math.floor(i / 12), (i % 12) + 1);
  return {
    from: at(idx - (TREND_MONTHS - 1)).from,
    to: at(idx - 1).to,
  };
}

/**
 * Тренд витрат за 12 місяців (Р11) або однієї категорії (Р13).
 *
 * Джерело не місячний fetch Аналітики, а SQLite-дзеркало банку плюс ручні
 * витрати. Дзеркало наповнюється помісячно (поточний місяць і відкриті
 * стрілками), тож хук сам дотягує завершені місяці вікна одним запитом:
 * без цього людина з роками історії бачила б «Ведеш з серпня».
 */
export function useMonthlyTrend(
  storage: MonthlyTrendStorage,
  categoryId: string | null = null,
  fetchRange?: FetchBankRange,
): MonthlyTrend {
  const bank: readonly Transaction[] = useFinykMirrorTransactions();
  // Денний ключ у залежностях: вкладка, відкрита через північ, отримує
  // новий день і місяць на першому ж рендері, а не лише зі зміною даних.
  const dayKey = getKyivDayKey();

  useEffect(() => {
    if (!fetchRange) return;
    const { from, to } = trendHistoryRange();
    // Без банку або без мережі тренд лишається з тим, що вже є в дзеркалі;
    // помилку тут нема кому показати, а картка чесно каже, звідки веде.
    fetchRange(from, to).catch(() => {});
  }, [fetchRange]);

  const {
    excludedTxIds,
    txSplits,
    manualExpenses,
    txCategories,
    merchantRules,
    customCategories,
  } = storage;
  return useMemo(() => {
    void dayKey;
    const all = withManualExpenses(bank, manualExpenses);
    const points = buildMonthlyTrend(all, {
      excludedTxIds,
      txSplits,
      txCategories: withMerchantRuleOverrides(
        all,
        txCategories ?? {},
        merchantRules,
        customCategories ?? [],
      ),
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
    dayKey,
    bank,
    manualExpenses,
    excludedTxIds,
    txSplits,
    txCategories,
    merchantRules,
    customCategories,
    categoryId,
  ]);
}
