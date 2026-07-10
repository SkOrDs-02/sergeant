/**
 * Дзеркало `aggregateCurrentSnapshot` з `apps/web/src/core/insights/useCoachInsight.ts`.
 *
 * Migrated (dual-write teardown) from raw MMKV shard reads to SQLite
 * warm-cache reads for all tombstoned keys:
 *  - `finyk_tx_cache` (Mono transactions) → `getCachedFinykMonoMirrorState()`
 *  - `finyk_tx_cats` / `finyk_hidden_txs` → `getCachedFinykSqliteState()`
 *  - `fizruk_workouts_v1` → `getCachedFizrukSqliteState()`
 *  - `nutrition_log_v1` / `nutrition_prefs_v1` → `getCachedNutritionSqliteState()`
 *  - `hub_routine_v1` → `getCachedSqliteRoutineState()` +
 *    `getCachedSqliteCompletions()`
 */
import { getCachedFinykSqliteState } from "@/modules/finyk/lib/sqliteReader";
import { getCachedFinykMonoMirrorState } from "@/modules/finyk/lib/monoMirrorReader";
import { getCachedFizrukSqliteState } from "@/modules/fizruk/lib/sqliteReader";
import { getCachedNutritionSqliteState } from "@/modules/nutrition/lib/sqliteReader";
import {
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
} from "@/modules/routine/lib/sqliteReader";

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CategoryAmount {
  name: string;
  amount: number;
}

interface FinykSnapshot {
  totalSpent: number;
  totalIncome: number;
  txCount: number;
  topCategories: CategoryAmount[];
}

interface FizrukSnapshot {
  workoutsCount: number;
  totalVolume: number;
  recoveryLabel: string;
}

interface NutritionSnapshot {
  avgKcal: number;
  avgProtein: number;
  targetKcal: number;
  daysLogged: number;
}

interface RoutineSnapshot {
  habitCount: number;
  overallRate: number;
}

export interface CoachSnapshot {
  finyk: FinykSnapshot;
  fizruk: FizrukSnapshot | null;
  nutrition: NutritionSnapshot | null;
  routine: RoutineSnapshot | null;
}

export function aggregateCurrentSnapshot(): CoachSnapshot {
  // Mono transactions — read from the SQLite mono-mirror cache
  // (tombstoned `finyk_tx_cache` MMKV key).
  const txList = getCachedFinykMonoMirrorState().transactions;

  // Tx-category overrides and hidden-tx set from the SQLite warm cache.
  const finykCache = getCachedFinykSqliteState();
  const txCategoriesRaw = finykCache.txCategories;
  const txCategories: Record<string, string> = {};
  for (const [k, v] of Object.entries(txCategoriesRaw)) {
    if (typeof v === "string") txCategories[k] = v;
  }
  const hiddenIds = new Set(finykCache.hiddenTransactions);
  const transferIds = new Set(
    Object.entries(txCategories)
      .filter(([, v]) => v === "internal_transfer")
      .map(([k]) => k),
  );

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  let totalSpent = 0;
  let totalIncome = 0;
  let txCount = 0;
  const catAmounts: Record<string, number> = {};

  for (const tx of txList) {
    const ts = tx.time > 1e10 ? tx.time : tx.time * 1000;
    const d = new Date(ts);
    if (d < weekStart) continue;
    if (hiddenIds.has(tx.id)) continue;
    if (transferIds.has(tx.id)) continue;
    const amount = (tx.amount ?? 0) / 100;
    txCount++;
    if (amount < 0) {
      totalSpent += Math.abs(amount);
      const cat = txCategories[tx.id] ?? String(tx.mcc ?? "other");
      catAmounts[cat] = (catAmounts[cat] ?? 0) + Math.abs(amount);
    } else {
      totalIncome += amount;
    }
  }

  const topCategories = Object.entries(catAmounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }));

  const finyk: FinykSnapshot = {
    totalSpent: Math.round(totalSpent),
    totalIncome: Math.round(totalIncome),
    txCount,
    topCategories,
  };

  let fizruk: FizrukSnapshot | null = null;
  try {
    const fizrukCache = getCachedFizrukSqliteState();
    // Only compute fizruk snapshot when the cache has been warmed at least
    // once (refreshedAt set). Cold cache → leave fizruk as null so the
    // CoachInsight panel shows a "no data" state rather than 0 workouts.
    if (fizrukCache.refreshedAt !== null) {
      const allWorkouts = fizrukCache.workouts;
      const weekWorkouts = allWorkouts.filter(
        (w) => w.endedAt !== null && new Date(w.startedAt) >= weekStart,
      );
      let totalVolume = 0;
      for (const w of weekWorkouts) {
        for (const item of w.items) {
          totalVolume += (item.sets ?? []).reduce(
            (s, set) => s + set.weightKg * set.reps,
            0,
          );
        }
      }
      const completed = allWorkouts.filter((w) => w.endedAt !== null);
      const last = [...completed].sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )[0];
      let recoveryLabel = "Немає даних";
      if (last) {
        const hoursAgo =
          (Date.now() - new Date(last.startedAt).getTime()) / 3_600_000;
        if (hoursAgo < 20) recoveryLabel = "Відновлення";
        else if (hoursAgo < 44) recoveryLabel = "Часткове відновлення";
        else recoveryLabel = "Готовий до тренування";
      }
      fizruk = {
        workoutsCount: weekWorkouts.length,
        totalVolume: Math.round(totalVolume),
        recoveryLabel,
      };
    }
  } catch {
    /* non-fatal */
  }

  let nutrition: NutritionSnapshot | null = null;
  try {
    const nutritionCache = getCachedNutritionSqliteState();
    // Only compute when the cache has been warmed at least once.
    if (nutritionCache.refreshedAt !== null) {
      const log = nutritionCache.log;
      const prefs = nutritionCache.prefs;
      let totalKcal = 0;
      let totalProtein = 0;
      let daysLogged = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dk = localDateKey(d);
        const meals = log[dk]?.meals ?? [];
        if (meals.length > 0) {
          daysLogged++;
          for (const m of meals) {
            totalKcal += m.macros.kcal ?? 0;
            totalProtein += m.macros.protein_g ?? 0;
          }
        }
      }
      if (daysLogged > 0) {
        nutrition = {
          avgKcal: Math.round(totalKcal / daysLogged),
          avgProtein: Math.round(totalProtein / daysLogged),
          targetKcal: prefs?.dailyTargetKcal ?? 2000,
          daysLogged,
        };
      }
    }
  } catch {
    /* non-fatal */
  }

  let routine: RoutineSnapshot | null = null;
  try {
    // Read from the SQLite warm cache (tombstoned `hub_routine_v1` MMKV key).
    const sqliteState = getCachedSqliteRoutineState();
    const completionsCache = getCachedSqliteCompletions();
    if (
      sqliteState.refreshedAt !== null ||
      completionsCache.refreshedAt !== null
    ) {
      const habits = sqliteState.habits.filter((h) => !h.archived);
      const completions = completionsCache.completions;
      if (habits.length > 0) {
        let totalDone = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + i);
          const dk = localDateKey(d);
          for (const h of habits) {
            const list = completions[h.id];
            if (Array.isArray(list) && list.includes(dk)) totalDone++;
          }
        }
        const overallRate = Math.round((totalDone / (habits.length * 7)) * 100);
        routine = { habitCount: habits.length, overallRate };
      }
    }
  } catch {
    /* non-fatal */
  }

  return { finyk, fizruk, nutrition, routine };
}
