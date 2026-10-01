/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Category chip picker + AI-applied badge for ManualExpenseSheet.
 * Extracted for Hard Rule #18 (`max-lines: 600`).
 */
import type { Dispatch, SetStateAction } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { Icon } from "@shared/components/ui/Icon";
import { Badge } from "@shared/components/ui/Badge";
import type { CategoryDisplay } from "./manualExpenseCategories";
import type { ExpenseFormValues } from "./manualExpenseForm";

interface ManualExpenseCategorySectionProps {
  catLabelId: string;
  /** Slug → display map for the active kind (expense or income taxonomy). */
  categoryDisplay: Record<string, CategoryDisplay>;
  aiAppliedCategory: string | null;
  categorySlug: string;
  visibleCategories: string[];
  hasHiddenCategories: boolean;
  categoriesExpanded: boolean;
  setCategoriesExpanded: Dispatch<SetStateAction<boolean>>;
  setAiAppliedCategory: Dispatch<SetStateAction<string | null>>;
  setValue: UseFormSetValue<ExpenseFormValues>;
}

export function ManualExpenseCategorySection({
  catLabelId,
  categoryDisplay,
  aiAppliedCategory,
  categorySlug,
  visibleCategories,
  hasHiddenCategories,
  categoriesExpanded,
  setCategoriesExpanded,
  setAiAppliedCategory,
  setValue,
}: ManualExpenseCategorySectionProps) {
  return (
    <div>
      <div
        id={catLabelId}
        // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Category group label needs a stable id (catLabelId) for aria-labelledby; Label would require dropping htmlFor.
        className="block text-xs text-muted uppercase tracking-wide font-semibold mb-1"
      >
        Категорія
      </div>
      {/* 6.3: AI-applied badge surfaces the silent merchant→category
          auto-application. Renders only when AI applied and current
          category still matches the AI suggestion (so dismissal +
          manual overrides hide it). Dismiss = clear local state only;
          category stays applied (user can still change it via picker
          below).
          motion-safe wrappers — reduced-motion users see a static
          badge without the fade-in. */}
      {aiAppliedCategory && categorySlug === aiAppliedCategory ? (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 mb-2">
          <Badge
            variant="finyk"
            tone="soft"
            size="sm"
            className="inline-flex items-center gap-1.5"
          >
            <Icon name="sparkles" size={12} aria-hidden />
            AI ·{" "}
            {categoryDisplay[aiAppliedCategory]?.label ?? aiAppliedCategory}
            <button
              type="button"
              onClick={() => setAiAppliedCategory(null)}
              aria-label="Сховати AI-підказку"
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-finyk/20 transition-colors touch-target"
            >
              <Icon name="close" size={10} aria-hidden />
            </button>
          </Badge>
        </div>
      ) : null}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={catLabelId}
      >
        {visibleCategories.map((slug) => {
          const display = categoryDisplay[slug];
          return (
            <button
              key={slug}
              type="button"
              onClick={() => {
                setValue("category", slug, { shouldDirty: true });
                // Manual category pick supersedes any AI suggestion;
                // clear the badge so it doesn't linger after an
                // explicit user choice.
                if (slug !== aiAppliedCategory) {
                  setAiAppliedCategory(null);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-style-caption border transition-[background-color,border-color,color,opacity,transform] duration-150 ease-smooth active:scale-95 ${
                categorySlug === slug
                  ? "bg-finyk-strong text-white border-finyk-strong shadow-sm"
                  : "bg-panelHi text-muted border-line hover:border-muted/50 hover:bg-panelHi/80"
              }`}
            >
              <Icon name={display?.iconName ?? "tag"} size="xs" aria-hidden />
              {display?.label ?? slug}
            </button>
          );
        })}
        {hasHiddenCategories && (
          <button
            type="button"
            onClick={() => setCategoriesExpanded((v) => !v)}
            aria-expanded={categoriesExpanded}
            className="px-3 py-1.5 rounded-full text-style-caption border border-line bg-panel text-muted hover:text-text hover:border-muted/50 hover:bg-panelHi transition-[background-color,border-color,color,opacity,transform] duration-150 ease-smooth active:scale-95"
          >
            {categoriesExpanded ? "Менше ▴" : "Більше ▾"}
          </button>
        )}
      </div>
    </div>
  );
}
