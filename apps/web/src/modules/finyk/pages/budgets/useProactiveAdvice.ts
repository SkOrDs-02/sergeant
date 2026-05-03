import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  shouldShowProactiveAdvice,
  getCurrentMonthContext,
} from "@sergeant/finyk-domain/domain/budget";
import type { Budget, Category } from "@sergeant/finyk-domain/domain/types";
import { resolveExpenseCategoryMeta } from "../../utils";
import {
  fetchProactiveAdvice,
  loadProactiveAdviceFromLS,
  proactiveAdviceQueryKey,
  PROACTIVE_CACHE_TTL,
  type ProactiveItem,
} from "./budgetsLib";

export interface UseProactiveAdviceParams {
  limitBudgets: Budget[];
  calcSpent: (budget: Budget) => number;
  customCategories: Category[] | undefined;
  now: Date;
}

export interface UseProactiveAdviceResult {
  proactiveItems: ProactiveItem[];
  proactiveAdvice: Record<string, string | null>;
  proactiveLoading: Record<string, boolean>;
}

/**
 * Pulls AI-generated "you're near the limit" advice for every limit budget
 * that crossed the proactive threshold in the current month.
 *
 * - One React Query per at-risk category (`useQueries`)
 * - Seeded synchronously from localStorage so cached advice paints with
 *   no spinner; stale entries (older than 24h) are auto-refetched.
 * - Returns flat lookup maps keyed by `categoryId` for the UI to consume.
 */
export function useProactiveAdvice({
  limitBudgets,
  calcSpent,
  customCategories,
  now,
}: UseProactiveAdviceParams): UseProactiveAdviceResult {
  // At-risk advice fires for any limit where current usage ≥ 80% of limit
  // (see `shouldShowProactiveAdvice`). We key items by `(monthKey,
  // categoryId)` so cached advice rolls over naturally at month boundaries.
  const proactiveItems = useMemo<ProactiveItem[]>(() => {
    if (limitBudgets.length === 0) return [];
    const { daysLeft: daysRemaining, monthStart: ms } =
      getCurrentMonthContext(now);
    const monthKey = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`;
    const items: ProactiveItem[] = [];
    for (const b of limitBudgets) {
      const limit = Number(b.limit) || 0;
      const categoryId = b.categoryId ?? "";
      if (!categoryId) continue;
      const spent = calcSpent(b);
      const pctRaw = limit > 0 ? (spent / limit) * 100 : 0;
      if (!shouldShowProactiveAdvice({ pctRaw }, null)) continue;
      const cat = resolveExpenseCategoryMeta(categoryId, customCategories);
      const catLabel = cat?.label || categoryId;
      const remaining = Math.max(0, limit - spent);
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      items.push({
        categoryId,
        monthKey,
        catLabel,
        spent,
        limit,
        remaining,
        pct,
        daysRemaining,
      });
    }
    return items;
  }, [limitBudgets, customCategories, calcSpent, now]);

  // One query per at-risk category. Seeded synchronously from localStorage so
  // the UI paints cached advice with no spinner. `staleTime` is set to the
  // 24h TTL and `initialDataUpdatedAt` is the LS timestamp, so a cached entry
  // older than a day is considered stale and re-fetched automatically —
  // matching the pre-migration manual TTL check.
  const proactiveQueries = useQueries({
    queries: proactiveItems.map((item) => ({
      queryKey: proactiveAdviceQueryKey(item.monthKey, item.categoryId),
      queryFn: () => fetchProactiveAdvice(item),
      staleTime: PROACTIVE_CACHE_TTL,
      gcTime: PROACTIVE_CACHE_TTL,
      retry: false,
      initialData: () => {
        const cached = loadProactiveAdviceFromLS(
          item.categoryId,
          item.monthKey,
        );
        return cached?.text ?? undefined;
      },
      initialDataUpdatedAt: () => {
        const cached = loadProactiveAdviceFromLS(
          item.categoryId,
          item.monthKey,
        );
        return cached?.ts ?? undefined;
      },
    })),
  });

  const proactiveAdvice: Record<string, string | null> = {};
  const proactiveLoading: Record<string, boolean> = {};
  proactiveItems.forEach((item, i) => {
    const q = proactiveQueries[i];
    proactiveAdvice[item.categoryId] = q?.data ?? null;
    proactiveLoading[item.categoryId] = Boolean(q?.isFetching);
  });

  return { proactiveItems, proactiveAdvice, proactiveLoading };
}
