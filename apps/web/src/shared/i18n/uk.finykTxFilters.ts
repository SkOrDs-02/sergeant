/** @status Active */

/**
 * Копія аркуша «Фільтри» в «Операціях» Фініка (Ф-2 (б), спека
 * `docs/work/specs/finyk-operations-filters.md`). Окремим файлом, бо
 * `uk.finyk.ts` на межі `max-lines`; споживачі (аркуш, рядок пошуку, порожній
 * стан) імпортують його напряму, як `uk.manualPremium.ts`.
 */
export const finykTxFiltersMessages = {
  /** Кнопка біля пошуку, що відкриває аркуш. */
  open: "Фільтри",
  /** Та сама кнопка, коли щось діє: `{count}` кількість фільтрів. */
  openActive: "Фільтри · {count}",
  sheetTitle: "Фільтри",
  amountLegend: "Сума, ₴",
  amountFrom: "Від",
  amountTo: "До",
  amountInvalid: "Сума має бути числом.",
  amountOrder: "«Від» має бути не більше за «до».",
  accountLegend: "Рахунок",
  accountAll: "Усі рахунки",
  tagLegend: "Тег",
  tagAll: "Усі теги",
  /** Головна дія аркуша; `{count}` уже з узгодженим словом «операція». */
  apply: "Показати {count}",
  reset: "Скинути",
  /** Частини підпису плашки активних фільтрів над списком. */
  chipAmountRange: "{from}–{to} ₴",
  chipAmountFrom: "від {from} ₴",
  chipAmountTo: "до {to} ₴",
  chipClear: "Скинути",
  chipClearAria: "Скинути фільтри",
  emptyTitle: "Нічого не знайдено",
  emptyDescription:
    "Під ці фільтри тут операцій немає. Зміни фільтри чи місяць або скинь їх.",
  emptyReset: "Скинути фільтри",
  /** Коли разом із фільтрами діє пошук: одна дія знімає обидва. */
  emptyResetAll: "Скинути пошук і фільтри",
} as const;
