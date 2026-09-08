/**
 * Last validated: 2026-09-09
 * Status: Active
 *
 * Category picker + AI-applied badge for ManualExpenseSheet. Extracted
 * for Hard Rule #18 (`max-lines: 600`).
 *
 * Рішення 2026-09-09: ручні та банківські операції мають однакове
 * однорядкове поле, яке відкриває пошукову шторку. Таксономії лишаються
 * контекстними; уніфікується лише взаємодія.
 */
import type { Dispatch, SetStateAction } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Icon } from "@shared/components/ui/Icon";
import { Badge } from "@shared/components/ui/Badge";
import { Label } from "@shared/components/ui/FormField";
import { CategoryPickerField } from "./CategoryPickerField";
import type { CategoryDisplay } from "./manualExpenseCategories";
import type { ExpenseFormValues } from "./manualExpenseForm";

interface ManualExpenseCategorySectionProps {
  catLabelId: string;
  /** Slug → display map for the active kind (expense or income taxonomy). */
  categoryDisplay: Record<string, CategoryDisplay>;
  aiAppliedCategory: string | null;
  categoryError?: string | undefined;
  categorySlug: string;
  /** Ordered slugs for the active kind — frequency-sorted for expense, fixed for income. */
  categorySlugs: string[];
  frequentCategoryIds?: readonly string[];
  register: UseFormRegister<ExpenseFormValues>;
  setValue: UseFormSetValue<ExpenseFormValues>;
  setAiAppliedCategory: Dispatch<SetStateAction<string | null>>;
}

export function ManualExpenseCategorySection({
  catLabelId,
  categoryDisplay,
  aiAppliedCategory,
  categoryError,
  categorySlug,
  categorySlugs,
  frequentCategoryIds = [],
  register,
  setValue,
  setAiAppliedCategory,
}: ManualExpenseCategorySectionProps) {
  const categoryRegistration = register("category");
  const errorId = `${catLabelId}-error`;
  const categories = categorySlugs.map((slug) => ({
    id: slug,
    label: categoryDisplay[slug]?.label ?? slug,
  }));
  return (
    <div>
      <Label htmlFor={catLabelId}>Категорія</Label>
      {/* 6.3: AI-applied badge surfaces the silent merchant→category
          auto-application. Renders only when AI applied and current
          category still matches the AI suggestion (so dismissal +
          manual overrides hide it). Dismiss = clear local state only;
          category stays applied (user can still change it via the
          dropdown below).
          motion-safe wrappers — reduced-motion users see a static
          badge without the fade-in. */}
      {aiAppliedCategory && categorySlug === aiAppliedCategory ? (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-base mb-2">
          <Badge
            variant="finyk"
            tone="soft"
            size="sm"
            className="inline-flex items-center gap-1.5"
          >
            <Icon name="sergeant" size={12} aria-hidden />
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
      <input {...categoryRegistration} type="hidden" value={categorySlug} />
      <CategoryPickerField
        id={catLabelId}
        categories={categories}
        selectedId={categorySlug}
        frequentIds={frequentCategoryIds}
        error={Boolean(categoryError)}
        describedBy={categoryError ? errorId : undefined}
        onSelect={(slug) => {
          // `useApiForm` runs RHF in its default `mode: "onSubmit"`, so a
          // plain field change never re-runs the resolver before the first
          // submit. Switching Витрата ↔ Надходження blanks the category with
          // `shouldValidate: true` (the taxonomies don't overlap), which
          // paints "Обери категорію" immediately — and without an explicit
          // re-validation here that warning stayed on screen even after the
          // user picked a category. Mirrors the amount field's
          // `shouldValidate: Boolean(amountError)` idiom: only re-validate
          // while an error is actually displayed, so an untouched field never
          // starts erroring on its own.
          setValue("category", slug, {
            shouldDirty: true,
            shouldValidate: Boolean(categoryError),
          });
          // Manual category pick supersedes any AI suggestion; clear the
          // badge so it doesn't linger after an explicit user choice.
          if (slug !== aiAppliedCategory) {
            setAiAppliedCategory(null);
          }
        }}
      />
      {categoryError ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-style-caption text-danger-strong dark:text-danger"
        >
          {categoryError}
        </p>
      ) : null}
    </div>
  );
}
