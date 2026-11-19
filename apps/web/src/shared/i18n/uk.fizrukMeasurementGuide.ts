/** @status Active */

/**
 * Фізрук: довідкова таблиця замірів (`pages/Measurements.tsx`).
 *
 * AI-CONTEXT: винесено з `uk.fizruk.ts`, бо той стоїть під `max-lines: 600`
 * (Hard Rule #18). Це не частина `messages.fizruk`: масив рядків таблиці
 * імпортують напряму з цього файла.
 */

/**
 * Reference rows for the measurements guide table (`pages/Measurements.tsx`).
 *
 * Kept OUTSIDE `fizrukPageMessages` on purpose: the shared `MessageCatalog`
 * type is a plain-string tree (`string | MessageCatalog`), so a structured
 * array cannot live in the catalogue. Housing the copy here (rather than
 * inline JSX in the page) keeps it translatable and clears the
 * `no-cyrillic-jsx-literal` rule, while the dedicated type lets `DataTable`
 * infer its row shape.
 */
export interface MeasurementGuideRow {
  readonly metric: string;
  readonly place: string;
  readonly technique: string;
}

export const measurementGuideRows: readonly MeasurementGuideRow[] = [
  {
    metric: "Талія",
    place: "Посередині між нижнім ребром і верхом тазової кістки",
    technique: "Горизонтально, після звичайного видиху, не стягувати шкіру",
  },
  {
    metric: "Стегна",
    place: "Навколо найширшої частини сідниць",
    technique: "Горизонтально, ноги разом",
  },
  {
    metric: "Груди",
    place: "Навколо грудної клітки на рівні сосків",
    technique: "Горизонтально, руки розслаблені, без глибокого вдиху",
  },
  {
    metric: "Біцепс",
    place: "Посередині між плечем і ліктем",
    technique: "Рука розслаблена; щоразу міряти ту саму руку",
  },
  {
    metric: "Стегно",
    place: "Навколо найширшої частини верхнього стегна",
    technique: "Стояти рівно, вагу розподілити на обидві ноги",
  },
] as const;
