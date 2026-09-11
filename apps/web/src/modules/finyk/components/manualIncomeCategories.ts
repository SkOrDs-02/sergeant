/**
 * Last validated: 2026-07-24
 * Status: Active
 *
 * Category-slug system for manual INCOME entries in ManualExpenseSheet.
 * Deliberately separate from `manualExpenseCategories.ts` (fab-and-manual-income
 * spec §2: "короткий власний набір чіпів, окремий від категорій витрат") — no
 * legacy-era upgrade path needed since this taxonomy launches fresh.
 */
import type { CategoryDisplay } from "./manualExpenseCategories";
import { MANUAL_INCOME_TAXONOMY } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import type { IconName } from "@shared/components/ui/Icon";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";

export type IncomeCategorySlug =
  | "salary"
  | "freelance"
  | "gift"
  | "refund"
  | "cashback"
  | "pension"
  | "debt-income"
  | "other-income";

/** Похідна від `MANUAL_INCOME_TAXONOMY` — див. `manualExpenseCategories`. */
export const INCOME_CATEGORY_DISPLAY: Record<
  IncomeCategorySlug,
  CategoryDisplay
> = Object.fromEntries(
  MANUAL_INCOME_TAXONOMY.map((d) => [
    d.id,
    { iconName: d.iconName as IconName, label: d.label },
  ]),
) as Record<IncomeCategorySlug, CategoryDisplay>;

export const INCOME_CATEGORY_SLUGS: IncomeCategorySlug[] =
  MANUAL_INCOME_TAXONOMY.map((d) => d.id as IncomeCategorySlug);

export const DEFAULT_INCOME_CATEGORY: IncomeCategorySlug = "salary";

export function incomeCustomCategories(
  categories: readonly CustomCategoryInput[],
): CustomCategoryInput[] {
  return categories.filter(
    (category) =>
      typeof category?.id === "string" &&
      category.id.trim() !== "" &&
      category.kind === "income",
  );
}

export function expenseCustomCategories(
  categories: readonly CustomCategoryInput[],
): CustomCategoryInput[] {
  return categories.filter(
    (category) =>
      typeof category?.id === "string" &&
      category.id.trim() !== "" &&
      category.kind !== "income",
  );
}

export function incomeCategoryDisplay(
  categories: readonly CustomCategoryInput[],
): Readonly<Record<string, CategoryDisplay>> {
  return {
    ...INCOME_CATEGORY_DISPLAY,
    ...Object.fromEntries(
      categories.map((category) => [
        category.id,
        { iconName: "tag" as const, label: category.label ?? category.id },
      ]),
    ),
  };
}

export function isIncomeCategorySlug(
  value: string,
): value is IncomeCategorySlug {
  return Object.prototype.hasOwnProperty.call(INCOME_CATEGORY_DISPLAY, value);
}

/** Normalises any stored income-category value to a known slug. */
export function upgradeIncomeCategory(
  raw: string | null | undefined,
): IncomeCategorySlug {
  if (!raw) return DEFAULT_INCOME_CATEGORY;
  const trimmed = raw.trim();
  const legacy: Record<string, IncomeCategorySlug> = {
    in_salary: "salary",
    in_freelance: "freelance",
    in_cashback: "cashback",
    in_pension: "pension",
    in_debt: "debt-income",
    in_other: "other-income",
  };
  if (legacy[trimmed]) return legacy[trimmed];
  return isIncomeCategorySlug(trimmed) ? trimmed : DEFAULT_INCOME_CATEGORY;
}
