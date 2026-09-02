import {
  addDays,
  dateKeyFromDate,
  parseDateKey,
  startOfIsoWeek,
} from "./dateKeys.js";
import type { Habit, WeeklyTargetInterval } from "./types.js";

export const DEFAULT_WEEKLY_TARGET = 3;

/**
 * Стеля 7 — не круглe число, а межа моделі: відмітка звички одна на день,
 * тож «8 разів на тиждень» просити нічого не може. Ряд експортується, щоб
 * UI не перевигадував діапазон окремо від `normalizeWeeklyTarget`.
 */
export const WEEKLY_TARGET_CHOICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeWeeklyTarget(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_TARGET;
  return Math.min(7, Math.max(1, Math.floor(n)));
}

export function normalizeWeeklyTargetHistory(
  raw: unknown,
): WeeklyTargetInterval[] {
  if (!Array.isArray(raw)) return [];
  const out: WeeklyTargetInterval[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const row = v as Partial<WeeklyTargetInterval>;
    if (typeof row.from !== "string" || !DATE_KEY_RE.test(row.from)) continue;
    out.push({ from: row.from, target: normalizeWeeklyTarget(row.target) });
  }
  out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  const deduped: WeeklyTargetInterval[] = [];
  for (const row of out) {
    const last = deduped[deduped.length - 1];
    if (last?.from === row.from) {
      deduped[deduped.length - 1] = row;
    } else if (last?.target !== row.target) {
      deduped.push(row);
    }
  }
  return deduped;
}

export function isFlexibleHabit(habit: Pick<Habit, "recurrence">): boolean {
  return (habit.recurrence || "daily") === "flexible";
}

export function weeklyTargetForDate(
  habit: Pick<Habit, "weeklyTargetHistory">,
  dateKey: string,
): number {
  const history = normalizeWeeklyTargetHistory(habit.weeklyTargetHistory);
  let target = DEFAULT_WEEKLY_TARGET;
  for (const row of history) {
    if (row.from > dateKey) break;
    target = row.target;
  }
  return target;
}

export function appendWeeklyTargetInterval(
  history: readonly WeeklyTargetInterval[] | undefined,
  from: string,
  target: number,
): WeeklyTargetInterval[] {
  const normalized = normalizeWeeklyTargetHistory(history);
  const next = { from, target: normalizeWeeklyTarget(target) };
  const withoutSameDate = normalized.filter((row) => row.from !== from);
  const last = withoutSameDate[withoutSameDate.length - 1];
  if (last && last.target === next.target && last.from <= next.from) {
    return withoutSameDate;
  }
  return normalizeWeeklyTargetHistory([...withoutSameDate, next]);
}

export function weekStartKeyForDateKey(dateKey: string): string {
  return dateKeyFromDate(startOfIsoWeek(parseDateKey(dateKey)));
}

export function weekEndKeyForDateKey(dateKey: string): string {
  return dateKeyFromDate(addDays(startOfIsoWeek(parseDateKey(dateKey)), 6));
}

export function dateKeyWithinHabitBounds(
  habit: Pick<Habit, "archived" | "createdAt" | "startDate" | "endDate">,
  dateKey: string,
): boolean {
  if (habit.archived) return false;
  const start =
    habit.startDate ||
    (habit.createdAt ? String(habit.createdAt).slice(0, 10) : dateKey);
  const end = habit.endDate || null;
  if (dateKey < start) return false;
  if (end && dateKey > end) return false;
  return true;
}

/**
 * Скільки разів звичку відмічено в тижні дати `dateKey`, **не рахуючи сам
 * цей день**.
 *
 * AI-CONTEXT: виключення себе — не оптимізація, а те, що робить одну функцію
 * придатною і для «показати сьогодні», і для «показати минулий день».
 * Гейт `weekDoneCount < target` із простим лічильником тижня сховав би день,
 * у який звичку ВИКОНАЛИ, щойно тиждень добрано: закритий тиждень 3/3
 * стер би з календаря всі три відмітки. Виключивши себе, отримуємо 2 < 3 —
 * і день лишається видимим як запис того, що сталось. Для невідміченого дня
 * у вже закритому тижні лічильник дорівнює 3, і день ховається, як і треба.
 */
export function weekDoneCountExcludingDate(
  completionsForHabit: readonly string[] | undefined,
  dateKey: string,
): number {
  if (!Array.isArray(completionsForHabit)) return 0;
  const from = weekStartKeyForDateKey(dateKey);
  const to = weekEndKeyForDateKey(dateKey);
  let n = 0;
  for (const key of completionsForHabit) {
    if (typeof key !== "string" || !DATE_KEY_RE.test(key)) continue;
    if (key === dateKey) continue;
    if (key >= from && key <= to) n += 1;
  }
  return n;
}

export function flexibleHabitAvailableOnDate(
  habit: Habit,
  dateKey: string,
  pausedFrom?: string | undefined,
): boolean {
  if (!dateKeyWithinHabitBounds(habit, dateKey)) return false;
  if (Array.isArray(habit.pauseIntervals)) {
    for (const iv of habit.pauseIntervals) {
      if (dateKey < iv.from) continue;
      if (iv.to == null || dateKey <= iv.to) return false;
    }
  }
  if (!habit.paused) return true;
  if (pausedFrom === undefined) return false;
  return dateKey < pausedFrom;
}
