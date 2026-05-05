/**
 * Cross-module insights engine.
 * Reads data from localStorage of all 4 modules and computes
 * correlations / patterns across weeks and months.
 *
 * Data sufficiency thresholds (per task spec):
 *   - Each insight requires ≥ 4 weeks of relevant activity OR ≥ 20 relevant events.
 *   - Specific per-insight gates are documented below.
 */

import { STORAGE_KEYS } from "@sergeant/shared";
import { getTxStatAmount } from "../../modules/finyk/utils";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage/storage";
import { loadRoutineState } from "../../modules/routine/lib/routineStorage";

export interface Insight {
  id: string;
  emoji: string;
  title: string;
  stat: string;
  detail: string;
}

interface Workout {
  startedAt: string;
  endedAt?: string;
}

interface Transaction {
  id: string;
  amount: number;
  time: number;
  description?: string;
  mcc?: number;
}

interface NutritionDay {
  meals?: Array<{ macros?: { kcal?: number } }>;
}

type NutritionLog = Record<string, NutritionDay | undefined>;

function safeLS<T>(key: string, fallback: T): T {
  return safeReadLS<T>(key, fallback) ?? fallback;
}

function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseFizrukWorkouts(): Workout[] {
  const raw = safeReadStringLS(STORAGE_KEYS.FIZRUK_WORKOUTS);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as Workout[] | { workouts?: Workout[] } | null;
    if (Array.isArray(p)) return p;
    if (p && Array.isArray(p.workouts)) return p.workouts;
  } catch {
    /* ignore */
  }
  return [];
}

const DOW_UK = [
  "Неділя",
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "П'ятниця",
  "Субота",
];

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
];

/**
 * Insight 1: Best day-of-week for workouts.
 * Requires ≥ 20 completed workouts (satisfies both "4 weeks" and "20+ events").
 */
function workoutDayInsight(): Insight | null {
  const workouts = parseFizrukWorkouts().filter((w) => w.endedAt);
  if (workouts.length < 20) return null;

  const dowCount = Array<number>(7).fill(0);
  for (const w of workouts) {
    dowCount[new Date(w.startedAt).getDay()]!++;
  }

  const maxCount = Math.max(...dowCount);
  if (maxCount < 3) return null;
  const maxIdx = dowCount.indexOf(maxCount);

  return {
    id: "best_workout_day",
    emoji: "📅",
    title: "Найпродуктивніший день для тренувань",
    stat: DOW_UK[maxIdx]!,
    detail: `${maxCount} з ${workouts.length} тренувань`,
  };
}

/**
 * Insight 2: Weekly spending in active weeks (≥3 workouts) vs rest weeks.
 * Requires ≥ 4 weeks with spending data AND ≥ 2 weeks in each group.
 * Excludes hidden transactions and internal transfers (mirrors report logic).
 */
