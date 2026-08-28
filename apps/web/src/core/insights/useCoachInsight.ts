import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { coachApi, isApiError } from "@shared/api";
import { coachKeys } from "@shared/lib/api/queryKeys";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { trackAdviceFailed } from "../observability/adviceTelemetry";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain";
import {
  INCOME_CATEGORIES,
  MCC_CATEGORIES,
} from "@sergeant/finyk-domain/constants";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import {
  loadNutritionLog,
  loadNutritionPrefs,
} from "@nutrition/lib/nutritionStorage";
import { loadRoutineState } from "@routine/lib/routineStorage";
import { dateKeyFromDate } from "@sergeant/routine-domain";
import { newAdviceId } from "../observability/adviceTelemetry";

/* eslint-disable sergeant-design/prefer-kyiv-time, @typescript-eslint/no-non-null-assertion --
   prefer-kyiv-time: the "today" / week-window math intentionally reads
   host-local Date parts (see the AI-NOTE on `buildDateContext`) — on the Kyiv
   host the wall clock IS Kyiv, and `toISOString().slice(0,10)` would shift the
   day boundary and break evening Routine streaks. Kyiv-anchoring is tracked
   burn-down (2026-Q3), out of scope for the tombstone read-side fix.
   no-non-null-assertion: pre-existing guarded index access (`completions[h.id]!`
   after an `Array.isArray` check). */

const CACHE_KEY = "hub_coach_insight_cache_v1";

// Device-local day key (ADR-0078) — канонічна реалізація живе в
// `@sergeant/routine-domain` (`dateKeyFromDate`); тут лише тонкий делегат
// із дефолтним `new Date()` замість колишньої інлайн-копії.
const localDateKey = (d: Date = new Date()): string => dateKeyFromDate(d);

interface CategoryAmount {
  name: string;
  amount: number;
}

/**
 * Ключ бакета категорії → людська назва для коуча.
 *
 * Бакетимо транзакції за `txCategories[id] || String(mcc)`, тобто ключем може
 * бути domain-slug (`food`), сирий MCC (`5411`) або `other`. Сервер
 * (`modules/chat/coach.ts`) друкує `name` у промпт ЯК Є і назв не розкриває,
 * тож без цієї мапи коуч писав користувачу «5411 — 800 грн» замість
 * «Продукти — 800 грн» (user report). Емодзі з лейбла зрізаємо: він іде в
 * прозовий текст поради, а не в чип UI.
 */
const CATEGORY_LABEL_BY_KEY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  const clean = (label: string): string =>
    label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || label;
  for (const cat of [...MCC_CATEGORIES, ...INCOME_CATEGORIES]) {
    const label = clean(cat.label);
    map.set(cat.id, label);
    for (const mcc of ("mccs" in cat ? cat.mccs : []) as readonly number[]) {
      map.set(String(mcc), label);
    }
  }
  return map;
})();

