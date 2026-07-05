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
 * Dual-write teardown Phase 3 — SQLite is the sole source of truth.
 * `loadShoppingList` reads the SQLite warm cache; `persistShoppingList`
 * writes only via the dual-write pipeline (`persistNutritionShoppingList`).
 * The LS mirror (read fallback + write) was removed — no prod users, so an
 * empty first paint before the cache warms is acceptable (R9).
 */
import {
  SHOPPING_LIST_KEY,
  normalizeShoppingList,
  type ShoppingList,
} from "@sergeant/nutrition-domain";

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
  // SQLite-only: before the warm cache lands, first paint is an empty list
  // and the overlay fills in once it warms (R9, no LS fallback).
  return normalizeShoppingList(
    cache.refreshedAt !== null ? cache.shoppingList : null,
  );
}

export function persistShoppingList(
  list: unknown,
  _key: string = SHOPPING_LIST_KEY,
): boolean {
  const normalized = normalizeShoppingList(list);
  // SQLite-only write via the dual-write pipeline. Pre-boot / pre-auth is a
  // no-op inside `persistNutritionShoppingList`.
  return persistNutritionShoppingList(normalized);
}
