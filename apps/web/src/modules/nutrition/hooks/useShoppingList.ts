/**
 * Last validated: 2026-07-05
 * Status: Active
 */
import { useCallback, useEffect, useState } from "react";
import {
  loadShoppingList,
  persistShoppingList,
  toggleShoppingItem,
  removeCheckedItems,
  getCheckedItems,
  normalizeShoppingList,
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
  checkedItems: ShoppingItem[];
}

export function useShoppingList(): UseShoppingListResult {
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [shoppingList, setShoppingList] = useState<ShoppingList>(() =>
    loadShoppingList(),
  );

  useEffect(() => {
    persistShoppingList(shoppingList);
  }, [shoppingList]);

  // Dual-write teardown Phase 1 — overlay the shopping list from the
  // local SQLite cache once it's warm. Mirrors `useNutritionLog`'s
  // overlay effect.
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setShoppingList(normalizeShoppingList(cache.shoppingList));
  }, [sqliteCacheTick]);

  const toggle = useCallback((categoryName: string, itemId: string) => {
    setShoppingList((list) => toggleShoppingItem(list, categoryName, itemId));
  }, []);

  const clearChecked = useCallback(() => {
    setShoppingList((list) => removeCheckedItems(list));
  }, []);

  const clearAll = useCallback(() => {
    setShoppingList({ categories: [] });
  }, []);

  const setGeneratedList = useCallback(
    (categories: ShoppingCategory[] | null | undefined) => {
      setShoppingList({
        categories: Array.isArray(categories) ? categories : [],
      });
    },
    [],
  );

  const checkedItems = getCheckedItems(shoppingList);

  return {
    shoppingList,
    toggle,
    clearChecked,
    clearAll,
    setGeneratedList,
    checkedItems,
  };
}
