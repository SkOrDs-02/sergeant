/**
 * Last validated: 2026-06-15
 * Status: Active
 * Легасі-реекспорт food-categories з `@sergeant/nutrition-domain`.
 * Файл залишено, щоб існуючі імпорти `../lib/foodCategories.js` не
 * довелось переписувати всі одразу.
 *
 * Для нового коду:
 * `import { FOOD_CATEGORIES } from "@sergeant/nutrition-domain";`
 */
export {
  FOOD_CATEGORIES,
  categorizeFood,
  groupItemsByCategory,
} from "@sergeant/nutrition-domain";
export type {
  FoodCategory,
  GroupedCategoryBucket,
} from "@sergeant/nutrition-domain";
