/**
 * Cross-module insights for the mobile Hub-Reports surface.
 *
 * Compact mirror of `apps/web/src/core/lib/insightsEngine.ts`. Reads the
 * same MMKV shards (`safeReadLS` / `safeReadStringLS`) the web engine reads
 * from localStorage and applies the same sufficiency thresholds. The two
 * cheapest, highest-signal insights are ported (best workout day-of-week
 * and best habit-completion month); the remaining web insights depend on
 * the shared finyk stat-amount helper and are left for a follow-up so this
 * surface does not fork that aggregation. Returns up to 4 insights.
 */

import { safeReadLS, safeReadStringLS } from "@/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import { localDateKey, type RoutineState } from "./hubReports.aggregation";

export interface Insight {
  id: string;
  title: string;
  stat: string;
  detail: string;
}

interface Workout {
  startedAt?: string | number;
  endedAt?: string | number | null;
}

const DOW_UK = [
  "Неділя",
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "П'ятниця",
  "Субота",
] as const;

const MONTHS_UK = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
] as const;

function parseWorkouts(): Workout[] {
  const raw = safeReadStringLS(STORAGE_KEYS.FIZRUK_WORKOUTS);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as Workout[] | { workouts?: Workout[] } | null;
    if (Array.isArray(p)) return p;
    if (p && Array.isArray(p.workouts)) return p.workouts;
  } catch {
    /* ignore malformed */
  }
  return [];
}

function workoutDate(w: Workout): Date | null {
  if (typeof w.startedAt === "number") return new Date(w.startedAt);
  if (typeof w.startedAt === "string") return new Date(w.startedAt);
  return null;
}

/**
 * Insight: best day-of-week for workouts. Requires ≥ 20 completed
 * workouts (satisfies both the "4 weeks" and "20+ events" web gates).
 */
function workoutDayInsight(): Insight | null {
  const workouts = parseWorkouts().filter((w) => w.endedAt);
  if (workouts.length < 20) return null;

  const dowCount = Array<number>(7).fill(0);
  for (const w of workouts) {
    const d = workoutDate(w);
    if (!d || Number.isNaN(d.getTime())) continue;
    const idx = d.getDay();
    dowCount[idx] = (dowCount[idx] ?? 0) + 1;
  }

  const maxCount = Math.max(...dowCount);
  if (maxCount < 3) return null;
  const maxIdx = dowCount.indexOf(maxCount);

  return {
    id: "best_workout_day",
    title: "Найпродуктивніший день для тренувань",
    stat: DOW_UK[maxIdx] ?? "",
    detail: `${maxCount} з ${workouts.length} тренувань`,
  };
}

/**
 * Insight: best habit-completion month in history. Requires ≥ 28 total
 * completions AND ≥ 4 distinct ISO weeks with any completion.
 */
function bestHabitMonthInsight(): Insight | null {
  const state = safeReadLS<RoutineState | null>(STORAGE_KEYS.ROUTINE, null);
  if (!state) return null;

  const habits = (state.habits ?? []).filter((h) => !h.archived);
  const completions = state.completions ?? {};
  if (habits.length === 0) return null;

  const monthDone: Record<string, number> = {};
  const weekKeys = new Set<string>();
  let totalCompletions = 0;

  for (const h of habits) {
    for (const dk of completions[h.id] ?? []) {
      const mk = dk.slice(0, 7);
      monthDone[mk] = (monthDone[mk] ?? 0) + 1;
      totalCompletions++;
      const d = new Date(dk);
      const dow = (d.getDay() + 6) % 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - dow);
      weekKeys.add(localDateKey(mon));
    }
  }

  if (totalCompletions < 28 || weekKeys.size < 4) return null;

  const months = Object.keys(monthDone);
  if (months.length < 2) return null;

  let bestMk: string | null = null;
  let bestPct = 0;
  for (const mk of months) {
    const [y, m] = mk.split("-").map(Number);
    if (!y || !m) continue;
    const daysInMonth = new Date(y, m, 0).getDate();
    const total = habits.length * daysInMonth;
    if (total === 0) continue;
    const pct = Math.round(((monthDone[mk] ?? 0) / total) * 100);
    if (pct > bestPct) {
      bestPct = pct;
      bestMk = mk;
    }
  }

  if (!bestMk || bestPct < 10) return null;

  const [y, m] = bestMk.split("-").map(Number);
  if (!y || !m) return null;

  return {
    id: "best_habit_month",
    title: "Найпослідовніший місяць за звичками",
    stat: `${bestPct}%`,
    detail: `${MONTHS_UK[m - 1] ?? ""} ${y}`,
  };
}

export function generateInsights(): Insight[] {
  return [workoutDayInsight(), bestHabitMonthInsight()]
    .filter((x): x is Insight => Boolean(x))
    .slice(0, 4);
}
