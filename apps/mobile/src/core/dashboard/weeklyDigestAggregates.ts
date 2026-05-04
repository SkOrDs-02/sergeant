/**
 * Агрегати як у `apps/web/src/core/insights/useWeeklyDigest.ts` — ті ж ключі MMKV.
 */
import {
  MCC_CATEGORIES,
  INCOME_CATEGORIES,
} from "@sergeant/finyk-domain/constants";
import type { WeeklyDigestPayload } from "@sergeant/api-client";

import { safeReadLS } from "@/lib/storage";

const ALL_CATS = [...MCC_CATEGORIES, ...INCOME_CATEGORIES];

export function getWeekRange(d = new Date()): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `${fmt(monday)} — ${fmt(sunday)}`;
}

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Category {
  id?: string;
  label?: string;
  name?: string;
  mccs?: number[];
}

function resolveCatLabel(
  catIdOrMcc: string | number,
  customCategories: Category[] = [],
): string {
  if (!catIdOrMcc || catIdOrMcc === "other") return "Інше";
  const byId = [...ALL_CATS, ...customCategories].find(
    (c) => c.id === catIdOrMcc,
  );
  if (byId)
    return (
      (byId as { label?: string; name?: string }).label ??
      (byId as { name?: string }).name ??
      String(catIdOrMcc)
    );
  const mcc = Number(catIdOrMcc);
  if (!Number.isNaN(mcc) && mcc > 0) {
    const byMcc = MCC_CATEGORIES.find(
      (c) => Array.isArray(c.mccs) && c.mccs.includes(mcc),
    );
    if (byMcc) return byMcc.label;
    return `MCC ${mcc}`;
  }
  return String(catIdOrMcc);
}

export interface FinykAggregate {
  totalSpent: number;
  totalIncome: number;
  txCount: number;
  topCategories: { name: string; amount: number }[];
  monthlyBudget: number | null;
}

export function aggregateFinyk(weekKey: string): FinykAggregate {
  const txRaw = safeReadLS<{ txs?: unknown[] } | null>("finyk_tx_cache", null);
  const txList: unknown[] = txRaw?.txs ?? (Array.isArray(txRaw) ? txRaw : []);
  const txCategories =
    safeReadLS<Record<string, string>>("finyk_tx_cats", {}) ?? {};
  const hiddenIds = new Set(safeReadLS<string[]>("finyk_hidden_txs", []) ?? []);
  const customCategories =
    safeReadLS<Category[]>("finyk_custom_cats_v1", []) ?? [];
  const transferIds = new Set(
    Object.entries(txCategories)
      .filter(([, v]) => v === "internal_transfer")
      .map(([k]) => k),
  );

  const monday = new Date(`${weekKey}T00:00:00`);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  let totalSpent = 0;
  let totalIncome = 0;
  let txCount = 0;
  const catAmounts: Record<string, number> = {};

  if (Array.isArray(txList)) {
    for (const tx of txList as Array<{
      id: string;
      time: number;
      amount: number;
      mcc?: number;
    }>) {
      const ts = tx.time > 1e10 ? tx.time : tx.time * 1000;
      const d = new Date(ts);
      if (d < monday || d >= sunday) continue;
      if (hiddenIds.has(tx.id)) continue;
      if (transferIds.has(tx.id)) continue;
      const amount = (tx.amount ?? 0) / 100;
      txCount++;
      if (amount < 0) {
        totalSpent += Math.abs(amount);
        const rawCat = txCategories[tx.id] || tx.mcc || "other";
        const cat = resolveCatLabel(rawCat, customCategories);
        catAmounts[cat] = (catAmounts[cat] ?? 0) + Math.abs(amount);
      } else {
        totalIncome += amount;
      }
    }
  }

  const topCategories = Object.entries(catAmounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }));

  const finykStorage = safeReadLS<{
    monthlyPlan?: { expense?: number };
  } | null>("finyk_storage_v2", null);
  const monthlyBudget = finykStorage?.monthlyPlan?.expense ?? null;

  return {
    totalSpent: Math.round(totalSpent),
    totalIncome: Math.round(totalIncome),
    txCount,
    topCategories,
    monthlyBudget,
  };
}

export interface FizrukAggregate {
  workoutsCount: number;
  totalVolume: number;
  recoveryLabel: string;
  topExercises: { name: string; totalVolume: number }[];
}

