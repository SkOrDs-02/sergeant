import { memo } from "react";
import { cn } from "@shared/lib/cn";
import { calcCategorySpent, resolveExpenseCategoryMeta } from "../../utils";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type {
  TxSplitsMap,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";

interface BudgetAlertsListProps {
  budgetAlerts: ReadonlyArray<{
    id: string;
    categoryId: string;
    limit: number;
    [extra: string]: unknown;
  }>;
  statTx: readonly Transaction[];
  txCategories: Record<string, string | undefined>;
  txSplits: TxSplitsMap;
  customCategories?: readonly CustomCategoryInput[];
}

/**
 * Список плашок-алертів про перевищення 60%/100% ліміту бюджету.
 * Overview уже відфільтрував `budgets` → `budgetAlerts`; тут лише рендер.
 */
const BudgetAlertsListImpl = function BudgetAlertsList({
  budgetAlerts,
  statTx,
  txCategories,
  txSplits,
  customCategories,
}: BudgetAlertsListProps) {
  if (budgetAlerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {budgetAlerts.map((b, i) => {
        const cat = resolveExpenseCategoryMeta(b.categoryId, customCategories);
        const s = calcCategorySpent(
          statTx,
          b.categoryId,
          txCategories,
          txSplits,
          customCategories,
        );
        const pct = Math.round((s / b.limit) * 100);
        return (
          <div
            key={i}
            className={cn(
              "rounded-2xl px-4 py-3 flex items-center justify-between border",
              pct >= 100
                ? "bg-danger/8 border-danger/20"
                : "bg-warning/8 border-warning/20",
            )}
          >
            <span className="text-style-label">
              {cat?.label || b.categoryId}
            </span>
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                pct >= 100 ? "text-danger" : "text-warning",
              )}
            >
              {pct}% {pct >= 100 ? "⚠ перевищено" : "· понад 60% ліміту"}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const BudgetAlertsList = memo(BudgetAlertsListImpl);
