import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { CategoryIconChip } from "../../components/CategoryIconChip";
import { stripLeadingEmoji } from "../../components/txRowHelpers";
import { resolveExpenseCategoryMeta } from "../../utils";
import {
  formatLimitBudgetLabel,
  type LimitUsageEntry,
} from "@sergeant/finyk-domain/domain/budget";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";

interface BudgetAlertsListProps {
  /**
   * Готовий стан лімітів-алертів з `useOverviewData.budgetAlerts`
   * (`calcLimitUsages`: вікно періоду, кошики категорій, `pctRaw`/`overLimit`).
   * Тут нічого не рахується, лише рендер.
   */
  budgetAlerts: readonly LimitUsageEntry[];
  customCategories?: readonly CustomCategoryInput[];
  onOpenLimit: (categoryId: string) => void;
}

/**
 * Список плашок-алертів про перевищення 60%/100% ліміту бюджету.
 * Overview уже порахував і відфільтрував `budgetAlerts` (одне джерело стану
 * ліміту, як на Плануванні й у хабі); тут лише рендер.
 */
const BudgetAlertsListImpl = function BudgetAlertsList({
  budgetAlerts,
  customCategories,
  onOpenLimit,
}: BudgetAlertsListProps) {
  if (budgetAlerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {budgetAlerts.map((usage) => {
        const b = usage.budget;
        const pct = Math.round(usage.pctRaw);
        const over = usage.overLimit;
        // Вбудовані підписи чисті від емодзі з 2026-08-21; зріз лишається
        // рівно для назви КАСТОМНОЇ категорії, яку набирає людина.
        const catLabel =
          formatLimitBudgetLabel(b, (id) => {
            const meta = resolveExpenseCategoryMeta(id, customCategories);
            return meta?.label ? stripLeadingEmoji(meta.label) : null;
          }) || b.categoryId;
        return (
          <button
            type="button"
            key={b.id}
            onClick={() => onOpenLimit(b.categoryId)}
            aria-label={`${catLabel}: ${pct}%. Відкрити ліміт у плануванні`}
            className={cn(
              "w-full rounded-2xl px-4 py-3 flex items-center justify-between border text-left",
              "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              over
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
                over
                  ? "text-danger-strong dark:text-danger"
                  : "text-warning-strong dark:text-warning",
              )}
            >
              {pct}%{" "}
              {over ? (
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
