/** @status Active */

/**
 * Фізрук: тип виміру вправи (спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`, зріз 4).
 *
 * - `measureSwitcher` – шість типів «за виміром» (рішення founder-а
 *   2026-11-18, Б-1 (А)): короткий підпис у плитці й повний для скрінрідера.
 * - `measureRow` — колонки й поля рядка підходу на час і дистанцію.
 * - `measureSummary` — одиниці підсумку «3 × 30 с» / «3 × 400 м».
 *
 * AI-CONTEXT: винесено з `uk.fizruk.ts`, бо той стоїть під `max-lines: 600`
 * (Hard Rule #18). Спредиться в `messages.fizruk` поруч із
 * `fizrukSessionMessages` (спред у `uk.fizrukSession.ts`). Ключі верхнього рівня не повинні збігатися з
 * ключами `uk.fizruk.ts` і `uk.fizrukSession.ts`.
 */
export const fizrukMeasureMessages = {
  measureSwitcher: {
    weight_reps: "Кг × повт",
    weight_repsAria: "Вага × повтори",
    reps: "Повтори",
    repsAria: "Лише повтори",
    weight_time: "Кг × час",
    weight_timeAria: "Вага × час",
    time: "Час",
    timeAria: "Час: секунди",
    weight_distance: "Кг × дист",
    weight_distanceAria: "Вага × дистанція",
    distance_time: "Дист × час",
    distance_timeAria: "Дистанція × час",
  },
  measureRow: {
    columnSec: "с",
    columnMeters: "м",
    secAriaLabel: "Секунди підходу",
    metersAriaLabel: "Метри підходу",
    fillSecAria: "заповни секунди",
    fillMetersAria: "заповни метри",
    tooManySec: "Максимум {max} с, я записав стільки. Перевір число.",
    tooManyMeters: "Максимум {max} м, я записав стільки. Перевір число.",
  },
  measureSummary: {
    sec: "с",
    meters: "м",
    kg: "кг",
    over: "за",
  },
};
