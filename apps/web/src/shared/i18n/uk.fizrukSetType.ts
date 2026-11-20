/** @status Active */

/**
 * Фізрук: явний прапорець «виконано» і тип підходу (спека
 * `docs/work/specs/fizruk-set-done-flag-and-set-type.md`).
 *
 * - `setType` — панель типу під рядком підходу (тап по номеру, дефолт
 *   П-Фз3-6 (А) від 2026-11-19): чотири варіанти, літера замість номера і
 *   повна назва для скрінрідера.
 * - `setDone` — підписи ✓, коли він перемикає збережений прапорець.
 *
 * AI-CONTEXT: окремий файл каталогу, бо `uk.fizruk.ts` стоїть під
 * `max-lines: 600` (Hard Rule #18). Спредиться в `messages.fizruk` через
 * `uk.fizrukSession.ts`. Ключі верхнього рівня не повинні збігатися з
 * ключами `uk.fizruk.ts`, `uk.fizrukSession.ts` і `uk.fizrukMeasure.ts`.
 */
export const fizrukSetTypeMessages = {
  setType: {
    menuHeading: "Тип підходу",
    menuHint:
      "Розминка не йде в обʼєм, рекорди й зараховані підходи, але відновлення її враховує.",
    normal: "Звичайний",
    warmup: "Розминка",
    drop: "Дроп",
    failure: "До відмови",
    letterWarmup: "Р",
    letterDrop: "Д",
    letterFailure: "В",
    /** «Підхід 2, розминка: змінити тип». */
    triggerAria: "{prefix} {n}, {type}: змінити тип",
  },
  setDone: {
    /** ✓ на зробленому рядку знімає позначку (прапорець `done: false`). */
    doneAria: "зроблено, зняти позначку",
    /** Рядок уже має значення (план, «+ Підхід»), але ще не відмічений. */
    markDoneAria: "позначити зробленим {values}",
  },
};
