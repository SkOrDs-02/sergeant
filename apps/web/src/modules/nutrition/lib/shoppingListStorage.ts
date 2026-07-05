/**
 * Last validated: 2026-07-05
 * Status: Active
 * Web I/O-адаптер для списку покупок.
 *
 * Pure-логіка (`normalizeShoppingList`, `toggleShoppingItem`,
 * `removeCheckedItems`, `getCheckedItems`, `getTotalCount`, типи) живе у
 * `@sergeant/nutrition-domain` і спільна з `apps/mobile`. Тут лишаються
 * лише load/persist поверх `createModuleStorage`.
 *
 * Dual-write teardown Phase 1 — `loadShoppingList` тепер cache-first:
 * читає з SQLite warm cache (`getCachedNutritionSqliteState`), мирор
 * того ж патерна, що `loadNutritionLog` у `nutritionStorage.ts`.
 * LS лишається лише як write-mirror-фолбек через
 * `persistNutritionShoppingList`, не як джерело правди для читання.
 */
import {
  SHOPPING_LIST_KEY,
  normalizeShoppingList,
  type ShoppingList,
} from "@sergeant/nutrition-domain";

import { nutritionStorage } from "./nutritionStorageInstance";
import { persistNutritionShoppingList } from "./nutritionStorage.js";
import { getCachedNutritionSqliteState } from "./sqliteReader.js";

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
  _key: string = SHOPPING_LIST_KEY,
): ShoppingList {
  const cache = getCachedNutritionSqliteState();
  if (cache.refreshedAt !== null) {
    return normalizeShoppingList(cache.shoppingList);
  }
  // Pre-boot fallback — cache not warm yet, read the LS mirror so the
  // first paint is not empty on a returning user's cold load.
  return normalizeShoppingList(
    nutritionStorage.readJSON(SHOPPING_LIST_KEY, null),
  );
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
