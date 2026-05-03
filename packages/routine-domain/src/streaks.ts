/**
 * Routine streak + completion-rate calculations — pure.
 *
 * Extracted verbatim from `apps/web/src/modules/routine/lib/streaks.ts`
 * (Phase 5 / PR 2), with TypeScript signatures added for domain-level
 * consumers. Behaviour is unchanged.
 */

import { dateKeyFromDate, parseDateKey } from "./dateKeys.js";
import { habitScheduledOnDate } from "./schedule.js";
import type { Habit } from "./types.js";

function dateKeyMinusDays(baseKey: string, daysBack: number): string {
  const d = parseDateKey(baseKey);
  d.setDate(d.getDate() - daysBack);
  d.setHours(12, 0, 0, 0);
  return dateKeyFromDate(d);
}

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
  const sorted = [...(completionsForHabit || [])].sort();
  if (sorted.length === 0) return 0;
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

export function completionRateForRange(
  habits: Habit[],
  completions: Record<string, string[]>,
  startKey: string,
  endKey: string,
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

  let scheduled = 0;
  let completed = 0;
  for (const h of habits) {
    if (h.archived) continue;
    const set = new Set(completions[h.id] || []);
    for (const dk of days) {
      if (!habitScheduledOnDate(h, dk)) continue;
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

export function habitCompletionRate(
  habit: Habit,
  completions: string[] | undefined,
  days: number,
): CompletionRateResult {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const dateList: string[] = [];
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  while (d <= today) {
    dateList.push(dateKeyFromDate(d));
    d.setDate(d.getDate() + 1);
  }

  const set = new Set(completions || []);
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
