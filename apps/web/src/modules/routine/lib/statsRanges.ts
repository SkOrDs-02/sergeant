/**
 * Діапазони сторінки статистики Рутини.
 *
 * Один перемикач керує і числами у «Зведенні», і візуалізацією нижче. До
 * цього обидва були зашиті: зведення рахувало рівно 7/30/90 днів, хітмап —
 * рівно 53 тижні, і подивитись «лише цей тиждень» не було як (репорт
 * тестера 2026-08-17).
 *
 * AI-CONTEXT: вікна `days` навмисно збігаються зі старими 7/30/90 —
 * «Тиждень» показує те саме число, що раніше стояло під підписом «7 днів».
 * Це rolling-вікно, що закінчується сьогодні, а НЕ календарний тиждень із
 * понеділка: календарна межа посеред тижня давала б «2/7» і читалась як
 * провал, плюс розійшлася б із `completionRateForRange`, який уже так
 * рахує. «Рік» — єдине нове число (365 днів).
 *
 * Чому не всі чотири зрізи однією візуалізацією: per-habit рядок при 90+
 * клітинках стає нечитабельним на телефоні (клітинка < 3px), а агрегований
 * хітмап на 7 клітинках вироджується в один стовпчик. Тому короткі зрізи —
 * рядки по звичках, довгі — агрегований хітмап.
 */

/** Ширина `Segmented`-чипа = ідентифікатор зрізу. */
export type RoutineStatsRangeId = "week" | "month" | "quarter" | "year";

export interface RoutineStatsRange {
  id: RoutineStatsRangeId;
  /** Підпис чипа. */
  label: string;
  /** Довжина rolling-вікна в днях, включно з сьогодні. Годує «Зведення». */
  days: number;
  /** Чесний опис вікна для підзаголовка — «останні 7 днів». */
  hint: string;
  /**
   * Яка візуалізація малює цей зріз:
   *   - `rows` — рядок клітинок на кожну звичку (`HabitRangeGrid`);
   *   - `heatmap` — агрегований календарний хітмап (`HabitHeatmap`).
   */
  view: "rows" | "heatmap";
  /**
   * Скільки ISO-тижнів історії показує хітмап. Лише для `view: "heatmap"`.
   * Не збігається з `days` день-у-день: сітка вирівняна по понеділках, тож
   * 13 тижнів — це 91 день, а не 90.
   */
  heatmapWeeks?: number;
  /** Скільки тижнів look-ahead малює хітмап після сьогоднішнього. */
  heatmapFutureWeeks?: number;
  /** Як назвати вікно хітмапа в підказці — «рік», «3 місяці». */
  heatmapHistoryLabel?: string;
  /**
   * Підказка над сіткою хітмапа. Задаємо явно, бо вона залежить від того, чи
   * вміщається вікно у ширину екрана: 13 тижнів вміщаються, 53 — ні.
   */
  heatmapCaption?: string;
}

/**
 * «Місяць» — і дефолт, і фолбек: це найчастіше вікно перегляду й той зріз, у
 * якому per-habit рядки читаються без скролу. Тримаємо окремою константою,
 * щоб `routineStatsRange` мав чесний фолбек без non-null assertion.
 */
const MONTH_RANGE: RoutineStatsRange = {
  id: "month",
  label: "Місяць",
  days: 30,
  hint: "останні 30 днів",
  view: "rows",
};

export const ROUTINE_STATS_RANGES: readonly RoutineStatsRange[] = [
  {
    id: "week",
    label: "Тиждень",
    days: 7,
    hint: "останні 7 днів",
    view: "rows",
  },
  MONTH_RANGE,
  {
    id: "quarter",
    label: "Квартал",
    days: 90,
    hint: "останні 90 днів",
    view: "heatmap",
    heatmapWeeks: 13,
    heatmapFutureWeeks: 1,
    heatmapHistoryLabel: "3 місяці",
    heatmapCaption: "Уся історія за 3 місяці на екрані, сьогодні праворуч.",
  },
  {
    id: "year",
    label: "Рік",
    days: 365,
    hint: "останній рік",
    view: "heatmap",
    heatmapWeeks: 53,
    heatmapFutureWeeks: 4,
    heatmapHistoryLabel: "рік",
  },
];

export const ROUTINE_STATS_DEFAULT_RANGE: RoutineStatsRangeId = MONTH_RANGE.id;

export function routineStatsRange(id: RoutineStatsRangeId): RoutineStatsRange {
  return ROUTINE_STATS_RANGES.find((r) => r.id === id) ?? MONTH_RANGE;
}
