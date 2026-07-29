/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Detection hook for the "category spend > 110% of its budget" insight trigger.
 *
 * Scans all limit-type budgets. Picks the first category that has exceeded
 * its limit by more than OVERRUN_THRESHOLD (default 10%). Returns a single
 * Insight with concrete UAH overage and days-remaining copy. When multiple
 * categories are overrun, the most-overrun one wins (highest ratio).
 */

import { useMemo } from "react";
import { calcCategorySpent } from "@sergeant/finyk-domain/domain/categories";
import {
  getLimitBudgets,
  getCurrentMonthContext,
} from "@sergeant/finyk-domain/domain/budget";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/domain/categories";
import type { Insight } from "@shared/lib/insights/types";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { Budget } from "@sergeant/finyk-domain/domain/types";

// Tunable threshold — export so tests can override.
/** Ratio above which the insight fires (1.10 = 110% of budget). */
export const OVERRUN_THRESHOLD = 1.1;

interface UseBudgetOverrunInsightArgs {
  budgets: readonly Budget[];
  transactions: readonly Transaction[];
  txCategories: Record<string, string | undefined>;
  txSplits: TxSplitsMap;
  customCategories?:
    readonly { id: string; label?: string | undefined }[] | undefined;
}

export function useBudgetOverrunInsight({
  budgets,
  transactions,
  txCategories,
  txSplits,
  customCategories = [],
}: UseBudgetOverrunInsightArgs): Insight | null {
  return useMemo(() => {
    const limitBudgets = getLimitBudgets(budgets);
    if (!limitBudgets.length || !transactions.length) return null;

    const { daysLeft } = getCurrentMonthContext();

    // Score each limit budget and pick the worst offender.
    let worst: {
      budget: (typeof limitBudgets)[number];
      categoryId: string;
      ratio: number;
      spent: number;
      limit: number;
    } | null = null;

    for (const b of limitBudgets) {
      const categoryId = b.categoryId;
      if (!categoryId || !(Number(b.limit) > 0)) continue;
      const limit = Number(b.limit);
      const spent = calcCategorySpent(
        transactions,
        b.categoryId,
        txCategories,
        txSplits,
        customCategories,
      );
      const ratio = spent / limit;
      if (ratio < OVERRUN_THRESHOLD) continue;
      if (!worst || ratio > worst.ratio) {
        worst = { budget: b, categoryId, ratio, spent, limit };
      }
    }

    if (!worst) return null;

    const { budget, categoryId, ratio, spent, limit } = worst;
    const pct = Math.round((ratio - 1) * 100);
    const overage = Math.round(spent - limit);
    const catMeta = resolveExpenseCategoryMeta(categoryId, customCategories);
    const catLabel = catMeta?.label ?? categoryId;

    return {
      id: `finyk-budget-overrun-${budget.categoryId}`,
      module: "finyk",
      title: `${catLabel} перевищена на ${pct}%`,
      subtitle: `+${overage.toLocaleString("uk-UA")} грн. Залишилось ${daysLeft} дн. Подивитись?`,
      action: {
        type: "navigate",
        path: `/finyk/budgets?cat=${budget.categoryId}`,
      },
      // Hub surface promoted post-Phase 5e: budget overrun is urgent + simple
      // (one navigate, no in-Finyk preview required to understand stakes).
      showOn: "both",
    };
  }, [budgets, transactions, txCategories, txSplits, customCategories]);
}