export function aggregateFizruk(weekKey: string): FizrukAggregate | null {
  const parsed = safeReadLS<unknown>("fizruk_workouts_v1", null);
  if (!parsed) return null;
  const workouts: Array<{
    endedAt?: string;
    startedAt: string;
    exercises?: Array<{
      name?: string;
      sets?: Array<{ weight?: number; reps?: number }>;
    }>;
  }> = Array.isArray(parsed)
    ? parsed
    : ((parsed as { workouts?: unknown[] })?.workouts ?? []);
  if (!Array.isArray(workouts) || workouts.length === 0) return null;

  const monday = new Date(`${weekKey}T00:00:00`);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  const weekWorkouts = workouts.filter((w) => {
    if (!w.endedAt) return false;
    const d = new Date(w.startedAt);
    return d >= monday && d < sunday;
  });

  let totalVolume = 0;
  const exerciseVolumes: Record<string, number> = {};

  for (const w of weekWorkouts) {
    if (Array.isArray(w.exercises)) {
      for (const ex of w.exercises) {
        const vol = Array.isArray(ex.sets)
          ? ex.sets.reduce(
              (s, set) => s + (set.weight ?? 0) * (set.reps ?? 0),
              0,
            )
          : 0;
        totalVolume += vol;
        if (ex.name) {
          exerciseVolumes[ex.name] = (exerciseVolumes[ex.name] ?? 0) + vol;
        }
      }
    }
  }

  const topExercises = Object.entries(exerciseVolumes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name, vol]) => ({ name, totalVolume: Math.round(vol) }));

  const allCompleted = workouts.filter((w) => w.endedAt);
  const sorted = [...allCompleted].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const last = sorted[0];
  let recoveryLabel = "Немає даних";
  if (last) {
    const hoursAgo =
      (Date.now() - new Date(last.startedAt).getTime()) / 3_600_000;
    if (hoursAgo < 20) recoveryLabel = "Відновлення";
    else if (hoursAgo < 44) recoveryLabel = "Часткове відновлення";
    else recoveryLabel = "Готовий до тренування";
  }

  return {
    workoutsCount: weekWorkouts.length,
    totalVolume: Math.round(totalVolume),
    recoveryLabel,
    topExercises,
  };
}

export interface NutritionAggregate {
  avgKcal: number;
  avgProtein: number;
  avgFat: number;
  avgCarbs: number;
  targetKcal: number;
  daysLogged: number;
}

export function aggregateNutrition(weekKey: string): NutritionAggregate | null {
  const log = safeReadLS<
    Record<
      string,
      {
        meals?: Array<{
          macros?: {
            kcal?: number;
            protein_g?: number;
            fat_g?: number;
            carbs_g?: number;
          };
        }>;
      }
    >
  >("nutrition_log_v1", {});
  const prefs = safeReadLS<{ dailyTargetKcal?: number } | null>(
    "nutrition_prefs_v1",
    null,
  );
  const targetKcal = prefs?.dailyTargetKcal ?? 2000;

  const monday = new Date(`${weekKey}T00:00:00`);
  let totalKcal = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;
  let daysLogged = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dk = localDateKey(d);
    const dayData = log?.[dk];
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    if (meals.length > 0) {
      daysLogged++;
      for (const m of meals) {
        totalKcal += m?.macros?.kcal ?? 0;
        totalProtein += m?.macros?.protein_g ?? 0;
        totalFat += m?.macros?.fat_g ?? 0;
        totalCarbs += m?.macros?.carbs_g ?? 0;
      }
    }
  }

  if (daysLogged === 0) return null;

  return {
    avgKcal: Math.round(totalKcal / daysLogged),
    avgProtein: Math.round(totalProtein / daysLogged),
    avgFat: Math.round(totalFat / daysLogged),
    avgCarbs: Math.round(totalCarbs / daysLogged),
    targetKcal,
    daysLogged,
  };
}

export interface HabitStat {
  name: string;
  done: number;
  total: number;
  completionRate: number;
}

export interface RoutineAggregate {
  habitCount: number;
  overallRate: number;
  habits: HabitStat[];
}

export function aggregateRoutine(weekKey: string): RoutineAggregate | null {
  const state = safeReadLS<{
    habits?: Array<{
      id: string;
      name?: string;
      title?: string;
      archived?: boolean;
    }>;
    completions?: Record<string, string[]>;
  } | null>("hub_routine_v1", null);
  if (!state) return null;

  const habits = Array.isArray(state.habits)
    ? state.habits.filter((h) => !h.archived)
    : [];
  if (!habits.length) return null;

  const completions = state.completions ?? {};
  const monday = new Date(`${weekKey}T00:00:00`);

  const habitStats: HabitStat[] = habits.map((h) => {
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dk = localDateKey(d);
      const list = completions[h.id];
      if (Array.isArray(list) && list.includes(dk)) {
        done++;
      }
    }
    return {
      name: h.name || h.title || "Звичка",
      done,
      total: 7,
      completionRate: Math.round((done / 7) * 100),
    };
  });

  const totalDone = habitStats.reduce((s, h) => s + h.done, 0);
  const totalPossible = habits.length * 7;
  const overallRate =
    totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

  return { habitCount: habits.length, overallRate, habits: habitStats };
}

export function buildWeeklyDigestPayload(weekKey: string): WeeklyDigestPayload {
  const currentWeekRange = getWeekRange(new Date(weekKey + "T12:00:00"));
  return {
    weekRange: currentWeekRange,
    finyk: aggregateFinyk(weekKey),
    fizruk: aggregateFizruk(weekKey),
    nutrition: aggregateNutrition(weekKey),
    routine: aggregateRoutine(weekKey),
  };
}
