import { useMemo } from "react";
import {
  getMonthlySummary,
  getMonthlySpendSeries,
  getTopMerchants,
  getTrendComparison,
  computeCategorySpendIndex,
  selectTopCategoriesFromIndex,
  selectCategoryDistributionFromIndex,
  type MonthlyHistoryEntry,
} from "@sergeant/finyk-domain/domain/selectors";
import type {
  Category,
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";

interface UseAnalyticsArgs {
  mono: { realTx?: readonly Transaction[]; loadingTx?: boolean };
  storage: {
    excludedTxIds?: Set<string> | Iterable<string> | null;
    txCategories?: Record<string, string | undefined>;
    txSplits?: TxSplitsMap;
    customCategories?: Category[];
  };
  monthlyHistory?: readonly MonthlyHistoryEntry[];
}

// Central analytics hook for Finyk. All derived views are memoized so a
// re-render that does not change transactions or any filter leaves the
// heavy per-transaction loops skipped.
export function useAnalytics({
  mono,
  storage,
  monthlyHistory = [],
}: UseAnalyticsArgs) {
  const { realTx = [], loadingTx } = mono;
  const { excludedTxIds, txCategories, txSplits, customCategories } = storage;

  // Stable bundle of filter options. Changes only when any filter slice
  // (excluded ids, manual overrides, user splits, custom categories)
  // actually changes by reference.
  const opts = useMemo(
    () => ({ excludedTxIds, txCategories, txSplits, customCategories }),
    [excludedTxIds, txCategories, txSplits, customCategories],
  );

  // Cache: monthly totals (spent / income / balance / tx count) for the
  // active set of transactions. Depends on tx list + excludedTxIds + txSplits
  // (category overrides do not affect totals).
  const summary = useMemo(
    () =>
      getMonthlySummary(realTx, {
        excludedTxIds: excludedTxIds ?? undefined,
        txSplits,
      }),
    [realTx, excludedTxIds, txSplits],
  );

  // Cache: per-category aggregated spend (the single heaviest computation
  // in analytics). Shared below by top categories and category distribution
  // so we iterate transactions at most once per (tx + filters) change.
  const categorySpendIndex = useMemo(
    () =>
      computeCategorySpendIndex(realTx, {
        ...opts,
        excludedTxIds: opts.excludedTxIds ?? undefined,
      }),
    [realTx, opts],
  );

  // Cache: top 5 spending categories, derived from the shared index.
  // Re-derives only when the index or customCategories (labels/colors) change.
  const topCategories = useMemo(
    () => selectTopCategoriesFromIndex(categorySpendIndex, customCategories, 5),
    [categorySpendIndex, customCategories],
  );

  // Cache: full category distribution for pie charts, derived from the
  // same shared index. No extra pass over transactions.
  const distribution = useMemo(
    () =>
      selectCategoryDistributionFromIndex(categorySpendIndex, customCategories),
    [categorySpendIndex, customCategories],
  );

  // Cache: top merchants by total spend. Depends on tx list + excludedTxIds
  // + txSplits — сплітовані транзакції (напр. оренда з поверненнями) вже
  // нормалізуються до чистої частки користувача, щоб цифри збігалися з
  // "Підсумком місяця" та "Категоріями".
  const topMerchants = useMemo(
    () =>
      getTopMerchants(realTx, {
        excludedTxIds: excludedTxIds ?? undefined,
        txSplits,
      }),
    [realTx, excludedTxIds, txSplits],
  );

  // Cache: monthly spend/income series for sparkline-style charts.
  // Depends only on the historical months array reference.
  const monthlyTrend = useMemo(
    () => getMonthlySpendSeries(monthlyHistory),
    [monthlyHistory],
  );

  // Cache: current-vs-previous-month comparison. Computed from the last
  // two months in `monthlyHistory`; depends on that array + filters.
  const comparison = useMemo(() => {
    if (monthlyHistory.length < 2) return null;
    const curr = monthlyHistory[monthlyHistory.length - 1];
    const prev = monthlyHistory[monthlyHistory.length - 2];
    return getTrendComparison(
      curr?.transactions || [],
      prev?.transactions || [],
      { excludedTxIds: excludedTxIds ?? undefined, txSplits },
    );
  }, [monthlyHistory, excludedTxIds, txSplits]);

  return {
    summary,
    topCategories,
    distribution,
    topMerchants,
    monthlyTrend,
    comparison,
    isLoading: loadingTx,
  };
}
