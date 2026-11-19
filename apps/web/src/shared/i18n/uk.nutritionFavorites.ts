/** @status Active */

/**
 * Улюблені продукти й рецепти (OD-27 Х-3 б, спека
 * `docs/work/specs/nutrition-favorites-and-time-of-day-sort.md`). Окремим
 * файлом, а не в `uk.ts`: той уже за межею `max-lines: 600` (Hard Rule #18).
 * Споживач (`FavoriteToggle`) імпортує файл напряму, як
 * `uk.nutritionRecipeLog.ts`. `{name}` — підстановка.
 */
export const nutritionFavoritesMessages = {
  add: "Додати в улюблені: {name}",
  remove: "Прибрати з улюблених: {name}",
} as const;
