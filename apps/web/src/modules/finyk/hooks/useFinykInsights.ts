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
 * (`getCachedFinykMonoMirrorState`), which is populated at boot by
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
 *   2. coffee-limit    — MoM trend
 *   3. recurring       — discovery
 */

import { useMemo } from "react";
import { getCachedFinykMonoMirrorState } from "../lib/monoMirrorReader";
import { useFinykMonoMirrorTick } from "../lib/monoMirrorGate";
import { useFinykStorageSlots } from "./useFinykStorageSlots";
import { useCoffeeLimitInsight } from "./useCoffeeLimitInsight";
import { useBudgetOverrunInsight } from "./useBudgetOverrunInsight";
import { useRecurringDetectedInsight } from "./useRecurringDetectedInsight";
import type { Insight } from "@shared/lib/insights/types";

/** Max insights this wrapper surfaces. */
const MAX_VISIBLE = 3;

export function useFinykInsights(): Insight[] {
  // Reactive tick — re-renders when the Mono mirror cache is refreshed.
  const mirrorTick = useFinykMonoMirrorTick();

  const transactions = useMemo(() => {
    void mirrorTick; // mirror cache refresh tick
    return getCachedFinykMonoMirrorState().transactions;
  }, [mirrorTick]);

  const slots = useFinykStorageSlots();

  const overrunInsight = useBudgetOverrunInsight({
    budgets: slots.budgets,
    transactions,
    txCategories: slots.txCategories,
    txSplits: slots.txSplits,
    customCategories: slots.customCategories,
  });

  const coffeeInsight = useCoffeeLimitInsight({
    transactions,
    txCategories: slots.txCategories,
    txSplits: slots.txSplits,
    customCategories: slots.customCategories,
  });

  const recurringInsight = useRecurringDetectedInsight({
    transactions,
    subscriptions: slots.subscriptions,
    dismissedRecurring: slots.dismissedRecurring,
    excludedTxIds: undefined,
  });

  return useMemo((): Insight[] => {
    const candidates: Array<Insight | null> = [
      overrunInsight,
      coffeeInsight,
      recurringInsight,
    ];
    return candidates
      .filter((i): i is Insight => i !== null)
      .slice(0, MAX_VISIBLE);
  }, [overrunInsight, coffeeInsight, recurringInsight]);
}
