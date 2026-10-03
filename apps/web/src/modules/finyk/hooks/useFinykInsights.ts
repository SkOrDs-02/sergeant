/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Per-module insight wrapper for Finyk.
 *
 * Fetches its own data independently — safe to call from any surface,
 * including the Hub which has no Finyk network providers in scope.
 *
 * Transaction data is sourced from the SQLite Mono mirror cache
 * (`getVisibleFinykMonoMirrorState`), which is populated at boot by
 * `useFinykMonoMirrorBoot`. The cache is reactive via
 * `useFinykMonoMirrorTick` so the hook re-evaluates after each
 * mirror refresh.
 *
 * Storage slots (budgets, txCategories, txSplits, customCategories,
 * subscriptions, dismissedRecurring) come from `useFinykStorageSlots`,
 * which reads from LS (first-paint) then overlays SQLite once warm —
 * the same source used by `FinykInsightsBlock`.
 *
 * Returns up to 3 Insight objects in priority order:
 *   1. budget-overrun  — actionable today
 *   2. budget-pace     — a limit the pace will break (other categories only)
 *   3. coffee-limit    — MoM trend
 *   4. recurring       — discovery
 *
 * `showOn` filtering uses the same condition as `useAllInsights` (its
 * only current reader). Defaults to `surface: "hub"`, the sole
 * production caller today (`useAllInsights`), so the default is a no-op
 * for existing behavior.
 */

import { useMemo } from "react";
import { useFinykStatTransactions } from "./useFinykStatTransactions";
import { useCoffeeLimitInsight } from "./useCoffeeLimitInsight";
import { useBudgetOverrunInsight } from "./useBudgetOverrunInsight";
import { useBudgetPaceInsight } from "./useBudgetPaceInsight";
import { useRecurringDetectedInsight } from "./useRecurringDetectedInsight";
import type { Insight } from "@shared/lib/insights/types";

/** Max insights this wrapper surfaces. */
const MAX_VISIBLE = 3;

export interface UseFinykInsightsOptions {
  /** Mirrors `UseAllInsightsOptions.surface`. Defaults to `"hub"`. */
  surface?: "hub" | "module";
}

export function useFinykInsights(
  opts: UseFinykInsightsOptions = {},
): Insight[] {
  const { surface = "hub" } = opts;
  // Той самий всесвіт транзакцій читає звіт тижня на хабі (Р23).
  const { statTransactions, slots } = useFinykStatTransactions();

  const overrunInsight = useBudgetOverrunInsight({
    budgets: slots.budgets,
    transactions: statTransactions,
    txCategories: slots.txCategories,
    txSplits: slots.txSplits,
    customCategories: slots.customCategories,
  });

  // Попередження до перевищення (Р9): той самий прохід `calcLimitUsages`,
  // тож для однієї категорії ніколи не стоїть поруч із карткою перевищення.
  const paceInsight = useBudgetPaceInsight({
    budgets: slots.budgets,
    transactions: statTransactions,
    txCategories: slots.txCategories,
    txSplits: slots.txSplits,
    customCategories: slots.customCategories,
  });

  const coffeeInsight = useCoffeeLimitInsight({
    transactions: statTransactions,
    txCategories: slots.txCategories,
    txSplits: slots.txSplits,
    customCategories: slots.customCategories,
  });

  const recurringInsight = useRecurringDetectedInsight({
    transactions: statTransactions,
    subscriptions: slots.subscriptions,
    dismissedRecurring: slots.dismissedRecurring,
    excludedTxIds: slots.excludedStatTxIds,
  });

  return useMemo((): Insight[] => {
    const candidates: Array<Insight | null> = [
      overrunInsight,
      paceInsight,
      coffeeInsight,
      recurringInsight,
    ];
    return candidates
      .filter((i): i is Insight => i !== null)
      .filter((i) =>
        surface === "hub" ? i.showOn !== "module" : i.showOn !== "hub",
      )
      .slice(0, MAX_VISIBLE);
  }, [overrunInsight, paceInsight, coffeeInsight, recurringInsight, surface]);
}
