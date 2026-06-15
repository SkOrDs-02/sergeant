/**
 * Last validated: 2026-06-15
 * Status: Active
 * Легасі-реекспорт meal-types з `@sergeant/nutrition-domain`. Файл
 * залишено, щоб існуючі імпорти `../lib/mealTypes.js` не довелось
 * переписувати всі одразу.
 *
 * Для нового коду: `import { MEAL_TYPES } from "@sergeant/nutrition-domain";`
 */
export {
  MEAL_ORDER,
  MEAL_TYPES,
  MEAL_META,
  isMealTypeId,
  mealTypeFromLabel,
  labelForMealType,
  mealTypeByHour,
  mealTypeByNow,
} from "@sergeant/nutrition-domain";
export type {
  MealTypeId,
  MealType,
  MealMeta,
} from "@sergeant/nutrition-domain";
