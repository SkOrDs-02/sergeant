import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { logger } from "@shared/lib";
import { coachApi, isApiError, weeklyDigestApi } from "@shared/api";
import type { WeeklyDigestReport } from "@shared/api";
import {
  METRICS_VERSION,
  STORAGE_KEYS,
  getWeekKey as sharedGetWeekKey,
} from "@sergeant/shared";
import {
  safeListLSKeys,
  safeReadLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import { loadDigest as sharedLoadDigest } from "@shared/lib/storage/weeklyDigestStorage";
import { buildDigestCorrelations } from "./digestCorrelations";
import { coachKeys, digestKeys } from "@shared/lib/api/queryKeys";
import { formatApiError } from "@shared/lib/api/apiErrorFormat";
import { trackAdviceFailed } from "../observability/adviceTelemetry";
import {
  getCategory,
  resolveExpenseCategoryMeta,
} from "@sergeant/finyk-domain/lib/categories";
import { canonicalManualCategoryId } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { getCachedFinykSqliteState } from "@finyk/lib/sqliteReader";
import { loadRoutineState } from "@routine/lib/routineStorage";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import {
  loadNutritionLog,
  loadNutritionPrefs,
} from "@nutrition/lib/nutritionStorage";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain";
import { calcRoutinePeriodCompletion } from "@sergeant/routine-domain/period-completion";
import { dateKeyFromDate } from "@sergeant/routine-domain";
import { calcNutritionPeriodAverages } from "@sergeant/nutrition-domain";
import type { MonthlyPlan } from "@finyk/hooks/useStorage.types";

const DIGEST_PREFIX = STORAGE_KEYS.WEEKLY_DIGEST_PREFIX;

interface Category {
  id?: string;
  label?: string;
  name?: string;
  mccs?: number[];
}

// Device-local day key (ADR-0078) — делегат до канонічного `dateKeyFromDate`
// з `@sergeant/routine-domain` замість колишньої інлайн-копії.
const localDateKey = (d: Date = new Date()): string => dateKeyFromDate(d);

// `getWeekKey` lives in `@sergeant/shared` now (DOM-free, reused by
// mobile); re-exported here so existing call-sites keep their import
// path. `localDateKey` above is still used by the per-day loops
// further down in this file.
export const getWeekKey = sharedGetWeekKey;

export function getWeekRange(d = new Date()): string {
  const monday = new Date(d);
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- pre-existing kyiv-time burndown (Theme 1), out of scope for this routine-source fix
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- pre-existing kyiv-time burndown (Theme 1), out of scope for this routine-source fix
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
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
  for (const key of safeListLSKeys()) {
    if (!key.startsWith(DIGEST_PREFIX)) continue;
    const wk = key.slice(DIGEST_PREFIX.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
      results.push({
        weekKey: wk,
        weekRange: getWeekRange(new Date(wk + "T12:00:00")),
      });
    }
  }
  return results.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

function saveDigest(weekKey: string, data: unknown): void {
  safeWriteLS(`${DIGEST_PREFIX}${weekKey}`, data);
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
  // ключуємо за label-ом категорії, щоб мерджити різні id-шники, що
  // мапляться в одну UI-категорію.
  const aggregate = calcFinykPeriodAggregate(txs, {
    start: monday,
    end: sunday,
    excludedTxIds,
    txSplits,
    categoryKey: (tx) => {
      // W1-CANON-AGG стадія 2d: ручний запис не має ані рядка в
      // `finyk_tx_cats` (там ключі банківських id), ані MCC — його
      // категорія приїжджає полем `categoryId` з
      // `manualExpenseToTransaction`. Без цієї гілки вся готівка осідала б
      // у «Інше», і топ-категорії брехали б рівно на суму ручного світу.
      // Гілка навмисно звужена до `manual`: банківські рядки теж несуть
      // `categoryId`, і зчитувати його тут означало б тихо перекроїти вже
      // показану користувачу розбивку банківських витрат.
      const manualTx = tx as typeof tx & {
        manual?: boolean;
        categoryId?: string;
      };
      const manualCategory =
        manualTx.manual && manualTx.categoryId ? manualTx.categoryId : null;
      const override = txCategories[tx.id] ?? manualCategory ?? null;
      // AI-CONTEXT (bug 2026-08-09): резолвимо КАНОНІЧНОЮ `getCategory` —
      // тією самою, що друкує підпис у стрічці транзакцій і в Звітах.
      // Власний резолвер дайджесту не знав ані keyword-матчингу, ані
      // фолбеку «Інше»: невідомий MCC витікав користувачеві сирим рядком
      // `MCC 4829` (це «переказ коштів»), і той самий рядок ішов у промпт
      // моделі, яка потім пояснювала людині її ж «категорію MCC 4829».
      const resolved = getCategory(
        tx.description ?? "",
        tx.mcc ?? 0,
        override,
        customCategories as Category[],
      );
      // Ключ — підпис КАНОНІЧНОЇ категорії. Детальні слаги ручної форми
      // (`cafe`, `tech`, `groceries`) не мають запису в MCC-каталозі, тож
      // без цього зведення `cafe` давав рядок «☕ Кафе та ресторани»
      // ПОРУЧ із банківським «🍔 Кафе та ресторани» — дві позиції з
      // однаковою назвою і різним емодзі, бо ключування за label-ом
      // мерджить лише те, що вже має однаковий підпис. Кастомні id
      // проходять недоторканими.
      const canonicalId = canonicalManualCategoryId(resolved.id);
      if (canonicalId === resolved.id) return resolved.label;
      return (
        resolveExpenseCategoryMeta(canonicalId, customCategories as Category[])
          ?.label ?? resolved.label
      );
    },
  });

  const topCategories = Object.entries(aggregate.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  // PR #072 (storage-roadmap Stage 13) — read SQLite `finyk_prefs.monthly_plan_json`
  // (canonical, written by `useFinykDualWriteSync`) with a one-step LS fallback
  // for boot-cycles when the SQLite cache is still cold. The previous
  // `safeReadLS("finyk_storage_v2", ...)` blob was never written to after
  // PR #035–#039 (Stage 4 per-key split), so `monthlyBudget` was always
  // `null` on fresh installs and `Insights.budgetRemaining` silently
  // degraded.
  const sqliteMonthlyPlan = getCachedFinykSqliteState().monthlyPlan;
  const lsMonthlyPlan = safeReadLS<MonthlyPlan | null>(
    // eslint-disable-next-line sergeant-design/no-raw-storage-key -- aggregator runs outside React (digest + compare_weeks chat tool); finyk useStorage hooks are unavailable and STORAGE_KEYS.FINYK_* is itself banned for direct access (no-restricted-syntax, PR #039). Mirror of queryFinykActions.ts.
    "finyk_monthly_plan",
    null,
  );
  const monthlyPlan = sqliteMonthlyPlan ?? lsMonthlyPlan;
  // `MonthlyPlan.expense` is `string | number` (the dual-write extractor
  // accepts both shapes) — coerce to number for the digest payload, and
  // collapse blank strings + NaN to `null`.
  const expenseRaw = monthlyPlan?.expense;
  const expenseNum =
    expenseRaw === undefined || expenseRaw === ""
      ? Number.NaN
      : Number(expenseRaw);
  const monthlyBudget = Number.isFinite(expenseNum) ? expenseNum : null;

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
  // Canonical workouts — SQLite warm cache (`fizruk_workouts_v1` tombstoned).
  // Cold cache (`refreshedAt === null`) = no data. Domain `WorkoutItem` carries
  // `nameUk` + `sets[].weightKg` (legacy LS used `exercises[].name` /
  // `sets[].weight`).
  const fizruk = getCachedFizrukSqliteState();
  if (fizruk.refreshedAt === null) return null;
  const workouts = fizruk.workouts;
  if (workouts.length === 0) return null;

  const monday = new Date(`${weekKey}T00:00:00`);
  const sunday = new Date(monday);
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- pre-existing kyiv-time burndown (Theme 1), out of scope for the tombstone read-side fix
  sunday.setDate(monday.getDate() + 7);

  const weekWorkouts = workouts.filter((w) => {
    if (!w.endedAt) return false;
    const d = new Date(w.startedAt);
    return d >= monday && d < sunday;
  });

  let totalVolume = 0;
  const exerciseVolumes: Record<string, number> = {};

  for (const w of weekWorkouts) {
    for (const item of w.items) {
      const vol = (item.sets ?? []).reduce(
        (s, set) => s + set.weightKg * set.reps,
        0,
      );
      totalVolume += vol;
      if (item.nameUk) {
        exerciseVolumes[item.nameUk] =
          (exerciseVolumes[item.nameUk] ?? 0) + vol;
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
  /**
   * Скільки днів у періоді всього (для тижня — 7).
   *
   * AI-CONTEXT: знаменник coverage. Середні свідомо рахуються лише по
   * залогованих днях (канон nutrition §5.2 — «неповний день це неповні
   * дані, а не дефіцит»), але без цього числа поруч «середнє 1950, 95%
   * цілі» за ДВА залоговані дні читається як чудовий тиждень. Аудит
   * nutrition § E-4 називає це success theater: інструмент ховає власний
   * провал від єдиної людини, яка його оцінює.
   */
  daysInPeriod: number;
}

export function aggregateNutrition(weekKey: string): NutritionAggregate | null {
  // Canonical log + prefs — SQLite warm cache (`nutrition_log_v1` /
  // `nutrition_prefs_v1` tombstoned).
  const log = loadNutritionLog();
  const prefs = loadNutritionPrefs();
  const targetKcal = prefs.dailyTargetKcal ?? 2000;

  const monday = new Date(`${weekKey}T00:00:00`);
  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- pre-existing kyiv-time burndown (Theme 1), out of scope for this routine-source fix
    d.setDate(monday.getDate() + i);
    weekDays.push(localDateKey(d));
  }

  // AI-CONTEXT: W1-CANON-AGG стадія 4 — числа не рухаються (дайджест уже
  // рахував за канонічною семантикою «дні з ≥1 прийомом»), рухається лише
  // джерело коду: inline-копія замінена викликом канону. Збіг, який тримався
  // на дисципліні, тепер тримається на спільній функції.
  const period = calcNutritionPeriodAverages(log, weekDays);

  if (period.daysLogged === 0) return null;

  return {
    avgKcal: period.avgKcal,
    avgProtein: period.avgProtein,
    avgFat: period.avgFat,
    avgCarbs: period.avgCarbs,
    targetKcal,
    daysLogged: period.daysLogged,
    daysInPeriod: period.daysInPeriod,
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
  // Stage 8 PR #057r-tombstone retired the legacy `hub_routine_v1` LS key — it
  // used to be deleted on boot after a one-time SQLite import
  // (`residualImport.ts`, removed 2026-08 once no pre-beta testers were left
  // with pre-SQLite LS data to migrate) and `saveRoutineState()` no longer
  // writes it. Reading that key here returned `null` in production, so the
  // weekly digest (and the `compare_weeks` chat tool, which calls this)
  // reported zero habits even for users who had them. Read
  // `loadRoutineState()` — the canonical SQLite-backed source the Routine UI
  // and `queryRoutineActions` use — so digest and module UI agree.
  const state = loadRoutineState();

  const habits = state.habits.filter((h) => !h.archived);
  if (!habits.length) return null;

  const completions = state.completions;
  const monday = new Date(`${weekKey}T00:00:00`);

  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- pre-existing kyiv-time burndown (Theme 1), out of scope for this routine-source fix
    d.setDate(monday.getDate() + i);
    weekDays.push(localDateKey(d));
  }

  // AI-CONTEXT: W1-CANON-AGG стадія 4 — знаменник більше не «7 днів на
  // звичку». Локальний підрахунок замінено делегуванням у канонічну
  // `calcRoutinePeriodCompletion`, тож дайджест, Hub-Reports і модуль Звички
  // читають один і той самий код. `total` у `HabitStat` тепер означає
  // «скільки днів звичка була запланована», а не «7».
  //
  // `pausedFrom` — заморозка минулого (ADR-0079 §2). Для дайджеста це
  // критичніше, ніж будь-де: він рахує ЗАКРИТІ тижні, тож без параметра
  // пауза, поставлена сьогодні, переписувала б підсумки за минулі тижні —
  // рівно те, що ADR називає «цифри за минуле перераховуються поточною
  // конфігурацією».
  // Host-local, як і `weekDays` вище; київська межа доби — окремий борг
  // реєстру метрик (стадія 5г).
  const period = calcRoutinePeriodCompletion(habits, completions, weekDays, {
    pausedFrom: localDateKey(new Date()),
  });

  const habitStats: HabitStat[] = period.perHabit.map((h) => ({
    name: h.name,
    done: h.done,
    total: h.scheduled,
    completionRate: h.completionRate,
  }));

  return {
    habitCount: habits.length,
    overallRate: period.pct,
    habits: habitStats,
  };
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
    // Канонічний ключ тижня для ai_memories.source_ref (сервер падає назад
    // на weekRange лише для старих бандлів без цього поля).
    weekKey,
    // AI-CONTEXT: провенанс методики (ADR-0079 §3-§4). Числа вище пораховані
    // агрегаторами цього бандла, тож дайджест штампується версією, чинною на
    // момент підрахунку. Без цього штампу коуч, який тримає 8 тижнів,
    // прочитає майбутній стрибок визначення як зміну поведінки користувача.
    metricsVersion: METRICS_VERSION,
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

/**
 * Поріг публікації для тижневого дайджесту (Хвиля 4, hub-coach § G2 / §6.2)
 * повернув сервер саме цим кодом — `apps/server/src/modules/digest/weekly-digest.ts`
 * → `countDigestSignalModules`. Розрізняємо цю відповідь від справжніх
 * помилок (мережа, 5xx, парсинг Anthropic), щоб UI показав чесне «замало
 * даних», а не порожню картку чи generic error-банер (обидва варіанти
 * канон § G2 явно забороняє для цього шляху).
 */
function isInsufficientDataError(err: unknown): boolean {
  if (!isApiError(err)) return false;
  const code = (err.body as { code?: unknown } | undefined)?.code;
  return code === "INSUFFICIENT_DATA";
}

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
  // Минулий (щойно завершений) тиждень теж генерується: понеділковий
  // авто-звіт підбиває САМЕ його, а ручна кнопка дає перегенерувати
  // неповний недільний знімок повними даними. Старіші тижні лишаються
  // read-only: їхні локальні дані вже могли поїхати, і звіт брехав би.
  const previousWeekKey = getWeekKey(
    new Date(new Date(currentWeekKey + "T12:00:00").getTime() - 7 * 86_400_000),
  );
  const isPreviousWeek = weekKey === previousWeekKey;
  const canGenerate = isCurrentWeek || isPreviousWeek;

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
        // Кореляції рахуються кодом (не LLM) з локальних даних усіх модулів —
        // коуч отримує «помічені звʼязки» без окремого виклику моделі (WP3).
        const correlations = buildDigestCorrelations();
        coachApi
          .postMemory({
            weeklyDigest: {
              weekKey: wk,
              weekRange: wr,
              generatedAt,
              ...report,
              correlations,
            },
          })
          .catch((err: unknown) => {
            // non-fatal, але без логу не було видно серверних збоїв у
            // персоналізованому coach-контексті — digest генерувався, а
            // памʼять мовчки не оновлювалася.
            logger.warn("[weeklyDigest] coachApi.postMemory failed", err);
          });
      } catch {
        /* non-fatal */
      }
    },
    // Провал генерації інакше зникає безслідно: `generate` нижче ковтає
    // помилку в `catch { return null }`, і зовні це не відрізнити від
    // «звіту ще немає». Емітимо тут, а не в тому catch, щоб не рахувати
    // двічі — mutateAsync прокидає ту саму помилку далі.
    onError: (err: unknown) => {
      trackAdviceFailed({
        source: "weekly_digest",
        kind: isApiError(err) ? err.kind : "unknown",
        status: isApiError(err) && err.kind === "http" ? err.status : null,
      });
    },
  });

  const { mutateAsync } = mutation;

  const generate = useCallback(async () => {
    if (!canGenerate) return null;
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
  }, [weekKey, canGenerate, mutateAsync]);

  const insufficientData = isInsufficientDataError(mutation.error);

  return {
    digest: query.data ?? null,
    loading: mutation.isPending,
    // `insufficientData` — окрема, чесна відповідь («замало даних»), не
    // помилка: суперечило б §6.2, якби вона рендерилась як generic
    // error-банер разом із мережевими/5xx збоями.
    error:
      mutation.error && !insufficientData
        ? formatApiError(mutation.error, {
            fallback: "Помилка генерації звіту",
          })
        : null,
    insufficientData,
    weekKey,
    weekRange,
    generate,
    isCurrentWeek,
    canGenerate,
  };
}
