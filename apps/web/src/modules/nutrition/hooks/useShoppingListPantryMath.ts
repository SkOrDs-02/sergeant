/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * «Рівень 1» списку покупок — view-шар поверх `@sergeant/nutrition-domain`'s
 * `applyPantryToShoppingList` / `mergeLowStockIntoList`. НЕ персистить нічого
 * у сирий `ShoppingList` — рахує `CalculatedShoppingList` заново з поточного
 * `shoppingList` + `pantryItems` на кожен рендер. Чекбокси й далі йдуть по
 * `item.id` над сирим списком (`useShoppingList.toggle`).
 *
 * Тумблер «Враховувати комору» персистить лише свій булевий стан — не сам
 * розрахунок — через `safeReadLS`/`safeWriteLS` (Hard Rule: жоден raw
 * `localStorage` виклик поза цими врапперами).
 */
import { useCallback, useMemo, useState } from "react";
import {
  applyPantryToShoppingList,
  categorizeFood,
  mergeLowStockIntoList,
  type CalculatedShoppingList,
  type PantryItem,
  type ShoppingList,
} from "@sergeant/nutrition-domain";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

/** Ключ тумблера — не сам розрахунок, лише вибір користувача. */
export const SHOPPING_PANTRY_MATH_TOGGLE_KEY =
  "nutrition_shopping_pantry_math_v1";

const EMPTY_LIST: ShoppingList = { categories: [] };

function toRawCalculated(list: ShoppingList): CalculatedShoppingList {
  return {
    categories: list.categories.map((cat) => ({
      name: cat.name,
      items: cat.items.map((item) => ({
        ...item,
        calcNote: "",
        calcSource: "list" as const,
      })),
    })),
    athome: [],
  };
}

export interface UseShoppingListPantryMathResult {
  /** Чи ввімкнено врахування комори (дефолт — `true`, персистить вибір). */
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  /** Є що рахувати — комора має хоч одну позицію. Контрол варто ховати інакше. */
  available: boolean;
  /** Розрахований список: активні (можливо скориговані) позиції + «Вже вдома». */
  calculated: CalculatedShoppingList;
}

export function useShoppingListPantryMath(
  shoppingList: ShoppingList | null | undefined,
  pantryItems: readonly PantryItem[] | null | undefined,
): UseShoppingListPantryMathResult {
  const [enabled, setEnabledState] = useState<boolean>(
    () => safeReadLS<boolean>(SHOPPING_PANTRY_MATH_TOGGLE_KEY) ?? true,
  );

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    safeWriteLS(SHOPPING_PANTRY_MATH_TOGGLE_KEY, next);
  }, []);

  const available = Array.isArray(pantryItems) && pantryItems.length > 0;

  const calculated = useMemo<CalculatedShoppingList>(() => {
    const list = shoppingList ?? EMPTY_LIST;
    if (!enabled || !available) return toRawCalculated(list);
    const items = pantryItems ?? [];
    const applied = applyPantryToShoppingList(list, items);
    return mergeLowStockIntoList(applied, items, categorizeFood);
  }, [shoppingList, pantryItems, enabled, available]);

  return { enabled, setEnabled, available, calculated };
}
