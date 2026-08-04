/** @status Active */

/**
 * Копія «частка photoAI-оцінок у денному агрегаті» (аудит nutrition E-5).
 *
 * AI-CONTEXT: винесено в окремий файл одразу, а не додано в `uk.ts`, бо
 * той каталог стоїть за один рядок до `max-lines: 600` (Hard Rule #18) —
 * той самий патерн, що вже застосований до `dataExport`/`privacy`/`pricing`.
 * Спредиться в `messages.nutrition` з `uk.ts`.
 */
export const nutritionPageMessages = {
  /** Бейдж «≈» на денному калорійному кільці — коли >50% ккал дня з photoAI. */
  estimatedBadge: {
    label: "≈",
    // Текстовий еквівалент бейджа для aria-label (a11y — бейдж не може
    // бути єдиним сигналом).
    a11ySuffix: "переважно оцінка з фото, точна цифра невідома",
    caption:
      "Більшість ккал сьогодні — з фото-оцінки AI, не з бази чи етикетки.",
  },
  /** Пом'якшена копія `nutrition-protein-low` при високій частці photoAI. */
  proteinLowEstimated: {
    subtitle: "Схоже, білка малувато — але сьогодні багато цифр з фото-оцінки.",
  },
};
