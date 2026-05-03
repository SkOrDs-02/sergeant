/**
 * Sergeant Finyk — category-aware filter bookkeeping for the
 * `TransactionsPage`. Owns the merged expense/income category lists,
 * the `activeCategoryLabel`, and the per-tx effective category lookup
 * shared by the filter and renderer layers.
 */
import { useCallback, useMemo } from "react";

import {
  getCategory,
  getIncomeCategory,
  mergeExpenseCategoryDefinitions,
  INCOME_CATEGORIES,
} from "@sergeant/finyk-domain";
import type { Transaction } from "@sergeant/finyk-domain/domain";

import { BASE_FILTERS, type FilterChip } from "../types";

export interface UseCategoryFiltersInput {
  filterId: string;
  customCategories: { id: string; label: string }[];
  txCategories: Record<string, string | null>;
  creditCount: number;
}

export interface UseCategoryFiltersResult {
  filterChips: FilterChip[];
  allExpenseCategories: { id: string; label: string }[];
  allIncomeCategories: { id: string; label: string }[];
  activeCategoryLabel: string | null;
  getEffectiveCat: (t: Transaction) => { id: string; label: string };
}

export function useCategoryFilters({
  filterId,
  customCategories,
  txCategories,
  creditCount,
}: UseCategoryFiltersInput): UseCategoryFiltersResult {
  const categoryChips = useMemo<FilterChip[]>(
    () => customCategories.map((c) => ({ id: c.id, label: c.label })),
    [customCategories],
  );

  const filterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [...BASE_FILTERS];
    if (creditCount > 0) {
      chips.push({ id: "credit", label: "💳 Кредитна" });
    }
    chips.push(...categoryChips);
    return chips;
  }, [creditCount, categoryChips]);

  const allExpenseCategories = useMemo<{ id: string; label: string }[]>(() => {
    const merged = mergeExpenseCategoryDefinitions(
      customCategories.map((c) => ({ id: c.id, label: c.label })),
    ) as { id: string; label: string }[];
    return merged.filter((c) => c.id !== "income");
  }, [customCategories]);

  const allIncomeCategories = useMemo<{ id: string; label: string }[]>(
    () => INCOME_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    [],
  );

  const activeCategoryLabel = useMemo<string | null>(() => {
    if (
      filterId === "all" ||
      filterId === "expense" ||
      filterId === "income" ||
      filterId === "credit"
    ) {
      return null;
    }
    const hit =
      allExpenseCategories.find((c) => c.id === filterId) ??
      allIncomeCategories.find((c) => c.id === filterId);
    return hit ? hit.label : null;
  }, [filterId, allExpenseCategories, allIncomeCategories]);

  const getEffectiveCat = useCallback(
    (t: Transaction): { id: string; label: string } => {
      if (t.amount > 0) {
        return getIncomeCategory(t.description, txCategories[t.id]) as {
          id: string;
          label: string;
        };
      }
      return getCategory(
        t.description,
        t.mcc,
        txCategories[t.id],
        customCategories,
      ) as { id: string; label: string };
    },
    [txCategories, customCategories],
  );

  return {
    filterChips,
    allExpenseCategories,
    allIncomeCategories,
    activeCategoryLabel,
    getEffectiveCat,
  };
}
