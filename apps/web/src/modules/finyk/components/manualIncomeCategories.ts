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

export type IncomeCategorySlug =
  "salary" | "freelance" | "gift" | "refund" | "other-income";

export const INCOME_CATEGORY_DISPLAY: Record<
  IncomeCategorySlug,
  CategoryDisplay
> = {
  salary: { iconName: "briefcase", label: "Зарплата" },
  freelance: { iconName: "monitor", label: "Фріланс" },
  gift: { iconName: "package", label: "Подарунок" },
  refund: { iconName: "refresh-cw", label: "Повернення" },
  "other-income": { iconName: "tag", label: "Інше" },
};

export const INCOME_CATEGORY_SLUGS: IncomeCategorySlug[] = [
  "salary",
  "freelance",
  "gift",
  "refund",
  "other-income",
];

export const DEFAULT_INCOME_CATEGORY: IncomeCategorySlug = "salary";

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
  return isIncomeCategorySlug(trimmed) ? trimmed : DEFAULT_INCOME_CATEGORY;
}
