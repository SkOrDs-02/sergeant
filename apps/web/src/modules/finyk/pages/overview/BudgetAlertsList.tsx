import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { CategoryIconChip } from "../../components/CategoryIconChip";
import { stripLeadingEmoji } from "../../components/txRowHelpers";
import { calcCategorySpent, resolveExpenseCategoryMeta } from "../../utils";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type {
  LimitBudget,
  TxSplitsMap,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";

interface BudgetAlertsListProps {
  budgetAlerts: readonly LimitBudget[];
  statTx: readonly Transaction[];
  txCategories: Record<string, string | undefined>;
  txSplits: TxSplitsMap;
  customCategories?: readonly CustomCategoryInput[];
  onOpenLimit: (categoryId: string) => void;
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
  onOpenLimit,
}: BudgetAlertsListProps) {
  if (budgetAlerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {budgetAlerts.map((b) => {
        const cat = resolveExpenseCategoryMeta(b.categoryId, customCategories);
        const s = calcCategorySpent(
          statTx,
          b.categoryId,
          txCategories,
          txSplits,
          customCategories,
        );
        const pct = b.limit > 0 ? Math.round((s / b.limit) * 100) : 0;
        // Вбудовані підписи чисті від емодзі з 2026-08-21; зріз лишається
        // рівно для назви КАСТОМНОЇ категорії, яку набирає людина.
        const catLabel = cat?.label
          ? stripLeadingEmoji(cat.label)
          : b.categoryId;
        return (
          <button
            type="button"
            key={b.id}
            onClick={() => onOpenLimit(b.categoryId)}
            aria-label={`${catLabel}: ${pct}%. Відкрити ліміт у плануванні`}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center justify-between border text-left",
              "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
              pct >= 100
                ? "bg-danger/8 border-danger/20 hover:bg-danger/10"
                : "bg-warning/8 border-warning/20 hover:bg-warning/10",
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <CategoryIconChip
                categoryId={b.categoryId}
                customCategories={customCategories}
                size={24}
              />
              <span className="text-style-label truncate">{catLabel}</span>
            </span>
            <span
              className={cn(
                "text-style-label tabular-nums",
                pct >= 100
                  ? "text-danger-strong dark:text-danger"
                  : "text-warning-strong dark:text-warning",
              )}
            >
              {pct}%{" "}
              {pct >= 100 ? (
                <>
                  <Icon name="alert-triangle" size={13} aria-hidden />
                  {messages.finyk.budgetOverLimit}
                </>
              ) : (
                messages.finyk.budgetOverSixtyPercent
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const BudgetAlertsList = memo(BudgetAlertsListImpl);
