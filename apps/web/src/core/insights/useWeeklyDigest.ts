import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coachApi, weeklyDigestApi } from "@shared/api";
import type { WeeklyDigestReport } from "@shared/api";
import { STORAGE_KEYS, getWeekKey as sharedGetWeekKey } from "@sergeant/shared";
import { safeReadLS } from "@shared/lib/storage";
import { loadDigest as sharedLoadDigest } from "@shared/lib/weeklyDigestStorage";
import { coachKeys, digestKeys } from "@shared/lib/queryKeys";
import { formatApiError } from "@shared/lib/apiErrorFormat";
import { MCC_CATEGORIES, INCOME_CATEGORIES } from "@finyk/constants";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain";

const DIGEST_PREFIX = STORAGE_KEYS.WEEKLY_DIGEST_PREFIX;

const ALL_CATS = [...MCC_CATEGORIES, ...INCOME_CATEGORIES];

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

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// `getWeekKey` lives in `@sergeant/shared` now (DOM-free, reused by
// mobile); re-exported here so existing call-sites keep their import
// path. `localDateKey` above is still used by the per-day loops
// further down in this file.
export const getWeekKey = sharedGetWeekKey;

export function getWeekRange(d = new Date()): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `${fmt(monday)} — ${fmt(sunday)}`;
}

export interface WeeklyDigest {
  generatedAt: string;
  weekKey: string;
  weekRange: string;
  [key: string]: unknown;
}

export function loadDigest(weekKey: string): WeeklyDigest | null {
  // Thin adapter: shared helper owns parsing / error-swallowing, web
  // pins the `localStorage`-backed reader via `weeklyDigestStorage`.
  return sharedLoadDigest(weekKey) as WeeklyDigest | null;
}

interface DigestHistoryEntry {
  weekKey: string;
  weekRange: string;
}

function listDigestHistory(): DigestHistoryEntry[] {
  const results: DigestHistoryEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DIGEST_PREFIX)) {
        const wk = key.slice(DIGEST_PREFIX.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
          results.push({
            weekKey: wk,
            weekRange: getWeekRange(new Date(wk + "T12:00:00")),
          });
        }
      }
    }
  } catch {
    /* non-fatal */
  }
  return results.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

function saveDigest(weekKey: string, data: unknown): void {
  try {
    localStorage.setItem(`${DIGEST_PREFIX}${weekKey}`, JSON.stringify(data));
  } catch {
    /* non-fatal */
  }
}

export interface FinykAggregate {
  totalSpent: number;
  totalIncome: number;
  txCount: number;
  topCategories: { name: string; amount: number }[];
  monthlyBudget: number | null;
}

