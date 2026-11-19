/** @status Active */

/**
 * Відгук на дії в аркуші прийому і після запису (виправлення за зйомкою
 * 2026-11-18). Окремим файлом, бо `uk.nutrition.ts` уже за межею
 * `max-lines: 600` (Hard Rule #18). Споживачі імпортують файл напряму, як
 * `uk.nutritionRecipeLog.ts`: група в `en.ts` не дзеркалиться. `{n}`,
 * `{grams}` — підстановки.
 */
export const nutritionMealFeedbackMessages = {
  /** Підтвердження після «Списати» в тості пропозиції комори. */
  pantryConsumed: "Списав {grams} г із комори",
  /** Форми для `pluralUa`: згорнутий блок «Нещодавні прийоми». */
  recentCount: {
    one: "{n} прийом",
    few: "{n} прийоми",
    many: "{n} прийомів",
  },
} as const;
