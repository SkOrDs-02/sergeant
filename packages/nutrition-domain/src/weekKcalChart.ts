/**
 * Модель тижневого ккал-графіка — чиста, DOM-free, спільна для
 * `apps/web` (`WeekKcalCard`) і `apps/mobile` (`WeekKcalChart`).
 *
 * AI-CONTEXT: до цього модуля обидві поверхні рахували висоту стовпчика
 * інлайн однаковим рядком `Math.max(targetKcal || 1, ...rows.kcal)` — і
 * обидві мали ту саму пару дефектів, які знайшов тестер 2026-08-17
 * («не зрозуміла шкала»):
 *
 *  1. **Шкала без якоря.** Коли цілі немає (`targetKcal = 0`), `|| 1`
 *     робив стелею максимум самого тижня. Найвищий стовпчик виходив
 *     на 100% ЗАВЖДИ — і при 800 ккал, і при 3000. Тобто висота не
 *     означала нічого: вона перемальовувалась щоразу, коли мінявся
 *     максимум, хоч самі дні не мінялись. Тут стелю задає `ceiling`, і
 *     вона завжди має видиму підпис-опору (ціль або максимум) на боці UI.
 *  2. **Нуль виглядав як мало.** `Math.max(2, …)` + `minHeight: 3px`
 *     малювали день БЕЗ записів тим самим огризком, що й день на 50 ккал.
 *     Це прямо суперечить канону §5.2 («неповний день — це неповні дані,
 *     а не дефіцит»), тож тут порожній день несе `isEmpty`, а UI малює
 *     для нього плаский трек, а не стовпчик.
 *
 * Межі доби задає викликач (`rows` уже нарізані по `YYYY-MM-DD`) — модуль
 * без власного годинника.
 */

import type { MacrosRow } from "./nutritionTypes.js";

/**
 * Запас над ціллю, який тримає стелю осі, поки ніхто його не пробив.
 * Ціль сидить на 80% висоти плоту, отже лінія цілі НЕ їздить від
 * щоденних коливань — рухає її лише день, що перевищив ціль на 25%+.
 */
export const WEEK_KCAL_CEILING_HEADROOM = 1.25;

/**
 * Допуск, після якого день вважається перебором. Дзеркалить hit-window
 * макро-підписів на героєві (`formatMacroOutcome`, band `goal*1.05`) —
 * 2201 ккал при цілі 2200 не має світитись попередженням.
 */
export const WEEK_KCAL_OVER_TOLERANCE = 1.05;

export interface WeekKcalBar {
  /** День у форматі `YYYY-MM-DD`. */
  date: string;
  /** Ккал за день, округлені. */
  kcal: number;
  /** Частка стелі `[0..1]` — саме її UI перетворює на висоту. */
  ratio: number;
  /** День без записів. UI малює плаский трек, НЕ стовпчик (канон §5.2). */
  isEmpty: boolean;
  /** Перебір понад ціль із допуском `WEEK_KCAL_OVER_TOLERANCE`. */
  isOver: boolean;
}

export interface WeekKcalChartModel {
  bars: WeekKcalBar[];
  /** Стеля осі в ккал — те, що дорівнює повній висоті плоту. */
  ceiling: number;
  /** Позиція лінії цілі `[0..1]`, або `null` коли цілі немає. */
  goalRatio: number | null;
  /** Ціль у ккал, або `0` коли не задана. */
  goalKcal: number;
  /** Сума ккал за тиждень. */
  totalKcal: number;
  /** Середнє за день. Знаменник — дні з записами (канон §5.2). */
  avgKcal: number;
  /** Скільки днів тижня мають хоч якісь ккал. */
  daysLogged: number;
}

function toKcal(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeWeekKcalChart(
  rows: readonly MacrosRow[] | null | undefined,
  targetKcal: unknown,
): WeekKcalChartModel {
  const safeRows = Array.isArray(rows) ? rows : [];
  const goalRaw = Number(targetKcal);
  const goalKcal = Number.isFinite(goalRaw) && goalRaw > 0 ? goalRaw : 0;

  const kcals = safeRows.map((r) => toKcal(r?.kcal));
  const maxKcal = kcals.length > 0 ? Math.max(...kcals) : 0;

  // Без цілі стеля — максимум тижня (інакше немає від чого рахувати
  // висоту взагалі), АЛЕ UI зобовʼязаний підписати це число: саме
  // непідписана самонормалізація і робила графік нечитабельним.
  const ceiling =
    goalKcal > 0
      ? Math.max(goalKcal * WEEK_KCAL_CEILING_HEADROOM, maxKcal)
      : Math.max(maxKcal, 1);

  const overThreshold = goalKcal * WEEK_KCAL_OVER_TOLERANCE;

  const bars: WeekKcalBar[] = safeRows.map((row, i) => {
    const kcal = kcals[i] ?? 0;
    return {
      date: String(row?.date ?? ""),
      kcal,
      ratio: ceiling > 0 ? Math.min(1, kcal / ceiling) : 0,
      isEmpty: kcal <= 0,
      isOver: goalKcal > 0 && kcal > overThreshold,
    };
  });

  const totalKcal = kcals.reduce((sum, k) => sum + k, 0);
  const daysLogged = kcals.filter((k) => k > 0).length;

  return {
    bars,
    ceiling,
    goalRatio: goalKcal > 0 ? Math.min(1, goalKcal / ceiling) : null,
    goalKcal,
    totalKcal,
    avgKcal: daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0,
    daysLogged,
  };
}