function activeWeeksSpendingInsight(): Insight | null {
  const workouts = parseFizrukWorkouts().filter((w) => w.endedAt);
  const raw = safeLS<Transaction[] | { txs?: Transaction[] }>(
    STORAGE_KEYS.FINYK_TX_CACHE,
    [],
  );
  const txs: Transaction[] = Array.isArray(raw) ? raw : (raw?.txs ?? []);
  const hiddenSet = new Set<string>(
    safeLS<string[]>(STORAGE_KEYS.FINYK_HIDDEN_TXS, []),
  );
  const txCategories = safeLS<Record<string, string>>(
    STORAGE_KEYS.FINYK_TX_CATS,
    {},
  );
  const transferIds = new Set<string>(
    Object.entries(txCategories)
      .filter(([, v]) => v === "internal_transfer")
      .map(([k]) => k),
  );
  const txSplits = safeLS<Record<string, unknown>>(
    STORAGE_KEYS.FINYK_TX_SPLITS,
    {},
  );

  if (workouts.length < 6) return null;

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;

  const weekStats: Array<{ wCount: number; spending: number }> = [];
  for (let i = 0; i < 16; i++) {
    const mon = new Date(now);
    mon.setDate(now.getDate() - mondayOffset - i * 7);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);

    const wCount = workouts.filter((w) => {
      const d = new Date(w.startedAt);
      return d >= mon && d <= sun;
    }).length;

    const spending = txs
      .filter((tx) => {
        if (hiddenSet.has(tx.id) || transferIds.has(tx.id)) return false;
        const ts = tx.time > 1e10 ? tx.time : tx.time * 1000;
        const d = new Date(ts);
        return d >= mon && d <= sun && (tx.amount ?? 0) < 0;
      })
      .reduce((s, tx) => s + getTxStatAmount(tx, txSplits), 0);

    if (spending > 0) weekStats.push({ wCount, spending });
  }

  if (weekStats.length < 4) return null;

  const activeWeeks = weekStats.filter((w) => w.wCount >= 3);
  const restWeeks = weekStats.filter((w) => w.wCount < 3);

  if (activeWeeks.length < 2 || restWeeks.length < 2) return null;

  const avgActive =
    activeWeeks.reduce((s, w) => s + w.spending, 0) / activeWeeks.length;
  const avgRest =
    restWeeks.reduce((s, w) => s + w.spending, 0) / restWeeks.length;

  if (avgRest === 0) return null;

  const diffPct = Math.round(((avgRest - avgActive) / avgRest) * 100);
  if (Math.abs(diffPct) < 5) return null;

  if (diffPct > 0) {
    return {
      id: "active_weeks_spending",
      emoji: "💡",
      title: `У тижні з 3+ тренуваннями ти витрачаєш на ${diffPct}% менше`,
      stat: `−${diffPct}%`,
      detail: `${Math.round(avgActive).toLocaleString("uk-UA")} ₴ vs ${Math.round(avgRest).toLocaleString("uk-UA")} ₴ витрат/тиж.`,
    };
  }

  const morePct = Math.abs(diffPct);
  return {
    id: "active_weeks_spending",
    emoji: "💡",
    title: `У активні тижні ти витрачаєш на ${morePct}% більше`,
    stat: `+${morePct}%`,
    detail: `${Math.round(avgActive).toLocaleString("uk-UA")} ₴ vs ${Math.round(avgRest).toLocaleString("uk-UA")} ₴ витрат/тиж.`,
  };
}

/**
 * Insight 3: Best habit-completion month in history.
 * Requires ≥ 28 total completions (≈ 4 weeks × 1 habit/day minimum)
 * AND ≥ 4 distinct ISO weeks with any completion.
 */
function bestHabitMonthInsight(): Insight | null {
  const state = loadRoutineState();

  const habits = (state.habits || []).filter((h) => !h.archived);
  const completions = state.completions || {};
  if (habits.length === 0) return null;

  const monthDone: Record<string, number> = {};
  const weekKeys = new Set<string>();
  let totalCompletions = 0;

  for (const h of habits) {
    for (const dk of completions[h.id] || []) {
      monthDone[dk.slice(0, 7)] = (monthDone[dk.slice(0, 7)] || 0) + 1;
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
    const daysInMonth = new Date(y!, m!, 0).getDate();
    const total = habits.length * daysInMonth;
    if (total === 0) continue;
    const pct = Math.round((monthDone[mk]! / total) * 100);
    if (pct > bestPct) {
      bestPct = pct;
      bestMk = mk;
    }
  }

  if (!bestMk || bestPct < 10) return null;

  const [y, m] = bestMk.split("-").map(Number);
  const label = `${MONTHS_UK[m! - 1]} ${y}`;

  return {
    id: "best_habit_month",
    emoji: "🔥",
    title: "Найпослідовніший місяць за звичками",
    stat: `${bestPct}%`,
    detail: label,
  };
}

/**
 * Insight 4: Average kcal on workout days vs rest days.
 * Requires ≥ 20 total nutrition-logged days (satisfies "20+ events" spec threshold)
 * AND ≥ 7 days in each group (workout / rest).
 */
function workoutKcalInsight(): Insight | null {
  const workouts = parseFizrukWorkouts().filter((w) => w.endedAt);
  const log = safeLS<NutritionLog>(STORAGE_KEYS.NUTRITION_LOG, {});

  const workoutDays = new Set<string>(
    workouts.map((w) => localDateKey(new Date(w.startedAt))),
  );

  const kcalWorkout: number[] = [];
  const kcalRest: number[] = [];

  for (const [dk, dayData] of Object.entries(log)) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    const kcal = meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
    if (kcal === 0) continue;
    if (workoutDays.has(dk)) {
      kcalWorkout.push(kcal);
    } else {
      kcalRest.push(kcal);
    }
  }

  if (kcalWorkout.length + kcalRest.length < 20) return null;
  if (kcalWorkout.length < 7 || kcalRest.length < 7) return null;

  const avgWorkout = Math.round(
    kcalWorkout.reduce((s, k) => s + k, 0) / kcalWorkout.length,
  );
  const avgRest = Math.round(
    kcalRest.reduce((s, k) => s + k, 0) / kcalRest.length,
  );

  const diff = avgWorkout - avgRest;
  if (Math.abs(diff) < 50) return null;

  const sign = diff > 0 ? "+" : "";
  return {
    id: "workout_kcal",
    emoji: "🥗",
    title:
      diff > 0
        ? `У дні тренувань ти їси на ${diff.toLocaleString("uk-UA")} ккал більше`
        : `У дні тренувань ти їси на ${Math.abs(diff).toLocaleString("uk-UA")} ккал менше`,
    stat: `${sign}${diff.toLocaleString("uk-UA")} ккал`,
    detail: `${avgWorkout.toLocaleString("uk-UA")} vs ${avgRest.toLocaleString("uk-UA")} ккал/день`,
  };
}

