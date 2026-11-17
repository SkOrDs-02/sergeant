import { useMemo } from "react";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import {
  expenseCustomCategories,
  incomeCustomCategories,
} from "./manualIncomeCategories";

/**
 * Власні категорії аркуша ручного запису, розкладені на витратні й дохідні, з
 * наборами id. Мемо тримають `customIds`/`customIncomeIds` стабільними для
 * нормалізації категорії в `ManualExpenseSheet`. Винесено звідти (Hard
 * Rule #18, max-lines 600).
 */
export function useManualCustomCategories(
  customCategories: readonly CustomCategoryInput[],
) {
  const customExpenseCategories = useMemo(
    () => expenseCustomCategories(customCategories),
    [customCategories],
  );
  const customIds = useMemo(
    () => new Set(customExpenseCategories.map((c) => c.id)),
    [customExpenseCategories],
  );
  const customIncomeCategories = useMemo(
    () => incomeCustomCategories(customCategories),
    [customCategories],
  );
  const customIncomeIds = useMemo(
    () => new Set(customIncomeCategories.map((c) => c.id)),
    [customIncomeCategories],
  );
  return {
    customExpenseCategories,
    customIds,
    customIncomeCategories,
    customIncomeIds,
  };
}
