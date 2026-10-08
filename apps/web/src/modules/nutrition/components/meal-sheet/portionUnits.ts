/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Одиниці запису для продукту з власними порціями: «г» або одна з порцій.
 * У запис їде лише `amount_g`, тож усе нижче - спосіб ввести вагу штуками.
 */
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import type { FoodPortion } from "../../lib/foodDb/foodDb";

export const GRAMS_UNIT = "g";

type LastUnits = Record<string, string>;

export function readLastUnit(foodId: string): string | null {
  const all = safeReadLS<LastUnits>(STORAGE_KEYS.NUTRITION_LAST_PORTION_UNIT);
  const id = all && typeof all === "object" ? all[foodId] : undefined;
  return typeof id === "string" ? id : null;
}

export function rememberLastUnit(foodId: string, unitId: string): void {
  const all =
    safeReadLS<LastUnits>(STORAGE_KEYS.NUTRITION_LAST_PORTION_UNIT) ?? {};
  safeWriteLS(STORAGE_KEYS.NUTRITION_LAST_PORTION_UNIT, {
    ...all,
    [foodId]: unitId,
  });
}

/**
 * Одиниця на старті картки: остання обрана для цього продукту, якщо вона
 * ще існує, інакше перша порція. Редагування запису відкривається в
 * грамах: у записі немає даних, якою одиницею його вводили.
 */
export function pickInitialUnit(
  portions: readonly FoodPortion[],
  lastUnitId: string | null,
  editing: boolean,
): string {
  if (editing || portions.length === 0) return GRAMS_UNIT;
  // Збережена порція, якої вже немає, падає на «г», а не на першу: людина
  // свідомо обирала саме її, і вгадувати іншу штуку було б підміною.
  if (lastUnitId) {
    return portions.some((p) => p.id === lastUnitId) ? lastUnitId : GRAMS_UNIT;
  }
  return portions[0]?.id ?? GRAMS_UNIT;
}

/** Еквівалент ваги в штуках порції, до сотих: показ, а не заміна. */
export function gramsToQty(grams: number, portionGrams: number): number {
  if (!(portionGrams > 0) || !Number.isFinite(grams)) return 0;
  return Math.round((grams / portionGrams) * 100) / 100;
}

export function qtyToGrams(qty: number, portionGrams: number): number {
  return Math.round(qty * portionGrams * 100) / 100;
}
