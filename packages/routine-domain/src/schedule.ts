/**
 * Pure habit-schedule predicate.
 *
 * Extracted from `hubCalendarAggregate.ts` — whether a given habit
 * falls on a given `YYYY-MM-DD` date-key, respecting:
 *   - lifetime bounds (`startDate` / `endDate` / `archived`);
 *   - `recurrence` mode (`daily` / `weekdays` / `weekly` / `monthly` /
 *     `once`);
 *   - `weekdays` array for weekly mode (Monday-first, 0–6);
 *   - month-anchor day-of-month for monthly mode, snapped to the last
 *     day of short months.
 */

import { isoWeekdayFromDateKey, parseDateKey } from "./dateKeys.js";
import type { Habit, PauseInterval } from "./types.js";

/** Чи потрапляє день у будь-який заявлений інтервал паузи (межі включні). */
export function dateKeyInPauseInterval(
  intervals: PauseInterval[] | undefined,
  dateKey: string,
): boolean {
  if (!Array.isArray(intervals)) return false;
  for (const iv of intervals) {
    if (!iv || typeof iv.from !== "string") continue;
    if (dateKey < iv.from) continue;
    if (iv.to === null || iv.to === undefined) return true;
    if (dateKey <= iv.to) return true;
  }
  return false;
}

/** Опції предиката розкладу. */
export interface HabitScheduledOptions {
  /**
   * День «сьогодні» (`YYYY-MM-DD`), від якого пауза починає діяти.
   *
   * AI-CONTEXT: заморозка минулого, ADR-0079 §3 — «пауза, поставлена
   * сьогодні, не вимиває звичку з минулорічного heatmap». Проблема в тому,
   * що `paused` — **недатований булеан**: коли саме користувач натиснув
   * паузу, ніде не збережено (міграція 085 знімка розкладу не робить). Тому
   * єдине чесне трактування — «пауза діє від сьогодні вперед», і саме його
   * вмикає цей параметр.
   *
   * Без нього поведінка лишається історичною: пауза відсіює **всі** дати,
   * включно з минулими. Дефолт навмисно не змінено — перемикання рухає
   * число, яке користувач уже бачив, і потребує `metricsVersion`.
   */
  pausedFrom?: string | undefined;
}

/**
 * Чи бере звичка участь в агрегатних метриках — стрік, heatmap, % виконання.
 *
 * AI-CONTEXT: канон `routine.md` §7 п.2 — `once` є «легким винятком, не
 * задачею»: разову подію можна відмітити (розклад її показує, чекін
 * працює), але вона не рухає жодного накопичувального числа. Рішення
 * founder-а 2026-08-30 поширює виняток і на rate: стрік, heatmap і rate
 * ділять один канонічний знаменник (ADR-0079 §3), тож вибіркове
 * виключення знову розвело б ці числа між собою.
 *
 * Предикат навмисно живе ОКРЕМО від `habitScheduledOnDate`: розклад
 * відповідає на «чи показувати сьогодні у списку», метрики — на «чи
 * рахувати в число». Календар, стрічка дня і чек-лист «сьогодні»
 * зобовʼязані бачити `once`; агрегатори — ні.
 */
export function habitCountsTowardMetrics(habit: Habit): boolean {
  return (habit.recurrence || "daily") !== "once";
}

export function habitScheduledOnDate(
  habit: Habit,
  dateKey: string,
  opts: HabitScheduledOptions = {},
): boolean {
  if (habit.archived) return false;
  // Датовані інтервали — канонічна форма паузи (канон §4). Вони самі несуть
  // обидві межі, тож не залежать від `pausedFrom` і однаково чесні для
  // минулого й для заявленої наперед відпустки.
  if (dateKeyInPauseInterval(habit.pauseIntervals, dateKey)) return false;
  // `pausedFrom` присутній → пауза ретроактивною не є: минулі дати
  // лишаються запланованими, майбутні й сьогоднішня — ні.
  if (habit.paused) {
    if (opts.pausedFrom === undefined) return false;
    if (dateKey >= opts.pausedFrom) return false;
  }
  const start =
    habit.startDate ||
    (habit.createdAt ? String(habit.createdAt).slice(0, 10) : dateKey);
  const end = habit.endDate || null;
  if (dateKey < start) return false;
  if (end && dateKey > end) return false;
  const r = habit.recurrence || "daily";
  if (r === "once") return dateKey === start;
  if (r === "daily") return true;
  if (r === "weekdays") {
    const wd = isoWeekdayFromDateKey(dateKey);
    return wd >= 0 && wd <= 4;
  }
  if (r === "weekly") {
    const days =
      Array.isArray(habit.weekdays) && habit.weekdays.length > 0
        ? habit.weekdays
        : [0, 1, 2, 3, 4, 5, 6];
    return days.includes(isoWeekdayFromDateKey(dateKey));
  }
  if (r === "monthly") {
    const anchorDom = parseDateKey(start).getDate();
    const d = parseDateKey(dateKey);
    const y = d.getFullYear();
    const m = d.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const scheduledDay = Math.min(anchorDom, daysInMonth);
    return d.getDate() === scheduledDay;
  }
  return true;
}
