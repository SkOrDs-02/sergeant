/**
 * `useShoppingList` — MMKV + `@sergeant/nutrition-domain` (паритет із web
 * `apps/web/.../useShoppingList.ts`). Cross-device sync для shopping
 * наразі не активований — модуль не нормалізований у SQLite (немає
 * `nutrition_shopping_*` таблиць у `packages/db-schema/src/sqlite/`),
 * тож op-log v2 його не покриває (як і на web). Локальний MMKV-стан
 * лише.
 */
import { useCallback, useEffect, useState } from "react";

import {
  getCheckedItems,
  getTotalCount,
  normalizeShoppingList,
  removeCheckedItems,
  toggleShoppingItem,
  type ShoppingCategory,
  type ShoppingItem,
  type ShoppingList,
} from "@sergeant/nutrition-domain";

import { loadShoppingList, saveShoppingList } from "../lib/nutritionStore";

function makeItemId(): string {
  return `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseShoppingListResult {
  shoppingList: ShoppingList;
  totalCount: { total: number; checked: number };
  checkedItems: ShoppingItem[];
  toggle: (categoryName: string, itemId: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
  setGeneratedList: (categories: ShoppingCategory[] | null | undefined) => void;
  /** Додає позицію в категорію «Інше» (швидке ручне введення). */
  addItemToCategory: (categoryName: string, name: string) => void;
}

export function useShoppingList(): UseShoppingListResult {
  const [shoppingList, setShoppingList] = useState<ShoppingList>(() =>
    loadShoppingList(),
  );

  useEffect(() => {
    saveShoppingList(shoppingList);
  }, [shoppingList]);

  const totalCount = getTotalCount(shoppingList);
  const checkedItems = getCheckedItems(shoppingList);

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
      setShoppingList(
        normalizeShoppingList({
          categories: Array.isArray(categories) ? categories : [],
        }),
      );
    },
    [],
  );

  const addItemToCategory = useCallback(
    (categoryName: string, name: string) => {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      const cat = String(categoryName || "Інше").trim() || "Інше";
      const item: ShoppingItem = {
        id: makeItemId(),
        name: trimmed,
        quantity: "",
        note: "",
        checked: false,
      };
      setShoppingList((prev) => {
        const categories = [...(prev.categories || [])];
        const i = categories.findIndex((c) => c.name === cat);
        if (i === -1) {
          return normalizeShoppingList({
            categories: [...categories, { name: cat, items: [item] }],
          });
        }
        const next = [...categories];
        next[i] = {
          ...next[i]!,
          items: [...(next[i]!.items || []), item],
        };
        return normalizeShoppingList({ categories: next });
      });
    },
    [],
  );

  return {
    shoppingList,
    totalCount,
    checkedItems,
    toggle,
    clearChecked,
    clearAll,
    setGeneratedList,
    addItemToCategory,
  };
}
