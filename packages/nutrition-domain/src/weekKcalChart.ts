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
  /** Перебір понад ціль ЦЬОГО дня з допуском `WEEK_KCAL_OVER_TOLERANCE`. */
  isOver: boolean;
  /** Ціль, чинна на цей день, або `0` коли її не було. */
  goalKcal: number;
  /**
   * Позиція лінії цілі ЦЬОГО дня `[0..1]`, або `null` коли цілі не було.
   * UI малює сегмент над своїм стовпчиком, а не одну лінію на весь графік.
   */
  goalRatio: number | null;
}

export interface WeekKcalChartModel {
  bars: WeekKcalBar[];
  /** Стеля осі в ккал — те, що дорівнює повній висоті плоту. */
  ceiling: number;
  /**
   * Ціль останнього дня тижня, який її мав, або `0`. Це підпис шкали, а не
   * знаменник: судить кожен день своя ціль (`bars[].goalKcal`). Коли ціль
   * серед тижня не мінялась — а це поки завжди, — число те саме, що й було.
   */
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

/**
 * Ціль на КОЖЕН день тижня, вирівняна з `rows` за індексом. `null` означає
 * «на цей день цілі не було» і малюється як день без лінії, а не як нуль.
 */
export type WeekKcalGoals = readonly (number | null | undefined)[];

function toGoal(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeWeekKcalChart(
  rows: readonly MacrosRow[] | null | undefined,
  goalsByDay: WeekKcalGoals | null | undefined,
): WeekKcalChartModel {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeGoals = Array.isArray(goalsByDay) ? goalsByDay : [];

  const kcals = safeRows.map((r) => toKcal(r?.kcal));
  const goals = safeRows.map((_, i) => toGoal(safeGoals[i]));
  const maxKcal = kcals.length > 0 ? Math.max(...kcals) : 0;
  const maxGoal = goals.length > 0 ? Math.max(...goals) : 0;

  // Стелю задає НАЙБІЛЬША ціль тижня, не ціль «на сьогодні»: інакше тиждень,
  // у якому ціль упала з 2400 на 1800, стиснув би перші дні під стелю
  // останнього, і висота стовпчика знову перестала б щось означати.
  //
  // Без цілі стеля — максимум тижня (інакше немає від чого рахувати
  // висоту взагалі), АЛЕ UI зобовʼязаний підписати це число: саме
  // непідписана самонормалізація і робила графік нечитабельним.
  const ceiling =
    maxGoal > 0
      ? Math.max(maxGoal * WEEK_KCAL_CEILING_HEADROOM, maxKcal)
      : Math.max(maxKcal, 1);

  const bars: WeekKcalBar[] = safeRows.map((row, i) => {
    const kcal = kcals[i] ?? 0;
    const dayGoal = goals[i] ?? 0;
    return {
      date: String(row?.date ?? ""),
      kcal,
      ratio: ceiling > 0 ? Math.min(1, kcal / ceiling) : 0,
      isEmpty: kcal <= 0,
      isOver: dayGoal > 0 && kcal > dayGoal * WEEK_KCAL_OVER_TOLERANCE,
      goalKcal: dayGoal,
      goalRatio:
        dayGoal > 0 && ceiling > 0 ? Math.min(1, dayGoal / ceiling) : null,
    };
  });

  // Підпис шкали бере ціль ОСТАННЬОГО дня, який її мав: він і є «поточна»
  // ціль у межах намальованого тижня.
  const lastGoal = [...goals].reverse().find((g) => g > 0) ?? 0;

  const totalKcal = kcals.reduce((sum, k) => sum + k, 0);
  const daysLogged = kcals.filter((k) => k > 0).length;

  return {
    bars,
    ceiling,
    goalKcal: lastGoal,
    totalKcal,
    avgKcal: daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0,
    daysLogged,
  };
}
