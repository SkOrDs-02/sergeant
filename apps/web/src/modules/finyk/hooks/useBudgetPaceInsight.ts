/**
 * Last validated: 2026-09-25
 * Status: Active
 *
 * Hub insight «за темпом перевищиш ліміт через N днів» (Р9 спеки аналітики v2).
 *
 * Reads `calcLimitUsages`, the same pass that feeds the overrun card, so the
 * two can never describe one limit differently. Fires only while the fact is
 * still under the limit (`forecastOverLimit`); once the limit is actually
 * exceeded `useBudgetOverrunInsight` takes over and this hook goes quiet for
 * that category. With several limits at risk, the soonest to break wins.
 *
 * AI-DANGER: callers pass the full transaction history; the period window is
 * applied per limit inside `calcLimitUsages`. Do not pre-clamp here.
 */

import { useMemo } from "react";
import {
  calcLimitUsages,
  formatLimitBudgetLabel,
  type LimitUsageEntry,
} from "@sergeant/finyk-domain/domain/budget";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/domain/categories";
import type { Insight } from "@shared/lib/insights/types";
import type {
  Budget,
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { formatNumberUk, NARROW_NBSP, pluralDays } from "@sergeant/shared";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

interface UseBudgetPaceInsightArgs {
  budgets: readonly Budget[];
  transactions: readonly Transaction[];
  txCategories: Record<string, string | undefined>;
  txSplits: TxSplitsMap;
  customCategories?:
    readonly { id: string; label?: string | undefined }[] | undefined;
}

export function useBudgetPaceInsight({
  budgets,
  transactions,
  txCategories,
  txSplits,
  customCategories = [],
}: UseBudgetPaceInsightArgs): Insight | null {
  // Темп залежить від дня місяця: без денного ключа в залежностях вкладка,
  // відкрита через північ, показувала б учорашнє «через N днів».
  const dayKey = getKyivDayKey();
  return useMemo(() => {
    void dayKey;
    if (!budgets.length || !transactions.length) return null;

    let soonest: LimitUsageEntry | null = null;
    for (const usage of calcLimitUsages(budgets, transactions, {
      txCategories,
      txSplits,
      customCategories,
    })) {
      if (!usage.forecastOverLimit || usage.daysUntilOver === null) continue;
      if (
        !soonest ||
        soonest.daysUntilOver === null ||
        usage.daysUntilOver < soonest.daysUntilOver
      ) {
        soonest = usage;
      }
    }
    if (!soonest || soonest.daysUntilOver === null) return null;

    const { budget, spent, limit, forecast, daysUntilOver } = soonest;
    const catLabel =
      formatLimitBudgetLabel(
        budget,
        (id) => resolveExpenseCategoryMeta(id, customCategories)?.label,
      ) || budget.categoryId;
    // Та сама конвенція, що в картці перевищення: вузький пробіл перед «₴».
    const fmt = (n: number) =>
      `${formatNumberUk(Math.round(n))}${NARROW_NBSP}₴`;

    return {
      id: `finyk-budget-pace-${budget.categoryId}`,
      module: "finyk",
      title: `${catLabel}: за темпом перевищиш ліміт через ${daysUntilOver} ${pluralDays(daysUntilOver)}`,
      subtitle: `Витрачено ${fmt(spent)} з ${fmt(limit)}, до кінця місяця вийде ~${fmt(forecast ?? spent)}.`,
      askAiPrompt: `У Фініку категорія "${catLabel}": витрачено ${fmt(spent)} із ліміту ${fmt(limit)}, за темпом до кінця місяця вийде ~${fmt(forecast ?? spent)}. Як втриматись у ліміті?`,
      action: {
        type: "navigate",
        path: `/finyk/budgets?cat=${budget.categoryId}`,
      },
      showOn: "hub",
    };
  }, [dayKey, budgets, transactions, txCategories, txSplits, customCategories]);
}
