import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { coachApi, isApiError } from "@shared/api";
import { coachKeys } from "@shared/lib/api/queryKeys";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain";

const CACHE_KEY = "hub_coach_insight_cache_v1";

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

interface DateContext {
  todayKey: string;
  weekDayUk: string;
  dayOfWeekIso: number;
  daysIntoWeek: number;
  weekRange: string;
}

interface CoachSnapshot {
  dateContext: DateContext;
  finyk: FinykSnapshot;
  fizruk: FizrukSnapshot | null;
  nutrition: NutritionSnapshot | null;
  routine: RoutineSnapshot | null;
}

const WEEKDAY_UK_FROM_ISO: Record<number, string> = {
  1: "понеділок",
  2: "вівторок",
  3: "середа",
  4: "четвер",
  5: "п'ятниця",
  6: "субота",
  7: "неділя",
};

// AI-NOTE: Кийвський "сьогодні" + ISO weekday — з тих самих частин Date,
// що й існуючий `localDateKey` (без `toISOString().slice(0,10)`, бо UTC-зсув
// ламає Routine-стрики ввечері — див. domain invariants у `AGENTS.md`).
function buildDateContext(
  now: Date,
  weekStart: Date,
  mondayOffset: number,
): DateContext {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // mondayOffset: 0 у понеділок, 6 у неділю → ISO 1..7.
  const dayOfWeekIso = mondayOffset + 1;
  const formatDayMonth = (d: Date): string =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;

  return {
    todayKey: localDateKey(now),
    weekDayUk: WEEKDAY_UK_FROM_ISO[dayOfWeekIso] ?? "",
    dayOfWeekIso,
    daysIntoWeek: dayOfWeekIso,
    weekRange: `${formatDayMonth(weekStart)}–${formatDayMonth(weekEnd)}`,
  };
}

function aggregateCurrentSnapshot(): CoachSnapshot {
  const { txs, excludedTxIds, txSplits, txCategories } =
    readFinykStatsContext();

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  // AI-NOTE: Делегуємо у `calcFinykPeriodAggregate` (`@sergeant/finyk-domain`)
  // замість власного парсингу `finyk_tx_cache`/`finyk_hidden_txs`/
  // `finyk_tx_cats`. Excluded-set єдиний з Overview/Reports
  // (`getFinykExcludedTxIdsFromStorage`). Категорії бакетимо за raw
  // `txCategories[id] || mcc` — coach API сам розкриває назви.
  const aggregate = calcFinykPeriodAggregate(txs, {
    start: weekStart.getTime(),
    excludedTxIds,
    txSplits,
    categoryKey: (tx) => txCategories[tx.id] || String(tx.mcc ?? "other"),
  });

  const topCategories = Object.entries(aggregate.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  const finyk: FinykSnapshot = {
    totalSpent: aggregate.totalSpent,
    totalIncome: aggregate.totalIncome,
    txCount: aggregate.txCount,
    topCategories,
  };

  let fizruk: FizrukSnapshot | null = null;
  try {
    const p = safeReadLS<unknown>("fizruk_workouts_v1", null);
    if (p) {
      const allWorkouts: Array<{
        endedAt?: string;
        startedAt: string;
        exercises?: Array<{ sets?: Array<{ weight?: number; reps?: number }> }>;
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
    const log =
      safeReadLS<
        Record<
          string,
          { meals?: Array<{ macros?: { kcal?: number; protein_g?: number } }> }
        >
      >("nutrition_log_v1", {}) ?? {};
    const prefs = safeReadLS<{ dailyTargetKcal?: number } | null>(
      "nutrition_prefs_v1",
      null,
    );
    let totalKcal = 0,
      totalProtein = 0,
      daysLogged = 0;
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
            if (
              Array.isArray(completions[h.id]) &&
              completions[h.id]!.includes(dk)
            )
              totalDone++;
          }
        }
        const overallRate = Math.round((totalDone / (habits.length * 7)) * 100);
        routine = { habitCount: habits.length, overallRate };
      }
    }
  } catch {
    /* non-fatal */
  }

  const dateContext = buildDateContext(now, weekStart, mondayOffset);

  return { dateContext, finyk, fizruk, nutrition, routine };
}

async function fetchCoachInsight(): Promise<string | null> {
  let memory: string | null = null;
  try {
    const memJson = await coachApi.getMemory();
    memory = (memJson as { memory?: string }).memory ?? null;
  } catch {
    // Пам'ять не обов'язкова — інсайт будуємо й без неї.
  }

  const snapshot = aggregateCurrentSnapshot();

  const insightJson = await coachApi.postInsight({ snapshot, memory });
  return (insightJson as { insight?: string }).insight ?? null;
}

const coachInsightQueryKey = (todayKey = localDateKey()) =>
  coachKeys.insight(todayKey);

function loadInitialInsight(todayKey: string): string | undefined {
  const cached = safeReadLS<{ date?: string; text?: string } | null>(
    CACHE_KEY,
    null,
  );
  if (cached?.date === todayKey && typeof cached?.text === "string") {
    return cached.text;
  }
  return undefined;
}

interface UseCoachInsightResult {
  insight: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<unknown>;
}

export function useCoachInsight(): UseCoachInsightResult {
  const queryClient = useQueryClient();
  const todayKey = localDateKey();
  const queryKey = coachInsightQueryKey(todayKey);

  const query = useQuery({
    queryKey,
    queryFn: fetchCoachInsight,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    initialData: () => loadInitialInsight(todayKey),
    initialDataUpdatedAt: () => {
      const cached = safeReadLS<{ date?: string } | null>(CACHE_KEY, null);
      if (cached?.date !== todayKey) return undefined;
      return Date.now();
    },
  });

  if (
    typeof query.data === "string" &&
    query.data.length > 0 &&
    !query.isFetching
  ) {
    const cached = safeReadLS<{ date?: string; text?: string } | null>(
      CACHE_KEY,
      null,
    );
    if (cached?.date !== todayKey || cached?.text !== query.data) {
      safeWriteLS(CACHE_KEY, { date: todayKey, text: query.data });
    }
  }

  const { refetch } = query;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: coachKeys.all });
    return refetch();
  }, [queryClient, refetch]);

  return {
    insight: query.data ?? null,
    loading: query.isPending || query.isFetching,
    error: query.error
      ? isApiError(query.error) && query.error.kind === "http"
        ? query.error.serverMessage || "Помилка генерації інсайту"
        : (query.error as Error).message || "Помилка завантаження"
      : null,
    refresh,
  };
}
