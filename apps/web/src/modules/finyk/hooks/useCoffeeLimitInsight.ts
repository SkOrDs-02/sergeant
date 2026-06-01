/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Detection hook for the "coffee MoM growth ≥ 25%" insight trigger.
 *
 * There is no "coffee" category in the Finyk MCC taxonomy. The closest
 * matching slug is "restaurant" (id: "restaurant", label: "🍔 Кафе та
 * ресторани", MCC 5812/5813/5814). That slug covers coffee-shop and café
 * spend, which is the intended trigger surface. See PR body for rationale.
 *
 * The hook is pure-memoized — no side effects, no additional subscriptions.
 */

import { useMemo } from "react";
import { calcCategorySpent } from "@sergeant/finyk-domain/domain/categories";
import type { Insight } from "@shared/lib/insights/types";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";

// Tunable thresholds — export so tests can override.
/** MoM growth ratio that triggers the insight (0.25 = 25%). */
export const COFFEE_MOM_GROWTH_THRESHOLD = 0.25;

/**
 * Category slug used as a proxy for "coffee" spend.
 * Taxonomy has no dedicated "coffee" id — "restaurant" (MCC 5812-5814)
 * covers cafés and is the closest match.
 */
export const COFFEE_CATEGORY_SLUG = "restaurant";

/** "YYYY-MM" for the month before `month`. */
function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return "";
  const date = new Date(y, (m ?? 1) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" for today (Europe/Kyiv boundary — uses local clock, same as the rest of Finyk). */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Sum category spend for a given "YYYY-MM" month slice. */
function monthlyCategorySpend(
  transactions: readonly Transaction[],
  categoryId: string,
  month: string,
  txCategories: Record<string, string | undefined>,
  txSplits: TxSplitsMap,
  customCategories: readonly { id: string; label?: string | undefined }[],
): number {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 0;
  const monthStart = new Date(y, m - 1, 1).getTime();
  const monthEnd = new Date(y, m, 1).getTime();

  const filtered = transactions.filter((tx) => {
    // `tx.time` is unix seconds for mono txs; `tx.date` is "YYYY-MM-DD" for manual.
    // Prefer `tx.time` (epoch) when available, fall back to `tx.date` string parse.
    const tsMs =
      tx.time > 0
        ? tx.time > 1e10
          ? tx.time
          : tx.time * 1000
        : new Date(tx.date).getTime();
    return tsMs >= monthStart && tsMs < monthEnd;
  });

  return calcCategorySpent(
    filtered,
    categoryId,
    txCategories,
    txSplits,
    customCategories,
  );
}

interface UseCoffeeLimitInsightArgs {
  transactions: readonly Transaction[];
  txCategories: Record<string, string | undefined>;
  txSplits: TxSplitsMap;
  customCategories?:
    | readonly { id: string; label?: string | undefined }[]
    | undefined;
}

export function useCoffeeLimitInsight({
  transactions,
  txCategories,
  txSplits,
  customCategories = [],
}: UseCoffeeLimitInsightArgs): Insight | null {
  return useMemo(() => {
    if (!transactions.length) return null;

    const month = currentMonth();
    const prevMonth = previousMonth(month);
    if (!prevMonth) return null;

    const thisMonthSpend = monthlyCategorySpend(
      transactions,
      COFFEE_CATEGORY_SLUG,
      month,
      txCategories,
      txSplits,
      customCategories,
    );
    const lastMonthSpend = monthlyCategorySpend(
      transactions,
      COFFEE_CATEGORY_SLUG,
      prevMonth,
      txCategories,
      txSplits,
      customCategories,
    );

    if (
      lastMonthSpend <= 0 ||
      thisMonthSpend / lastMonthSpend < 1 + COFFEE_MOM_GROWTH_THRESHOLD
    ) {
      return null;
    }

    const pct = Math.round((thisMonthSpend / lastMonthSpend - 1) * 100);
    const amount = Math.round(thisMonthSpend);

    return {
      id: `finyk-coffee-limit-${month}`,
      module: "finyk",
      title: `Витрати на каву ↑ ${pct}%`,
      subtitle: `Це ${amount.toLocaleString("uk-UA")} грн. Встановити ліміт?`,
      action: {
        type: "navigate",
        path: `/finyk/budgets?cat=${COFFEE_CATEGORY_SLUG}`,
      },
      // Hub surface promoted post-Phase 5e: spending awareness is useful
      // cross-module — user may not be in Finyk when threshold matters, and
      // the "Встановити ліміт?" action navigates with full context.
      showOn: "both",
    };
  }, [transactions, txCategories, txSplits, customCategories]);
}
