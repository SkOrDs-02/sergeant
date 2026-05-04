/**
 * Дзеркало `aggregateCurrentSnapshot` з `apps/web/src/core/insights/useCoachInsight.ts`
 * (MMKV через `safeReadLS`).
 */
import { safeReadLS } from "@/lib/storage";

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
  const txRaw = safeReadLS<{ txs?: unknown[]; length?: number } | null>(
    "finyk_tx_cache",
    null,
  );
  const txList: unknown[] = (txRaw as { txs?: unknown[] })?.txs
    ? ((txRaw as { txs: unknown[] }).txs ?? [])
    : Array.isArray(txRaw)
      ? (txRaw as unknown[])
      : [];
  const txCategories =
    safeReadLS<Record<string, string>>("finyk_tx_cats", {}) ?? {};
  const hiddenIds = new Set(safeReadLS<string[]>("finyk_hidden_txs", []) ?? []);
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

  if (Array.isArray(txList)) {
    for (const tx of txList as Array<{
      id: string;
      time: number;
      amount: number;
      mcc?: number;
    }>) {
      const ts = tx.time > 1e10 ? tx.time : tx.time * 1000;
      const d = new Date(ts);
      if (d < weekStart) continue;
      if (hiddenIds.has(tx.id)) continue;
      if (transferIds.has(tx.id)) continue;
      const amount = (tx.amount ?? 0) / 100;
      txCount++;
      if (amount < 0) {
        totalSpent += Math.abs(amount);
        const cat = txCategories[tx.id] || String(tx.mcc ?? "other");
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

  const finyk: FinykSnapshot = {
    totalSpent: Math.round(totalSpent),
    totalIncome: Math.round(totalIncome),
    txCount,
    topCategories,
  };

  let fizruk: FizrukSnapshot | null = null;
  try {
    const p = safeReadLS<unknown>("fizruk_workouts_v1", null);
    if (p) {
      const allWorkouts: Array<{
        endedAt?: string;
        startedAt: string;
        exercises?: Array<{
          sets?: Array<{ weight?: number; reps?: number }>;
        }>;
      }> = Array.isArray(p)
        ? p
        : ((p as { workouts?: unknown[] })?.workouts ?? []);
      const weekWorkouts = allWorkouts.filter((w) => {
        if (!w.endedAt) return false;
        return new Date(w.startedAt) >= weekStart;
      });
      let totalVolume = 0;
      for (const w of weekWorkouts) {
        if (Array.isArray(w.exercises)) {
          for (const ex of w.exercises) {
            totalVolume += Array.isArray(ex.sets)
              ? ex.sets.reduce(
                  (s, set) => s + (set.weight ?? 0) * (set.reps ?? 0),
                  0,
                )
              : 0;
          }
        }
      }
      const completed = allWorkouts.filter((w) => w.endedAt);
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
    const log = safeReadLS<
      Record<
        string,
        { meals?: Array<{ macros?: { kcal?: number; protein_g?: number } }> }
      >
    >("nutrition_log_v1", {});
    const prefs = safeReadLS<{ dailyTargetKcal?: number } | null>(
      "nutrition_prefs_v1",
      null,
    );
    let totalKcal = 0;
    let totalProtein = 0;
    let daysLogged = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dk = localDateKey(d);
      const meals = Array.isArray(log?.[dk]?.meals) ? log[dk].meals : [];
      if (meals.length > 0) {
        daysLogged++;
        for (const m of meals) {
          totalKcal += m?.macros?.kcal ?? 0;
          totalProtein += m?.macros?.protein_g ?? 0;
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
  } catch {
    /* non-fatal */
  }

  let routine: RoutineSnapshot | null = null;
  try {
    const state = safeReadLS<{
      habits?: Array<{ id: string; archived?: boolean }>;
      completions?: Record<string, string[]>;
    } | null>("hub_routine_v1", null);
    if (state) {
      const habits = (state.habits || []).filter((h) => !h.archived);
      const completions = state.completions ?? {};
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
