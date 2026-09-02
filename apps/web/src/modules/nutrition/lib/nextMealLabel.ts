/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Підпис «лишилось на …» для hero-стрічки дня (спека
 * `docs/90-work/planning/specs/nutrition-hero-day-strip.md`, рішення 2):
 * перший ще не записаний тип прийому за `MEAL_ORDER` — НЕ за годиною доби.
 * `mealTypeByHour` тут навмисно не використовується: він суперечить факту,
 * коли обід записано о 17:00.
 */
import { MEAL_ORDER, type MealTypeId } from "@sergeant/nutrition-domain";

/** Знахідний відмінок назви прийому для фрази «лишилось на …». */
const MEAL_ACCUSATIVE: Record<MealTypeId, string> = {
  breakfast: "сніданок",
  lunch: "обід",
  dinner: "вечерю",
  snack: "перекус",
};

/** Коли всі чотири типи прийому вже мають калорії за день. */
export const REMAINING_TODAY_LABEL = "лишилось сьогодні";

/**
 * `kcalByType` — та сама структура, що повертає `mealTypeKcalForDay`:
 * тип із `kcal <= 0` вважається незаписаним.
 */
export function firstUnrecordedMealType(
  kcalByType: Readonly<Record<MealTypeId, number>>,
): MealTypeId | null {
  return MEAL_ORDER.find((type) => (kcalByType[type] || 0) <= 0) ?? null;
}

/**
 * Пʼять станів (рішення 2 спеки): порожній день → «лишилось на сніданок»;
 * після сніданку → «лишилось на обід»; після обіду → «лишилось на вечерю»;
 * після вечері → «лишилось на перекус»; усі чотири записані →
 * «лишилось сьогодні».
 */
export function nextMealLabel(
  kcalByType: Readonly<Record<MealTypeId, number>>,
): string {
  const type = firstUnrecordedMealType(kcalByType);
  return type ? `лишилось на ${MEAL_ACCUSATIVE[type]}` : REMAINING_TODAY_LABEL;
}
