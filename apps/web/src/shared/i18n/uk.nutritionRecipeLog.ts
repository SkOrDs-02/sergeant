/** @status Active */

/**
 * Копія рецепта у формі прийому (OD-27 Х-3 в, спека
 * `docs/work/specs/nutrition-recipes-in-meal-form-and-pantry-deduction.md`).
 * Окремим файлом, а не в `uk.ts`: той уже за межею `max-lines: 600`
 * (Hard Rule #18). Споживачі (`RecipesFromBookRow`, `RecipeLogSheet`)
 * імпортують цей файл напряму, як `uk.manualPremium.ts`: група в `en.ts`
 * не дзеркалиться. `{n}`, `{kcal}`, `{title}` — підстановки.
 */
export const nutritionRecipeLogMessages = {
  section: "Мої рецепти",
  /** Форми для `pluralUa`: «1 рецепт», «2 рецепти», «5 рецептів». */
  sectionCount: {
    one: "{n} рецепт",
    few: "{n} рецепти",
    many: "{n} рецептів",
  },
  perServing: "≈ {kcal} ккал / порція",
  titleFallback: "Рецепт",
  question: "Скільки зʼїв?",
  submit: "Додати в журнал",
  modeAria: "Як додати: {title}",
  modePortions: "Порції",
  modeGrams: "Грами",
  gramsAria: "Скільки грамів",
  gramsInvalid: "Впиши ціле число грамів, наприклад 150.",
  portionsAria: "Скільки порцій",
  portionsInvalid: "Впиши кількість порцій, наприклад 1,5.",
  total: "≈ {kcal} ккал",
  totalUnknown: "Калорійність невідома",
  perServingSuffix: " · {kcal} ккал / порція",
} as const;
