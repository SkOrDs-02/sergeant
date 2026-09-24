/**
 * Last validated: 2026-09-24
 * Status: Active
 *
 * Detection hook for the «ліміт перевищено» hub insight.
 *
 * Reads the same `calcLimitUsages` result as the Planning limit card and the
 * `budget_over_*` recommendation (`buildFinanceContext`), so a card saying
 * «використано 162% ліміту» can never sit next to «перевищень немає»
 * (Р5, spec finyk-analytics-v2). Fires from `overLimit` (≥100 %), the same
 * threshold the card uses; the former 110 % margin let Planning say
 * «Перевищено» while the hub stayed silent. When several limits are over,
 * the highest ratio wins.
 *
 * AI-DANGER: callers pass the full transaction history (the sibling insight
 * hooks need several months for their MoM / recurring detection). The period
 * window is applied per limit inside `calcLimitUsages` (`getLimitPeriodRange`),
 * which is what stopped «використано 521% ліміту» on the second day of a month
 * (founder report 2026-07-31). Do not pre-clamp here: week and one-time
 * limits carry their own window.
 */

import { useMemo } from "react";
import {
  calcLimitUsages,
  getCurrentMonthContext,
  formatLimitBudgetLabel,
  type LimitUsageEntry,
} from "@sergeant/finyk-domain/domain/budget";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/domain/categories";
import type { Insight } from "@shared/lib/insights/types";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import { formatNumberUk } from "@sergeant/shared";

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
    if (!budgets.length || !transactions.length) return null;

    const { daysLeft } = getCurrentMonthContext();

    let worst: LimitUsageEntry | null = null;
    for (const usage of calcLimitUsages(budgets, transactions, {
      txCategories,
      txSplits,
      customCategories,
    })) {
      if (!usage.overLimit) continue;
      if (!worst || usage.pctRaw > worst.pctRaw) worst = usage;
    }

    if (!worst) return null;

    const { budget, spent, limit, pctRaw } = worst;
    // Same base as the Overview budget plashka (`BudgetAlertsList`): percent
    // of the limit used, not percent above it. The two surfaces render side by
    // side, so a shared base is what keeps them from reading as a data bug.
    const pct = Math.round(pctRaw);
    const overage = Math.round(spent - limit);
    const catLabel =
      formatLimitBudgetLabel(
        budget,
        (id) => resolveExpenseCategoryMeta(id, customCategories)?.label,
      ) || budget.categoryId;

    return {
      id: `finyk-budget-overrun-${budget.categoryId}`,
      module: "finyk",
      title: `${catLabel}: використано ${pct}% ліміту`,
      subtitle: `+${formatNumberUk(overage)} грн. Залишилось ${daysLeft} дн. Подивитись?`,
      askAiPrompt: `У Фініку категорія "${catLabel}" вже ${formatNumberUk(Math.round(spent))} грн із бюджету ${formatNumberUk(Math.round(limit))} грн (+${pct - 100}%). Це разовий сплеск чи тренд? Що підрізати?`,
      action: {
        type: "navigate",
        path: `/finyk/budgets?cat=${budget.categoryId}`,
      },
      // Hub-only (Фаза 3, finyk-observations spec PR-1): BudgetAlertsList
      // already shows every overrun category on the Finyk Overview itself,
      // so this card duplicated the worst one there. It stays on the Hub,
      // where it's the only budget signal.
      showOn: "hub",
    };
  }, [budgets, transactions, txCategories, txSplits, customCategories]);
}
