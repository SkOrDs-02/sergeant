/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Detection hook for the "recurring pattern without a rule" insight trigger.
 *
 * Uses the same `detectRecurring` engine that powers RecurringSuggestions.
 * Returns an Insight for the top candidate (highest confidence, then
 * largest amount). Returns null when no unmatched recurring patterns exist.
 *
 * The 28-day detection window is baked into detectRecurring's monthly
 * cadence spec (minDays: 25, maxDays: 35) + maxAgeDays: 45. No separate
 * threshold is needed here.
 */

import { useMemo } from "react";
import { detectRecurring } from "@sergeant/finyk-domain/lib/recurringDetect";
import type { Insight } from "@shared/lib/insights/types";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

// Tunable — export so tests can override.
/** Minimum number of detections before the insight fires. */
export const RECURRING_MIN_OCCURRENCES = 2;

type SubscriptionLike = {
  id: string;
  keyword?: string;
  linkedTxId?: string | null;
  currency?: string;
};

interface UseRecurringDetectedInsightArgs {
  transactions: readonly Transaction[];
  subscriptions?: readonly SubscriptionLike[];
  dismissedRecurring?: readonly string[];
  excludedTxIds?: ReadonlySet<string> | readonly string[];
}

export function useRecurringDetectedInsight({
  transactions,
  subscriptions = [],
  dismissedRecurring = [],
  excludedTxIds,
}: UseRecurringDetectedInsightArgs): Insight | null {
  return useMemo(() => {
    if (!transactions.length) return null;

    const excluded: string[] =
      excludedTxIds instanceof Set
        ? Array.from(excludedTxIds)
        : Array.isArray(excludedTxIds)
          ? [...excludedTxIds]
          : [];

    const candidates = detectRecurring(transactions as Parameters<typeof detectRecurring>[0], {
      subscriptions: subscriptions as SubscriptionLike[],
      dismissedKeys: dismissedRecurring as string[],
      excludedTxIds: excluded,
    });

    // detectRecurring already sorts by confidence desc → amount desc.
    const top = candidates[0];
    if (!top || top.occurrences < RECURRING_MIN_OCCURRENCES) return null;

    const merchantName = top.displayName || top.key;
    const amountDisplay = top.avgAmount.toLocaleString("uk-UA", {
      maximumFractionDigits: 0,
    });
    const symbol = top.currency === "USD" ? "$" : "₴";

    return {
      id: "finyk-recurring-detected",
      module: "finyk",
      title: `Знайшов повторення: ${merchantName}`,
      subtitle: `~${amountDisplay} ${symbol} щомісяця. Зробити recurring правилом?`,
      action: { type: "navigate", path: "/finyk/assets" },
      // Stays "module" post-Phase 5e: recurring-detection prompt needs the
      // in-Finyk tx history preview to be persuasive — surfacing on Hub
      // without the merchant pattern context = weak conversion.
      showOn: "module",
    };
  }, [transactions, subscriptions, dismissedRecurring, excludedTxIds]);
}
