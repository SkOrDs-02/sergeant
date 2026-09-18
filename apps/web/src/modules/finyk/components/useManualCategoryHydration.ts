/**
 * Last validated: 2026-09-09
 * Status: Active
 *
 * Одноразова звірка власної категорії після відкладеної гідратації сховища.
 */
import { useEffect, useRef } from "react";
import { DEFAULT_CATEGORY } from "./manualExpenseCategories";
import { DEFAULT_INCOME_CATEGORY } from "./manualIncomeCategories";

interface ManualCategoryHydrationOptions {
  open: boolean;
  openInitKey: string;
  rawInitialCategory: string | null | undefined;
  initialRecordIsIncome: boolean;
  customExpenseIds: ReadonlySet<string>;
  customIncomeIds: ReadonlySet<string>;
  category: string;
  restoreCategory: (categoryId: string) => void;
}

export function useManualCategoryHydration({
  open,
  openInitKey,
  rawInitialCategory,
  initialRecordIsIncome,
  customExpenseIds,
  customIncomeIds,
  category,
  restoreCategory,
}: ManualCategoryHydrationOptions): void {
  const reconciledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      reconciledKeyRef.current = null;
      return;
    }
    const trimmed = rawInitialCategory?.trim();
    const hydratedIds = initialRecordIsIncome
      ? customIncomeIds
      : customExpenseIds;
    if (!trimmed || !hydratedIds.has(trimmed)) return;
    if (reconciledKeyRef.current === openInitKey) return;
    reconciledKeyRef.current = openInitKey;
    const fallback = initialRecordIsIncome
      ? DEFAULT_INCOME_CATEGORY
      : DEFAULT_CATEGORY;
    if (category !== fallback) return;
    restoreCategory(trimmed);
  }, [
    open,
    openInitKey,
    rawInitialCategory,
    initialRecordIsIncome,
    customExpenseIds,
    customIncomeIds,
    category,
    restoreCategory,
  ]);
}
