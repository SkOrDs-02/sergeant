/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Тип прийому для запису одним тапом (чип «Нещодавні», «Як учора» в аркуші
 * «Додати», «Зберегти в журнал» після фото). Обраний людиною тип (сегмент
 * hero) виграє; без нього тип вгадує годинник ПРИСТРОЮ (ADR-0078).
 */
import { mealTypeByHour, type MealTypeId } from "@sergeant/nutrition-domain";

export function quickMealType(
  chosen?: MealTypeId | null,
  now: Date = new Date(),
): MealTypeId {
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: тип прийому їжі належить ОСОБИСТОМУ дню, а він за годинником пристрою
  return chosen ?? mealTypeByHour(now.getHours());
}
