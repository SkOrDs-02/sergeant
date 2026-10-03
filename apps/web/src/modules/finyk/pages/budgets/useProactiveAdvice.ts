import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  shouldShowProactiveAdvice,
  getCurrentMonthContext,
  formatLimitBudgetLabel,
  limitBudgetCategoryIds,
  limitBudgetCategoryKey,
} from "@sergeant/finyk-domain/domain/budget";
import type {
  Budget,
  Category,
  LimitBudget,
} from "@sergeant/finyk-domain/domain/types";
import { resolveExpenseCategoryMeta } from "../../utils";
import { currentKyivMonthPrefix } from "../../lib/monthWindow";
import {
  fetchProactiveAdvice,
  loadProactiveAdviceFromLS,
  proactiveAdviceQueryKey,
  PROACTIVE_CACHE_TTL,
  type ProactiveItem,
} from "./budgetsLib";

export interface UseProactiveAdviceParams {
  limitBudgets: LimitBudget[];
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
 * - Returns flat lookup maps keyed by `categoryKey` (стабільний ключ набору
 *   категорій ліміту, `limitBudgetCategoryKey`) for the UI to consume.
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
    const { daysLeft: daysRemaining } = getCurrentMonthContext(now);
    // Key by the Kyiv civil month so advice rolls over on the same boundary
    // for every user regardless of host timezone (domain-invariants spec).
    const monthKey = currentKyivMonthPrefix(now);
    const items: ProactiveItem[] = [];
    for (const b of limitBudgets) {
      const limit = Number(b.limit) || 0;
      const categoryKey = limitBudgetCategoryKey(b);
      if (!categoryKey) continue;
      const spent = calcSpent(b);
      const pctRaw = limit > 0 ? (spent / limit) * 100 : 0;
      if (!shouldShowProactiveAdvice({ pctRaw }, null)) continue;
      // Для комбо-ліміту в промпт іде повний підпис («Їжа» або «A + B»),
      // щоб порада говорила про весь набір, а не про першу категорію.
      const catLabel =
        formatLimitBudgetLabel(
          b,
          (id) => resolveExpenseCategoryMeta(id, customCategories)?.label,
        ) || limitBudgetCategoryIds(b).join(" + ");
      const remaining = Math.max(0, limit - spent);
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      items.push({
        categoryKey,
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
      queryKey: proactiveAdviceQueryKey(item.monthKey, item.categoryKey),
      queryFn: () => fetchProactiveAdvice(item),
      staleTime: PROACTIVE_CACHE_TTL,
      gcTime: PROACTIVE_CACHE_TTL,
      retry: false,
      initialData: () => {
        const cached = loadProactiveAdviceFromLS(
          item.categoryKey,
          item.monthKey,
        );
        return cached?.text ?? undefined;
      },
      initialDataUpdatedAt: () => {
        const cached = loadProactiveAdviceFromLS(
          item.categoryKey,
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
    proactiveAdvice[item.categoryKey] = q?.data ?? null;
    proactiveLoading[item.categoryKey] = Boolean(q?.isFetching);
  });

  return { proactiveItems, proactiveAdvice, proactiveLoading };
}
