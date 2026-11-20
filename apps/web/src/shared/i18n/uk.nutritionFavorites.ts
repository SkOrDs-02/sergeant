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
  // Блок на вкладці «Пошук» (рішення власника 2026-11-19).
  section: "Улюблені",
  listAria: "Улюблені продукти",
  /** Форми для `pluralUa`: «1 продукт», «2 продукти», «5 продуктів». */
  sectionCount: {
    one: "{n} продукт",
    few: "{n} продукти",
    many: "{n} продуктів",
  },
  moreInSearch: "Решту улюблених знайдеш пошуком: вони там стоять першими.",
} as const;
