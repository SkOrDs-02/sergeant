/**
 * Routine streak + completion-rate calculations — pure.
 *
 * Extracted verbatim from `apps/web/src/modules/routine/lib/streaks.ts`
 * (Phase 5 / PR 2), with TypeScript signatures added for domain-level
 * consumers. Behaviour is unchanged.
 */

import { dateKeyFromDate, dateKeyMinusDays, parseDateKey } from "./dateKeys.js";
import { habitCountsTowardMetrics, habitScheduledOnDate } from "./schedule.js";
import type { Habit, HabitSkip } from "./types.js";
import {
  isFlexibleHabit,
  weekEndKeyForDateKey,
  weekStartKeyForDateKey,
  weeklyTargetForDate,
} from "./weeklyTarget.js";
import { weeklyGoalStreakWeeks } from "./weeklyGoalStreak.js";

/**
 * Поточна серія: від сьогодні назад, лише дні де звичка запланована;
 * зупинка на першому без відмітки. Межа ітерацій — за найдавнішою
 * відомою подією звички (startDate / найдавніша відмітка), щоб рідкі
 * рекурентності (monthly / custom) не обривали стрік передчасно.
 */
export function streakForHabit(
  habit: Habit,
  completionsForHabit: string[] | undefined,
  todayKey: string,
): number {
  // `once` не бере участі в стріку (канон §7 п.2, рішення 2026-08-30).
  if (!habitCountsTowardMetrics(habit)) return 0;
  if (isFlexibleHabit(habit)) {
    return weeklyGoalStreakWeeks(habit, completionsForHabit, todayKey);
  }
  const set = new Set(completionsForHabit || []);
  if (set.size === 0) return 0;
  // Нижня межа: найдавніша відома дата (старт звички або перша відмітка).
  let earliest: string | null = null;
  for (const k of set) if (earliest === null || k < earliest) earliest = k;
  const startKey = habit.startDate || earliest || todayKey;
  const minKey = earliest && earliest < startKey ? earliest : startKey;
  // Жорсткий safety-cap на випадок битих дат (20 років), аж ніяк не 500 днів.
  let streak = 0;
  let dayOffset = 0;
  for (let i = 0; i < 20 * 366; i++) {
    const key = dateKeyMinusDays(todayKey, dayOffset);
    if (key < minKey) break;
    if (!habitScheduledOnDate(habit, key)) {
      dayOffset += 1;
      continue;
    }
    if (set.has(key)) {
      streak += 1;
      dayOffset += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function maxStreakAllTime(
  habit: Habit,
  completionsForHabit: string[] | undefined,
): number {
  if (!habitCountsTowardMetrics(habit)) return 0;
  const sorted = [...(completionsForHabit || [])].sort();
  if (sorted.length === 0) return 0;
  if (isFlexibleHabit(habit)) {
    let bestWeeks = 0;
    for (const key of sorted) {
      bestWeeks = Math.max(
        bestWeeks,
        weeklyGoalStreakWeeks(habit, sorted, key),
      );
    }
    return bestWeeks;
  }
  // Всі історичні відмітки враховуються — користувач позначив виконання, незалежно
  // від поточного розкладу. Раніше при зміні розкладу (напр. daily→weekly) історичні стріки
  // безшумно втрачались. Геп все ще визначаємо за поточним розкладом (історичний розклад не
  // зберігається), оскільки для пропущених днів користувач сам вирішує, чи вони повинні збивати стрік.
  let best = 1;
  let cur = 1;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev === null) {
      prev = key;
      continue;
    }
    let gap = false;
    const d = parseDateKey(prev);
    d.setDate(d.getDate() + 1);
    while (dateKeyFromDate(d) < key) {
      const dk = dateKeyFromDate(d);
      if (habitScheduledOnDate(habit, dk)) {
        gap = true;
        break;
      }
      d.setDate(d.getDate() + 1);
    }
    cur = gap ? 1 : cur + 1;
    if (cur > best) best = cur;
    prev = key;
  }
  return best;
}

export function maxActiveStreak(
  habits: Habit[],
  completions: Record<string, string[]>,
  todayKey: string,
): number {
  let m = 0;
  for (const h of habits) {
    if (h.archived) continue;
    const c = completions[h.id] || [];
    m = Math.max(m, streakForHabit(h, c, todayKey));
  }
  return m;
}

export interface CompletionRateResult {
  completed: number;
  scheduled: number;
  rate: number;
}

export interface CompletionRateOptions {
  /**
   * День «сьогодні» (`YYYY-MM-DD`), від якого пауза починає діяти.
   *
   * Передається наскрізь у `habitScheduledOnDate` — див. його доку про те,
   * чому `paused` як недатований булеан інакше вимиває звичку з усієї
   * історії. ADR-0079 §1 називає саме rate серед проявів цієї вади
   * («натиснув „пауза“ — і 60-денний стрік обнулився»), а §2 вимагає, щоб
   * закрите минуле оцінювалось тим, що діяло тоді.
   *
   * Дефолт (не передано) зберігає історичну поведінку: пауза ретроактивна.
   */
  pausedFrom?: string | undefined;
  /**
   * Пропуски з причиною: `habitId → dateKey → HabitSkip`.
   *
   * Канон §5: «не зміг» **не є провалом**, тож такий день виходить зі
   * ЗНАМЕННИКА — не рахується ні як виконаний, ні як пропущений. Без
   * цього тристанова модель була б косметикою: причина зберігалась би,
   * а відсоток усе одно падав би так само, як від мовчазного пропуску.
   *
   * Дефолт (не передано) зберігає історичну поведінку: пропуск = провал.
   */
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
  /**
   * Рахувати і `once`-звички.
   *
   * Дефолт (не передано) — метрична семантика: `once` поза знаменником
   * (канон §7 п.2, рішення 2026-08-30). `true` — семантика ЧЕК-ЛИСТА:
   * лічильник дня («N з M») стоїть поруч зі списком, який разову подію
   * показує, тож ігнорувати її там означало б «2 з 2» при трьох видимих
   * пунктах. Метрики за період цю опцію не передають ніколи.
   */
  includeOnce?: boolean | undefined;
}

export function completionRateForRange(
  habits: Habit[],
  completions: Record<string, string[]>,
  startKey: string,
  endKey: string,
  opts: CompletionRateOptions = {},
): CompletionRateResult {
  const days: string[] = [];
  const d = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  d.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  while (d <= end) {
    days.push(dateKeyFromDate(d));
    d.setDate(d.getDate() + 1);
  }

  const scheduleOpts =
    opts.pausedFrom === undefined ? {} : { pausedFrom: opts.pausedFrom };

  let scheduled = 0;
  let completed = 0;
  for (const h of habits) {
    if (h.archived) continue;
    // `once` виходить зі знаменника rate (канон §7 п.2, рішення 2026-08-30):
    // разова подія лишається в чек-листі дня, але число не рухає. Виняток —
    // `includeOnce` для лічильників чек-листа (див. доку опції).
    if (!opts.includeOnce && !habitCountsTowardMetrics(h)) continue;
    const set = new Set(completions[h.id] || []);
    const habitSkips = opts.skips?.[h.id];
    if (isFlexibleHabit(h)) {
      const flexible = flexibleCompletionForDays(
        h,
        set,
        days,
        scheduleOpts,
        habitSkips,
      );
      scheduled += flexible.scheduled;
      completed += flexible.completed;
      continue;
    }
    for (const dk of days) {
      if (!habitScheduledOnDate(h, dk, scheduleOpts)) continue;
      // «Не зміг з причиною» виходить зі знаменника, а не рахується провалом.
      if (habitSkips?.[dk] && !set.has(dk)) continue;
      scheduled += 1;
      if (set.has(dk)) completed += 1;
    }
  }
  return {
    completed,
    scheduled,
    rate: scheduled > 0 ? completed / scheduled : 0,
  };
}

/**
 * Per-habit completion rate over an explicit inclusive `[startKey, endKey]`
 * day-key window. The range is passed in (Kyiv-anchored by the caller via
 * `getKyivDayKey`) rather than read from the host clock — the previous
 * `new Date()`-based rolling window silently drifted by timezone.
 */
export function habitCompletionRate(
  habit: Habit,
  completions: string[] | undefined,
  startKey: string,
  endKey: string,
): CompletionRateResult {
  const dateList: string[] = [];
  const d = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  d.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  while (d <= end) {
    dateList.push(dateKeyFromDate(d));
    d.setDate(d.getDate() + 1);
  }

  // Для `once` віддаємо порожній результат (`scheduled: 0`) — споживачі
  // (лідери/аутсайдери, per-habit відсотки) фільтрують за `scheduled > 0`.
  if (!habitCountsTowardMetrics(habit)) {
    return { completed: 0, scheduled: 0, rate: 0 };
  }

  const set = new Set(completions || []);
  if (isFlexibleHabit(habit)) {
    const result = flexibleCompletionForDays(habit, set, dateList, {});
    return {
      completed: result.completed,
      scheduled: result.scheduled,
      rate: result.scheduled > 0 ? result.completed / result.scheduled : 0,
    };
  }
  let scheduled = 0;
  let completed = 0;
  for (const dk of dateList) {
    if (!habitScheduledOnDate(habit, dk)) continue;
    scheduled += 1;
    if (set.has(dk)) completed += 1;
  }
  return {
    completed,
    scheduled,
    rate: scheduled > 0 ? completed / scheduled : 0,
  };
}

function flexibleCompletionForDays(
  habit: Habit,
  doneSet: ReadonlySet<string>,
  days: readonly string[],
  scheduleOpts: { pausedFrom?: string | undefined },
  habitSkips?: Record<string, HabitSkip> | undefined,
): { completed: number; scheduled: number } {
  const byWeek = new Map<string, { done: number; days: number }>();
  for (const dk of days) {
    if (
      !habitScheduledOnDate(habit, dk, { ...scheduleOpts, weekDoneCount: 0 })
    ) {
      continue;
    }
    if (habitSkips?.[dk] && !doneSet.has(dk)) continue;
    const weekStart = weekStartKeyForDateKey(dk);
    const row = byWeek.get(weekStart) ?? { done: 0, days: 0 };
    row.days += 1;
    if (doneSet.has(dk)) row.done += 1;
    byWeek.set(weekStart, row);
  }

  let completed = 0;
  let scheduled = 0;
  for (const [weekStart, row] of byWeek) {
    const target = Math.min(
      row.days,
      weeklyTargetForDate(habit, weekEndKeyForDateKey(weekStart)),
    );
    scheduled += target;
    completed += Math.min(row.done, target);
  }
  return { completed, scheduled };
}