export function aggregateFinyk(weekKey: string): FinykAggregate {
  const { txs, excludedTxIds, txSplits, txCategories, customCategories } =
    readFinykStatsContext();

  const monday = new Date(`${weekKey}T00:00:00`).getTime();
  const sunday = monday + 7 * 86_400_000;

  // AI-NOTE: Раніше aggregateFinyk парсив `finyk_tx_cache`/`finyk_hidden_txs`/
  // `finyk_tx_cats` напряму і виключав лише hidden + internal_transfer. Тепер
  // делегуємо у `@sergeant/finyk-domain` (calcFinykPeriodAggregate) і
  // використовуємо канонічний excluded-set Фініка (hidden + transfers + recv +
  // finyk_excluded_stat_txs) — той самий, що Overview/Reports. byCategory
  // ключуємо за «label після resolveCatLabel», як і раніше, щоб мерджити
  // різні id-шники, що мапляться в одну UI-категорію.
  const aggregate = calcFinykPeriodAggregate(txs, {
    start: monday,
    end: sunday,
    excludedTxIds,
    txSplits,
    categoryKey: (tx) => {
      const raw = txCategories[tx.id] ?? tx.mcc ?? "other";
      return resolveCatLabel(raw, customCategories as Category[]);
    },
  });

  const topCategories = Object.entries(aggregate.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  const finykStorage = safeReadLS<{
    monthlyPlan?: { expense?: number };
  } | null>("finyk_storage_v2", null);
  const monthlyBudget = finykStorage?.monthlyPlan?.expense ?? null;

  return {
    totalSpent: aggregate.totalSpent,
    totalIncome: aggregate.totalIncome,
    txCount: aggregate.txCount,
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
  let totalKcal = 0,
    totalProtein = 0,
    totalFat = 0,
    totalCarbs = 0,
    daysLogged = 0;

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
      if (Array.isArray(completions[h.id]) && completions[h.id].includes(dk)) {
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

async function generateWeeklyDigest(weekKey: string): Promise<{
  report: WeeklyDigestReport;
  generatedAt: string;
  weekKey: string;
  weekRange: string;
}> {
  const currentWeekRange = getWeekRange(new Date(weekKey + "T12:00:00"));
  const finyk = aggregateFinyk(weekKey);
  const fizruk = aggregateFizruk(weekKey);
  const nutrition = aggregateNutrition(weekKey);
  const routine = aggregateRoutine(weekKey);

  // Не огортаємо `ApiError` у plain `Error` — це ламало retry-логіку
  // React Query (`isRetriableError` читає `.status`) і приховувало `kind`
  // від UI-селекторів. Консьюмери тепер читають `.serverMessage` через
  // `isApiError(query.error)`.
  const json = await weeklyDigestApi.generate({
    weekRange: currentWeekRange,
    finyk,
    fizruk,
    nutrition,
    routine,
  });

  // `WeeklyDigestResponse` is a `{ report, generatedAt } | { error }` union;
  // the HTTP client throws an `ApiError` on non-2xx, so by the time we reach
  // this branch the response is the success variant. Narrow via `'report' in`.
  if (!("report" in json)) {
    throw new Error(json.error);
  }

  return {
    report: json.report,
    generatedAt: json.generatedAt,
    weekKey,
    weekRange: currentWeekRange,
  };
}

const weeklyDigestQueryKey = (weekKey: string) => digestKeys.byWeek(weekKey);
const weeklyDigestHistoryQueryKey = digestKeys.history;

export function useDigestHistory() {
  return useQuery({
    queryKey: weeklyDigestHistoryQueryKey,
    queryFn: listDigestHistory,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useWeeklyDigest(selectedWeekKey?: string) {
  const queryClient = useQueryClient();
  const currentWeekKey = getWeekKey();
  const weekKey = selectedWeekKey || currentWeekKey;
  const weekRange = getWeekRange(new Date(weekKey + "T12:00:00"));
  const isCurrentWeek = weekKey === currentWeekKey;

  const query = useQuery({
    queryKey: weeklyDigestQueryKey(weekKey),
    queryFn: () => loadDigest(weekKey) ?? null,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: () => loadDigest(weekKey) ?? undefined,
    initialDataUpdatedAt: () => {
      const existing = loadDigest(weekKey);
      return existing ? Date.now() : undefined;
    },
  });

  const mutation = useMutation({
    mutationFn: generateWeeklyDigest,
    onSuccess: ({ report, generatedAt, weekKey: wk, weekRange: wr }) => {
      const newDigest = {
        ...report,
        generatedAt,
        weekKey: wk,
        weekRange: wr,
      };
      saveDigest(wk, newDigest);
      queryClient.setQueryData(weeklyDigestQueryKey(wk), newDigest);
      queryClient.invalidateQueries({ queryKey: weeklyDigestHistoryQueryKey });
      queryClient.invalidateQueries({ queryKey: coachKeys.all });

      try {
        coachApi
          .postMemory({
            weeklyDigest: {
              weekKey: wk,
              weekRange: wr,
              generatedAt,
              ...report,
            },
          })
          .catch((err: unknown) => {
            // non-fatal, але без логу не було видно серверних збоїв у
            // персоналізованому coach-контексті — digest генерувався, а
            // пам'ять мовчки не оновлювалася.
            console.warn("[weeklyDigest] coachApi.postMemory failed", err);
          });
      } catch {
        /* non-fatal */
      }
    },
  });

  const { mutateAsync } = mutation;

  const generate = useCallback(async () => {
    if (!isCurrentWeek) return null;
    try {
      const result = await mutateAsync(weekKey);
      return {
        ...result.report,
        generatedAt: result.generatedAt,
        weekKey: result.weekKey,
        weekRange: result.weekRange,
      };
    } catch {
      return null;
    }
  }, [weekKey, isCurrentWeek, mutateAsync]);

  return {
    digest: query.data ?? null,
    loading: mutation.isPending,
    error: mutation.error
      ? formatApiError(mutation.error, { fallback: "Помилка генерації звіту" })
      : null,
    weekKey,
    weekRange,
    generate,
    isCurrentWeek,
  };
}
