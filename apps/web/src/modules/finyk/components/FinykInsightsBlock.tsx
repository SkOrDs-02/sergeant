/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Renders up to 2 active Finyk insight cards below the hero, above main
 * content. Each detection hook returns `Insight | null`; only non-null
 * results are rendered. Priority order (when >2 fire simultaneously):
 *   1. budget-overrun  — actionable today, has a budget attached
 *   2. coffee-limit    — MoM trend, may be weeks-stale otherwise
 *   3. recurring       — nice-to-have discovery
 *
 * Dismissal is handled inside <InsightCard> via useInsightDismissal, so
 * this component does not need to track it.
 */

import { useNavigate } from "react-router-dom";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { useCoffeeLimitInsight } from "../hooks/useCoffeeLimitInsight";
import { useBudgetOverrunInsight } from "../hooks/useBudgetOverrunInsight";
import { useRecurringDetectedInsight } from "../hooks/useRecurringDetectedInsight";
import type { Insight } from "@shared/lib/insights/types";
import type { Transaction, Budget, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";

/** Max number of insight cards shown simultaneously. */
const MAX_VISIBLE = 2;

interface FinykInsightsBlockProps {
  transactions: readonly Transaction[];
  budgets: readonly Budget[];
  subscriptions?: readonly { id: string; keyword?: string; linkedTxId?: string | null; currency?: string }[];
  dismissedRecurring?: readonly string[];
  txCategories: Record<string, string | undefined>;
  txSplits: TxSplitsMap;
  customCategories?: readonly { id: string; label?: string }[];
  excludedTxIds?: ReadonlySet<string>;
}

export function FinykInsightsBlock({
  transactions,
  budgets,
  subscriptions = [],
  dismissedRecurring = [],
  txCategories,
  txSplits,
  customCategories = [],
  excludedTxIds,
}: FinykInsightsBlockProps) {
  const navigate = useNavigate();

  const overrunInsight = useBudgetOverrunInsight({
    budgets,
    transactions,
    txCategories,
    txSplits,
    customCategories,
  });

  const coffeeInsight = useCoffeeLimitInsight({
    transactions,
    txCategories,
    txSplits,
    customCategories,
  });

  const recurringInsight = useRecurringDetectedInsight({
    transactions,
    subscriptions,
    dismissedRecurring,
    excludedTxIds,
  });

  // Priority order: overrun > coffee > recurring
  const candidates: Array<Insight | null> = [
    overrunInsight,
    coffeeInsight,
    recurringInsight,
  ];

  const active = candidates
    .filter((insight): insight is Insight => insight !== null)
    .slice(0, MAX_VISIBLE);

  if (!active.length) return null;

  function handleActivate(insight: Insight) {
    if (insight.action.type === "navigate") {
      navigate(insight.action.path);
    } else if (insight.action.type === "callback") {
      insight.action.fn();
    }
    // open-chat type not used by finyk insights currently
  }

  return (
    <div className="space-y-1.5">
      {active.map((insight) => (
        <InsightCard
          key={insight.id}
          id={insight.id}
          title={insight.title}
          subtitle={insight.subtitle}
          onActivate={() => handleActivate(insight)}
        />
      ))}
    </div>
  );
}
