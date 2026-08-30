/**
 * Per-habit range rows — «одна звичка = один рядок клітинок».
 *
 * Доповнює `domain/heatmap/grid.ts`, а не заміняє його. Хітмап агрегує ВСІ
 * звички в одну клітинку на день (частка виконаних із запланованих) — це
 * читабельно на 53 тижнях, але не відповідає на питання «яка саме звичка
 * провалилась». Ці рядки відповідають, але лише на коротких діапазонах:
 * 7–30 клітинок на рядок вміщаються в ширину екрана, 365 — ні.
 *
 * Як і решта `routine-domain`, модуль не торкається DOM, `Intl`, сторів чи
 * годинника — «сьогодні» приходить параметром, тож агрегація тестується
 * детерміновано.
 */

import { addDays, dateKeyFromDate, isoWeekdayFromDateKey } from "./dateKeys.js";
import { habitCountsTowardMetrics, habitScheduledOnDate } from "./schedule.js";
import type { Habit, HabitSkip } from "./types.js";

/**
 * Стан однієї клітинки рядка.
 *
 *   - `done` — день був запланований і відмічений;
 *   - `skipped` — день був запланований, не відмічений, але має позначку
 *     «не зміг» із причиною (канон §5 — це не провал);
 *   - `missed` — день був запланований і мовчки пропущений;
 *   - `unscheduled` — цього дня звичка не була в розкладі (день відпочинку,
 *     пауза, ще не створена / вже завершена звичка).
 */
export type HabitRangeCellState = "done" | "skipped" | "missed" | "unscheduled";

export interface HabitRangeCell {
  /** Локальний `YYYY-MM-DD`; водночас стабільний React-key у межах рядка. */
  dateKey: string;
  state: HabitRangeCellState;
  /** ISO-день тижня, Пн=0 … Нд=6 — для підписів осі на коротких зрізах. */
  weekday: number;
  /** `true` для останньої клітинки — дня, яким закінчується діапазон. */
  isToday: boolean;
}

export interface HabitRangeRow {
  habitId: string;
  /** Клітинки від найдавнішої до `today` включно; довжина === `days`. */
  cells: HabitRangeCell[];
  /** Скільку запланованих днів відмічено. */
  completed: number;
  /**
   * Скільки днів звичка була в розкладі.
   *
   * AI-CONTEXT: пропуски з причиною тут НЕ виходять зі знаменника, хоча
   * `completionRateForRange` уміє їх виключати опцією `skips`. Це навмисно:
   * сторінка статистики зараз рахує зведення без `skips`, і якби рядок
   * рахував інакше, сума рядків не сходилась би зі числом у «Зведенні».
   * Клітинка все одно показує `skipped` окремим станом — користувач бачить,
   * що позначку враховано як інформацію, просто не як виняток зі знаменника.
   * Перемикання обох на `skips` рухає число, яке користувач уже бачив, тож
   * їде окремою поставкою з `metricsVersion` (як `denominator: "scheduled"`
   * у хітмапі — ADR-0079 §3).
   */
  scheduled: number;
  /** Скільки запланованих днів позначено «не зміг». */
  skipped: number;
  /** `completed / scheduled`, або 0 коли `scheduled === 0`. */
  rate: number;
}

export interface BuildHabitRangeRowsOptions {
  /** Пропуски з причиною: `habitId → dateKey → HabitSkip`. */
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
  /**
   * Заморозити минуле щодо недатованого `paused` — ADR-0079 §3. Той самий
   * прапорець, що й у `buildHeatmapGrid`; вмикати варто разом із ним, інакше
   * пауза, поставлена сьогодні, вимиває звичку з усього зрізу.
   */
  freezePausedPast?: boolean | undefined;
}

/**
 * Побудувати по одному рядку на кожну незархівовану звичку, що була в
 * розкладі хоч раз у вікні `[today - (days - 1) … today]`.
 *
 * Звички без жодного запланованого дня у вікні (місячна звичка в тижневому
 * зрізі, звичка на паузі, ще не створена на той момент) відкидаються — рядок
 * із самих `unscheduled`-клітинок не несе інформації, а лише шум.
 *
 * Порядок рядків збігається з порядком у `habits` — це порядок, у якому
 * користувач бачить свій список; рейтинг за відсотком уже дає
 * `HabitLeadersBlock`.
 */
export function buildHabitRangeRows(
  habits: readonly Habit[] | null | undefined,
  completions: Record<string, readonly string[]> | null | undefined,
  today: Date,
  days: number,
  opts: BuildHabitRangeRowsOptions = {},
): HabitRangeRow[] {
  const windowDays = Math.max(1, Math.floor(days));
  if (!habits || habits.length === 0) return [];

  const todayAtNoon = new Date(today);
  todayAtNoon.setHours(12, 0, 0, 0);
  const todayKey = dateKeyFromDate(todayAtNoon);
  const scheduleOpts = opts.freezePausedPast ? { pausedFrom: todayKey } : {};

  // Ключі вікна від найдавнішого до `today` включно. Рахуємо один раз на всі
  // звички: `addDays` знімає години на полудень, тож переходи DST не зсувають
  // день.
  const dateKeys: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    dateKeys.push(dateKeyFromDate(addDays(todayAtNoon, -i)));
  }

  const rows: HabitRangeRow[] = [];
  for (const habit of habits) {
    if (habit.archived) continue;
    // `once` не отримує рядка: його `rate` — метрика, якої канон §7 п.2
    // для разових подій не визнає (рішення 2026-08-30).
    if (!habitCountsTowardMetrics(habit)) continue;

    const done = new Set(completions?.[habit.id] ?? []);
    const habitSkips = opts.skips?.[habit.id];

    const cells: HabitRangeCell[] = [];
    let completed = 0;
    let scheduled = 0;
    let skipped = 0;

    for (const dateKey of dateKeys) {
      let state: HabitRangeCellState = "unscheduled";
      if (habitScheduledOnDate(habit, dateKey, scheduleOpts)) {
        scheduled += 1;
        if (done.has(dateKey)) {
          state = "done";
          completed += 1;
        } else if (habitSkips?.[dateKey]) {
          state = "skipped";
          skipped += 1;
        } else {
          state = "missed";
        }
      }
      cells.push({
        dateKey,
        state,
        weekday: isoWeekdayFromDateKey(dateKey),
        isToday: dateKey === todayKey,
      });
    }

    if (scheduled === 0) continue;

    rows.push({
      habitId: habit.id,
      cells,
      completed,
      scheduled,
      skipped,
      rate: completed / scheduled,
    });
  }

  return rows;
}
