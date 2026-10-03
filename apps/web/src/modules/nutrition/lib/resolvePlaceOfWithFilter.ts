/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Куди лягає позиція, з урахуванням активного фільтра перегляду місця.
 * Винесено з `useNutritionPantries.ts` (Hard Rule #18, `max-lines: 600`) —
 * логіка чиста, тестовна окремо від решти хука.
 *
 * Порядок пріоритетів (рішення власника 2026-09-11, канон nutrition
 * § Журнал рішень): наявна позиція завжди лишається на своєму фактичному
 * місці (`resolvePlaceForItem` це вже гарантує); лише для НОВОЇ позиції
 * активний `placeFilter` перебиває евристику `placeForFood` — людина
 * дивиться на конкретне місце і додає туди продукт, а не туди, куди
 * вгадала назва. Без фільтра (`null`, «Усі місця») поведінка не
 * змінюється — чиста евристика.
 */
import {
  matchFoodName,
  resolvePlaceForItem,
  type PlacedPantryItem,
} from "@sergeant/nutrition-domain";

export function resolvePlaceOfWithFilter(
  pantryItems: readonly PlacedPantryItem[],
  name: unknown,
  placeFilter: string | null,
): string {
  if (placeFilter) {
    const key = matchFoodName(name);
    const existing = key
      ? pantryItems.find((x) => matchFoodName(x.name) === key)
      : undefined;
    if (!existing) return placeFilter;
  }
  return resolvePlaceForItem(pantryItems, name);
}
