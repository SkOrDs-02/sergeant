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
 *   2. coffee-limit    — MoM trend
 *   3. recurring       — discovery
 *
 * `showOn` filtering uses the same condition as `useAllInsights` (its
 * only current reader). Defaults to `surface: "hub"`, the sole
 * production caller today (`useAllInsights`), so the default is a no-op
 * for existing behavior.
 */

import { useMemo } from "react";
import { getVisibleFinykMonoMirrorState } from "../lib/monoMirrorReader";
import { useFinykMonoMirrorTick } from "../lib/monoMirrorGate";
import { useFinykStorageSlots } from "./useFinykStorageSlots";
import { useCoffeeLimitInsight } from "./useCoffeeLimitInsight";
import { useBudgetOverrunInsight } from "./useBudgetOverrunInsight";
import { useRecurringDetectedInsight } from "./useRecurringDetectedInsight";
import type { Insight } from "@shared/lib/insights/types";
import {
  filterStatTransactions,
  withManualExpenses,
} from "@sergeant/finyk-domain/domain/transactions";

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
  // Reactive tick — re-renders when the Mono mirror cache is refreshed.
  const mirrorTick = useFinykMonoMirrorTick();

  const transactions = useMemo(() => {
    void mirrorTick; // mirror cache refresh tick
    return getVisibleFinykMonoMirrorState().transactions;
  }, [mirrorTick]);

  const slots = useFinykStorageSlots();
  // Дзеркало Mono несе тільки банк. Ручні витрати лежать у storage-слотах,
  // і без них хабова плашка мовчала б про готівку, яку модульний Огляд уже
  // рахує (браузерна перевірка 2026-08-31).
  const statTransactions = useMemo(
    () =>
      filterStatTransactions(
        withManualExpenses(transactions, slots.manualExpenses),
        slots.excludedStatTxIds,
      ),
    [transactions, slots.manualExpenses, slots.excludedStatTxIds],
  );

  const overrunInsight = useBudgetOverrunInsight({
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
      coffeeInsight,
      recurringInsight,
    ];
    return candidates
      .filter((i): i is Insight => i !== null)
      .filter((i) =>
        surface === "hub" ? i.showOn !== "module" : i.showOn !== "hub",
      )
      .slice(0, MAX_VISIBLE);
  }, [overrunInsight, coffeeInsight, recurringInsight, surface]);
}
