/**
 * Last validated: 2026-07-05
 * Status: Active
 */
import { useCallback, useEffect } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import {
  loadShoppingList,
  persistShoppingList,
  toggleShoppingItem,
  removeCheckedItems,
  getCheckedItems,
  normalizeShoppingList,
  addManualShoppingItem,
  mergeGeneratedShoppingList,
  type AddShoppingItemInput,
  type ShoppingCategory,
  type ShoppingItem,
  type ShoppingList,
} from "../lib/shoppingListStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export interface UseShoppingListResult {
  shoppingList: ShoppingList;
  toggle: (categoryName: string, itemId: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
  setGeneratedList: (categories: ShoppingCategory[] | null | undefined) => void;
  addItem: (input: AddShoppingItemInput) => void;
  checkedItems: ShoppingItem[];
}

export function useShoppingList(): UseShoppingListResult {
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [shoppingList, setShoppingList] = useSqliteTickOverlay<ShoppingList>(
    sqliteCacheTick,
    () => {
      const cache = getCachedNutritionSqliteState();
      return cache.refreshedAt === null
        ? undefined
        : normalizeShoppingList(cache.shoppingList);
    },
    () => loadShoppingList(),
  );

  useEffect(() => {
    persistShoppingList(shoppingList);
  }, [shoppingList]);

  const toggle = useCallback(
    (categoryName: string, itemId: string) => {
      setShoppingList((list) => toggleShoppingItem(list, categoryName, itemId));
    },
    [setShoppingList],
  );

  const clearChecked = useCallback(() => {
    setShoppingList((list) => removeCheckedItems(list));
  }, [setShoppingList]);

  const clearAll = useCallback(() => {
    setShoppingList({ categories: [] });
  }, [setShoppingList]);

  const setGeneratedList = useCallback(
    // Merge, не replace: ручні позиції (`source: "manual"`) переживають
    // регенерацію AI-списку — див. `mergeGeneratedShoppingList`.
    (categories: ShoppingCategory[] | null | undefined) => {
      setShoppingList((list) => mergeGeneratedShoppingList(list, categories));
    },
    [setShoppingList],
  );

  const addItem = useCallback(
    (input: AddShoppingItemInput) => {
      setShoppingList((list) => addManualShoppingItem(list, input));
    },
    [setShoppingList],
  );

  const checkedItems = getCheckedItems(shoppingList);

  return {
    shoppingList,
    toggle,
    clearChecked,
    clearAll,
    setGeneratedList,
    addItem,
    checkedItems,
  };
}