/**
 * Insight 5: Weekly habit completion % vs avg weekly kcal (cross-module correlation).
 * Compares high-habit weeks (≥ 70% completion) vs low-habit weeks (< 70%).
 * Requires ≥ 4 weeks with both habit and nutrition data.
 */
function habitWeeksKcalInsight(): Insight | null {
  const state = loadRoutineState();
  const log = safeLS<NutritionLog>(STORAGE_KEYS.NUTRITION_LOG, {});
  const habits = (state.habits || []).filter((h) => !h.archived);
  const completions = state.completions || {};
  if (habits.length === 0) return null;

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const weekStats: Array<{ habitPct: number; avgKcal: number }> = [];

  for (let i = 0; i < 16; i++) {
    const mon = new Date(now);
    mon.setDate(now.getDate() - mondayOffset - i * 7);
    mon.setHours(0, 0, 0, 0);

    const dates: string[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + d);
      dates.push(localDateKey(dt));
    }

    let habitDone = 0;
    const habitTotal = habits.length * 7;
    for (const dk of dates) {
      for (const h of habits) {
        if (
          Array.isArray(completions[h.id]) &&
          completions[h.id]!.includes(dk)
        ) {
          habitDone++;
        }
      }
    }
    const habitPct = habitTotal > 0 ? habitDone / habitTotal : 0;

    const kcalDays = dates
      .map((dk) => {
        const meals = Array.isArray(log[dk]?.meals) ? log[dk]!.meals! : [];
        return meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      })
      .filter((k) => k > 0);

    if (habitDone === 0 || kcalDays.length === 0) continue;

    const avgKcal = kcalDays.reduce((s, k) => s + k, 0) / kcalDays.length;
    weekStats.push({ habitPct, avgKcal });
  }

  if (weekStats.length < 4) return null;

  const highHabitWeeks = weekStats.filter((w) => w.habitPct >= 0.7);
  const lowHabitWeeks = weekStats.filter((w) => w.habitPct < 0.7);

  if (highHabitWeeks.length < 2 || lowHabitWeeks.length < 2) return null;

  const avgKcalHigh = Math.round(
    highHabitWeeks.reduce((s, w) => s + w.avgKcal, 0) / highHabitWeeks.length,
  );
  const avgKcalLow = Math.round(
    lowHabitWeeks.reduce((s, w) => s + w.avgKcal, 0) / lowHabitWeeks.length,
  );

  const diff = avgKcalHigh - avgKcalLow;
  if (Math.abs(diff) < 50) return null;

  const sign = diff > 0 ? "+" : "";
  return {
    id: "habit_weeks_kcal",
    emoji: "📊",
    title:
      diff > 0
        ? `У тижні з 70%+ звичок ти їси на ${Math.abs(diff).toLocaleString("uk-UA")} ккал більше`
        : `У тижні з 70%+ звичок ти їси на ${Math.abs(diff).toLocaleString("uk-UA")} ккал менше`,
    stat: `${sign}${diff.toLocaleString("uk-UA")} ккал`,
    detail: `${avgKcalHigh.toLocaleString("uk-UA")} vs ${avgKcalLow.toLocaleString("uk-UA")} ккал/день`,
  };
}

/**
 * Returns up to 4 cross-module insights computed from localStorage data.
 * Returns an empty array when there is not enough data in all insights.
 */
export function generateInsights(): Insight[] {
  return [
    workoutDayInsight(),
    activeWeeksSpendingInsight(),
    bestHabitMonthInsight(),
    workoutKcalInsight(),
    habitWeeksKcalInsight(),
  ]
    .filter((x): x is Insight => Boolean(x))
    .slice(0, 4);
}
