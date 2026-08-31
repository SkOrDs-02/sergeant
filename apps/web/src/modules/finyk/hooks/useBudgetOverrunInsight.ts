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
 *
 * AI-DANGER: budget limits are **monthly**, so spend must be measured over the
 * current Kyiv month only. Callers pass the full transaction history (the
 * sibling insight hooks need several months for their MoM / recurring
 * detection), and this hook used to compare that whole history against a
 * one-month limit — producing «Продукти: використано 521% ліміту» on the
 * second day of a month (founder report 2026-07-31). Keep the clamp below.
 */

import { useMemo } from "react";
import {
  getLimitBudgets,
  getCurrentMonthContext,
  formatLimitBudgetLabel,
  limitBudgetCategoryIds,
} from "@sergeant/finyk-domain/domain/budget";
import { calcLimitCategorySpent } from "@sergeant/finyk-domain/lib/limitCategorySpend";
import { currentKyivMonthPrefix, filterToKyivMonth } from "../lib/monthWindow";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/domain/categories";
import type { Insight } from "@shared/lib/insights/types";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import { formatNumberUk } from "@sergeant/shared";

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

    // Clamp to the current Kyiv month — the limit being compared against is a
    // monthly one, while callers pass the full history (their other insight
    // hooks need it). See `../lib/monthWindow`.
    const monthTx = filterToKyivMonth(transactions, currentKyivMonthPrefix());
    if (!monthTx.length) return null;

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
      // Bucket-агрегація + всі категорії комбо-ліміту — той самий рахунок,
      // що й на картці ліміту та в Overview-алертах.
      const spent = calcLimitCategorySpent(
        monthTx,
        limitBudgetCategoryIds(b),
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
    // Same base as the Overview budget plashka (`BudgetAlertsList`): percent
    // of the limit used, not percent above it. The two surfaces render side by
    // side, so a shared base is what keeps them from reading as a data bug.
    const pct = Math.round(ratio * 100);
    const overage = Math.round(spent - limit);
    const catLabel =
      formatLimitBudgetLabel(
        budget,
        (id) => resolveExpenseCategoryMeta(id, customCategories)?.label,
      ) || categoryId;

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