function resolveCategoryLabel(key: string): string {
  const known = CATEGORY_LABEL_BY_KEY.get(key);
  if (known) return known;
  // Невідомий MCC (їх ~50 покритих зі значно більшого ISO-18245 списку) —
  // цифри користувачу нічого не кажуть, тож зводимо до «Інше». Нечислові
  // ключі — це користувацькі категорії: їхня назва нам тут недоступна, але
  // сам slug принаймні писав користувач.
  if (key === "other" || /^\d+$/.test(key)) return "Інше";
  return key;
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

export interface CoachSnapshot {
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
  5: "пʼятниця",
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
  // `txCategories[id] || mcc`, а назви розкриваємо тут-таки нижче —
  // coach API їх НЕ розкриває, друкує `name` у промпт як є.
  const aggregate = calcFinykPeriodAggregate(txs, {
    start: weekStart.getTime(),
    excludedTxIds,
    txSplits,
    categoryKey: (tx) => txCategories[tx.id] || String(tx.mcc ?? "other"),
  });

  // Спершу розкриваємо назви, ПОТІМ додаємо: різні невідомі MCC схлопуються
  // в один «Інше», і без цього злиття коуч бачив би кілька однойменних рядків.
  const byLabel = new Map<string, number>();
  for (const [key, amount] of Object.entries(aggregate.byCategory)) {
    const label = resolveCategoryLabel(key);
    byLabel.set(label, (byLabel.get(label) ?? 0) + amount);
  }
  const topCategories = [...byLabel]
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
    // Канонічні тренування — SQLite warm cache (`fizruk_workouts_v1`
    // tombstoned). Холодний кеш (`refreshedAt === null`) = «немає даних».
    // Тижневий обʼєм рахуємо з domain `items[].sets[].weightKg × reps`.
    const fizrukCache = getCachedFizrukSqliteState();
    if (fizrukCache.refreshedAt !== null) {
      const allWorkouts = fizrukCache.workouts;
      const weekWorkouts = allWorkouts.filter((w) => {
        if (!w.endedAt) return false;
        return new Date(w.startedAt) >= weekStart;
      });
      let totalVolume = 0;
      for (const w of weekWorkouts) {
        for (const item of w.items) {
          for (const set of item.sets ?? []) {
            totalVolume += set.weightKg * set.reps;
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
    // Канонічні лог + prefs — SQLite warm cache (`nutrition_log_v1` /
    // `nutrition_prefs_v1` tombstoned).
    const log = loadNutritionLog();
    const prefs = loadNutritionPrefs();
    let totalKcal = 0,
      totalProtein = 0,
      daysLogged = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dk = localDateKey(d);
      const meals = Array.isArray(log[dk]?.meals) ? log[dk].meals : [];
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
        targetKcal: prefs.dailyTargetKcal ?? 2000,
        daysLogged,
      };
    }
  } catch {
    /* non-fatal */
  }

  let routine: RoutineSnapshot | null = null;
  try {
    // Канонічний стан рутини — SQLite warm cache (`hub_routine_v1` tombstoned).
    const state = loadRoutineState();
    const habits = state.habits.filter((h) => !h.archived);
    const completions = state.completions;
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
  } catch {
    /* non-fatal */
  }

  const dateContext = buildDateContext(now, weekStart, mondayOffset);

  return { dateContext, finyk, fizruk, nutrition, routine };
}

/**
 * Скільки модулів дали ЗМІСТОВНИЙ сигнал за тиждень.
 *
 * Рахуємо не «поле не null», а наявність даних: `finyk` у снапшоті не
 * nullable і приходить із нулями навіть тоді, коли транзакцій немає, а
 * `fizruk` матеріалізується вже за самим фактом теплого кешу.
 */
export function coachSnapshotSignals(snapshot: CoachSnapshot): number {
  let signals = 0;
  if (snapshot.finyk.txCount > 0) signals++;
  if ((snapshot.fizruk?.workoutsCount ?? 0) > 0) signals++;
  if ((snapshot.nutrition?.daysLogged ?? 0) > 0) signals++;
  if ((snapshot.routine?.habitCount ?? 0) > 0) signals++;
  return signals;
}

/**
 * Поріг публікації — канон hub-coach §6.2 «краще мовчати, ніж шуміти».
 *
 * AI-CONTEXT (аудит hub-coach § G2): поріг існував ЛИШЕ для статистичних
 * кореляцій (`digestCorrelations.ts`: `MIN_N` спільних днів + `NOTABLE_R`
 * сила звʼязку — немає звʼязку, блок не друкується). Для текстових інсайтів
 * порогу не було взагалі: снапшот їхав на модель навіть тоді, коли всі
 * чотири модулі порожні, і вона писала пораду з нічого. Тобто захищено було
 * найнадійнішу частину — ту, що рахує код, — і не захищено найризикованішу,
 * ту, що пише модель.
 *
 * Канон вимагає саме порогу, а не промпт-побажання: «Це контракт із прямим
 * технічним наслідком: потрібен поріг публікації, а не просто
 * промпт-побажання» (§6.2).
 *
 * Поріг навмисно мінімальний і безспірний: нуль сигналів — мовчимо. Ширша
 * ГРАДАЦІЯ впевненості (скільки саме даних треба на впевнене твердження) —
 * окремий рядок Хвилі 4, і вона потребує продуктового рішення, якого канон
 * поки не дає.
 */
const MIN_SIGNAL_MODULES = 1;

async function fetchCoachInsight(): Promise<string | null> {
  const snapshot = aggregateCurrentSnapshot();

  // Гейт СТОЇТЬ ПЕРЕД усіма мережевими викликами: порожній тиждень не має
  // ані будити модель, ані палити денну AI-квоту користувача.
  if (coachSnapshotSignals(snapshot) < MIN_SIGNAL_MODULES) return null;

  let memory: string | null = null;
  try {
    const memJson = await coachApi.getMemory();
    memory = (memJson as { memory?: string }).memory ?? null;
  } catch {
    // Памʼять не обовʼязкова — інсайт будуємо й без неї.
  }

  const insightJson = await coachApi.postInsight({ snapshot, memory });
  return (insightJson as { insight?: string }).insight ?? null;
}

const coachInsightQueryKey = (todayKey = localDateKey()) =>
  coachKeys.insight(todayKey);

/**
 * Форма запису кешу. `adviceId` доданий Хвилею 2 (W2-AI-ADVICE-EVENTS) і
 * НАВМИСНО опційний: записи, збережені старим бандлом, живуть до кінця дня
 * (`staleTime: Infinity`), тож читання без id не має падати — id дописується
 * ліниво при першому ж проході ефекту.
 */
interface CachedAdvice {
  date?: string;
  text?: string;
  adviceId?: string;
}

function readAdviceCache(): CachedAdvice | null {
  return safeReadLS<CachedAdvice | null>(CACHE_KEY, null);
}

function loadInitialInsight(todayKey: string): string | undefined {
  const cached = readAdviceCache();
  if (cached?.date === todayKey && typeof cached?.text === "string") {
    return cached.text;
  }
  return undefined;
}

function loadInitialAdviceId(todayKey: string): string | null {
  const cached = readAdviceCache();
  if (
    cached?.date === todayKey &&
    typeof cached?.adviceId === "string" &&
    cached.adviceId
  ) {
    return cached.adviceId;
  }
  return null;
}

interface UseCoachInsightResult {
  insight: string | null;
  /**
   * Ідентичність поради для телеметрії (`advice_id` подій `ai_advice_*`).
   *
   * Випадковий uuid, згенерований РІВНО ОДИН РАЗ на згенеровану пораду —
   * не на рендер і НЕ як хеш тексту (хеш перетворив би подію на приховану
   * сигнатуру змісту, тобто на витік іншими словами). `null`, поки поради
   * немає.
   *
   * Обмеження, яке треба знати ДО побудови дашборда: id клієнтський, тож та
   * сама денна порада у вебі й на телефоні дасть ДВА різні id. Придатно для
   * «побачив → зреагував», НЕпридатно для «скільки унікальних порад
   * згенеровано».
   */
  adviceId: string | null;
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
    // Не ретраїмо 429: ліміт (`api:coach` rate-limit + денна AI-квота)
    // має годинне/добове вікно, тож негайний повтор гарантовано впаде
    // знову, спалить ще один хіт у спільному `api:coach` бакеті й затягне
    // спінер. Інші 4xx — теж детермінований fail. Transient network/5xx
    // лишаємо на одну спробу.
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false;
      if (isApiError(error) && error.kind === "http") return false;
      return true;
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    initialData: () => loadInitialInsight(todayKey),
    initialDataUpdatedAt: () => {
      const cached = readAdviceCache();
      if (cached?.date !== todayKey) return undefined;
      return Date.now();
    },
  });

  const [adviceId, setAdviceId] = useState<string | null>(() =>
    loadInitialAdviceId(todayKey),
  );
  // Якір ідентичності: (текст поради → її id). Джерело правди — САМЕ він, а не
  // round-trip через localStorage.
  //
  // AI-DANGER: спокуслива версія «перечитати кеш і порівняти» тут — це
  // нескінченний цикл рендерів у приватному режимі / при переповненій квоті:
  // `safeWriteLS` мовчки не зберігає, наступний `safeReadLS` знову не бачить
  // id, ефект генерує ще один — і так щорендеру. Ref розриває цю залежність:
  // id генерується рівно один раз на текст навіть коли сховище недоступне.
  const adviceIdRef = useRef<{ text: string; id: string } | null>(null);

  useEffect(() => {
    const text = query.data;
    if (typeof text !== "string" || text.length === 0 || query.isFetching) {
      return;
    }
    // Той самий текст → та сама порада → той самий id. Жодної залежності від
    // рендеру: id мінтиться в момент фіксації результату.
    if (adviceIdRef.current?.text === text) return;

    const cached = readAdviceCache();
    // Legacy-запис `{date, text}` без `adviceId` не падає — id дописується
    // ліниво, бо `staleTime: Infinity` лишає такий запис живим до кінця дня.
    const cachedId =
      cached?.date === todayKey &&
      cached?.text === text &&
      typeof cached?.adviceId === "string" &&
      cached.adviceId
        ? cached.adviceId
        : null;
    const nextId = cachedId ?? newAdviceId();

    adviceIdRef.current = { text, id: nextId };
    if (
      cached?.date !== todayKey ||
      cached?.text !== text ||
      cached?.adviceId !== nextId
    ) {
      safeWriteLS(CACHE_KEY, { date: todayKey, text, adviceId: nextId });
    }
    setAdviceId((prev) => (prev === nextId ? prev : nextId));
  }, [query.data, query.isFetching, todayKey]);

  // Провал генерації інсайту. Без цієї події «коуч мовчить, бо гейт
  // достатності даних (`hub-coach.md` §6.2) навмисно тримає тишу» і «коуч
  // мовчить, бо провайдер віддає 400» дають на дашборді той самий нуль
  // `ai_advice_shown`.
  //
  // Guard за посиланням на помилку, а не за булеаном: React Query лишає той
  // самий обʼєкт живим між рендерами й на час ретраю, тож без ref подія
  // летіла б щорендеру, поки картка на екрані.
  const failedErrRef = useRef<unknown>(null);
  useEffect(() => {
    const err = query.error;
    if (!err || failedErrRef.current === err) return;
    failedErrRef.current = err;
    trackAdviceFailed({
      source: "coach_insight",
      kind: isApiError(err) ? err.kind : "unknown",
      status: isApiError(err) && err.kind === "http" ? err.status : null,
    });
  }, [query.error]);

  const { refetch } = query;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: coachKeys.all });
    return refetch();
  }, [queryClient, refetch]);

  return {
    insight: query.data ?? null,
    adviceId,
    loading: query.isPending || query.isFetching,
    error: query.error
      ? isApiError(query.error) && query.error.kind === "http"
        ? query.error.serverMessage || "Помилка генерації інсайту"
        : (query.error as Error).message || "Помилка завантаження"
      : null,
    refresh,
  };
}
