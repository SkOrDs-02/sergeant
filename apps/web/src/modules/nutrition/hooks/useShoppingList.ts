/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useCallback, useEffect, useState } from "react";
import {
  loadShoppingList,
  persistShoppingList,
  toggleShoppingItem,
  removeCheckedItems,
  getCheckedItems,
  type ShoppingCategory,
  type ShoppingItem,
  type ShoppingList,
} from "../lib/shoppingListStorage";

export interface UseShoppingListResult {
  shoppingList: ShoppingList;
  toggle: (categoryName: string, itemId: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
  setGeneratedList: (categories: ShoppingCategory[] | null | undefined) => void;
  checkedItems: ShoppingItem[];
}

export function useShoppingList(): UseShoppingListResult {
  const [shoppingList, setShoppingList] = useState<ShoppingList>(() =>
    loadShoppingList(),
  );

  useEffect(() => {
    persistShoppingList(shoppingList);
  }, [shoppingList]);

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
