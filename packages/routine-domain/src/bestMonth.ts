/**
 * «Найпослідовніший місяць» на канонічному знаменнику.
 *
 * AI-CONTEXT: OD-29, Р-3 (а), відповідь власника П-18 (А) 2026-11-18 —
 * один знаменник для всіх місць, де показується відсоток виконання:
 * заплановані дні (`habitScheduledOnDate`), день «не зміг» поза
 * знаменником (канон §5), `once` поза метриками (канон §7 п.2). Рахує
 * `calcRoutinePeriodCompletion`, тож число місяця збігається з тим, що
 * показали б «Зведення», дайджест і Hub-Reports на тих самих днях.
 *
 * Поточний місяць рахується лише до сьогодні включно (дрібний дефолт § 11.8
 * розбору teardown, founder не заперечив): майбутні дні ще не могли бути
 * виконані, і повний місяць у знаменнику занижував би саме той місяць, який
 * людина зараз тримає.
 *
 * Чиста функція: «сьогодні» передає викликач (день пристрою, ADR-0078).
 */

import { enumerateDateKeys } from "./dateKeys.js";
import { calcRoutinePeriodCompletion } from "./periodCompletion.js";
import type { Habit, HabitSkip } from "./types.js";

export interface RoutineMonthCompletion {
  /** `YYYY-MM`. */
  monthKey: string;
  completed: number;
  scheduled: number;
  /** Цілі відсотки, як `calcRoutinePeriodCompletion.pct`. */
  pct: number;
}

export interface BestRoutineMonthOptions {
  /** Сьогодні за годинником пристрою, `YYYY-MM-DD`. */
  todayKey: string;
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
}

function monthEndKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}

/**
 * Відсоток кожного місяця, у якому є хоч одна відмітка, на канонічному
 * знаменнику. Місяці після сьогодні відкидаються.
 */
export function routineMonthCompletions(
  habits: readonly Habit[],
  completions: Readonly<Record<string, string[]>>,
  opts: BestRoutineMonthOptions,
): RoutineMonthCompletion[] {
  const months = new Set<string>();
  for (const list of Object.values(completions ?? {})) {
    for (const dk of list ?? []) {
      if (typeof dk === "string" && dk.length >= 7 && dk <= opts.todayKey) {
        months.add(dk.slice(0, 7));
      }
    }
  }
  const out: RoutineMonthCompletion[] = [];
  for (const monthKey of [...months].sort()) {
    const end = monthEndKey(monthKey);
    const lastKey = end < opts.todayKey ? end : opts.todayKey;
    const days = enumerateDateKeys(`${monthKey}-01`, lastKey);
    const period = calcRoutinePeriodCompletion(habits, completions, days, {
      pausedFrom: opts.todayKey,
      skips: opts.skips,
    });
    out.push({
      monthKey,
      completed: period.completed,
      scheduled: period.scheduled,
      pct: period.pct,
    });
  }
  return out;
}

/**
 * Місяць із найвищим відсотком. Нічия лишається за раннішим місяцем (як у
 * попередній реалізації інсайту: строге `>`). `null`, коли жоден місяць не
 * має запланованих днів.
 */
export function bestRoutineMonth(
  habits: readonly Habit[],
  completions: Readonly<Record<string, string[]>>,
  opts: BestRoutineMonthOptions,
): RoutineMonthCompletion | null {
  let best: RoutineMonthCompletion | null = null;
  for (const m of routineMonthCompletions(habits, completions, opts)) {
    if (m.scheduled === 0) continue;
    if (!best || m.pct > best.pct) best = m;
  }
  return best;
}
