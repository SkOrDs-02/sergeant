/**
 * Web I/O-адаптер для списку покупок.
 *
 * Pure-логіка (`normalizeShoppingList`, `toggleShoppingItem`,
 * `removeCheckedItems`, `getCheckedItems`, `getTotalCount`, типи) живе у
 * `@sergeant/nutrition-domain` і спільна з `apps/mobile`. Тут лишаються
 * лише load/persist поверх `createModuleStorage`.
 *
 * Stage 11 / PR #070n-dualwrite — `persistShoppingList` тепер плюс
 * мирорить нормалізований документ у локальний SQLite через
 * `persistNutritionShoppingList`. LS-write залишається як safety-net до
 * наступного `#057n-tombstone`-кроку для shopping-list.
 */
import {
  SHOPPING_LIST_KEY,
  normalizeShoppingList,
  type ShoppingList,
} from "@sergeant/nutrition-domain";

import { nutritionStorage } from "./nutritionStorageInstance";
import { persistNutritionShoppingList } from "./nutritionStorage.js";

export {
  SHOPPING_LIST_KEY,
  getCheckedItems,
  getTotalCount,
  normalizeShoppingList,
  removeCheckedItems,
  toggleShoppingItem,
} from "@sergeant/nutrition-domain";
export type {
  ShoppingCategory,
  ShoppingItem,
  ShoppingList,
  ShoppingListLike,
} from "@sergeant/nutrition-domain";

export function loadShoppingList(
  key: string = SHOPPING_LIST_KEY,
): ShoppingList {
  const parsed = nutritionStorage.readJSON(key, null);
  return normalizeShoppingList(parsed);
}

export function persistShoppingList(
  list: unknown,
  key: string = SHOPPING_LIST_KEY,
): boolean {
  const normalized = normalizeShoppingList(list);
  const ok = nutritionStorage.writeJSON(key, normalized);
  // Mirror to SQLite via the dual-write pipeline. Pre-boot / pre-auth
  // is a no-op inside `persistNutritionShoppingList`.
  persistNutritionShoppingList(normalized);
  return ok;
}
