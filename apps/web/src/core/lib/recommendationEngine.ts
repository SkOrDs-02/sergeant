/**
 * Rule-based recommendation engine.
 * Reads data from localStorage and generates cross-module nudges.
 *
 * Last validated: 2026-05-19
 */

/* eslint-disable sergeant-design/prefer-kyiv-time, @typescript-eslint/no-non-null-assertion -- pre-existing burndown: localDateKey/daysBetween/startOfWeek read host-local date parts (kyiv-time Theme 1) and a few non-null assertions sit on already-Array.isArray-guarded index lookups; both pre-existing and out of scope for this tombstone read-source fix. */
import { buildFinanceContext } from "./recommendations/financeContext";
import { Recommendations } from "@sergeant/insights";
import { loadRoutineState } from "@routine/lib/routineStorage";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import {
  loadNutritionLog,
  loadNutritionPrefs,
} from "@nutrition/lib/nutritionStorage";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { formatNumberUk, pluralDays, pluralUa } from "@sergeant/shared";
import { dateKeyFromDate } from "@sergeant/routine-domain";
import { wholeDaysSince } from "@shared/lib/time/wholeDaysSince";
import {
  BODY_ATLAS_MUSCLE_LABELS_UK,
  mapDomainMuscleToAtlas,
  type BodyAtlasMuscleId,
} from "@sergeant/fizruk-domain/data/bodyAtlas";

const { FINANCE_RULES, runRules } = Recommendations;
export type Rec = Recommendations.Rec;

interface Exercise {
  nameUk?: string;
  name?: string;
  exercise?: string;
  muscleGroups?: string[];
  muscles?: string[];
}

interface Workout {
  startedAt: string;
  endedAt?: string | undefined;
  items?: Exercise[];
}

// Device-local day key (ADR-0078) — делегат до канонічного `dateKeyFromDate`
// з `@sergeant/routine-domain` замість колишньої інлайн-копії.
const localDateKey = (d: Date = new Date()): string => dateKeyFromDate(d);

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Loose muscle keys → canonical `@sergeant/fizruk-domain` muscle ids.
 *
 * AI-CONTEXT: два джерела мʼязів сходяться в одну купу. `getExerciseMuscles`
 * дає грубі ключі з regex по назві вправи (`chest`, `legs`, …), а
 * `musclesPrimary`/`musclesSecondary` з каталогу — доменні id
 * (`pectoralis_major`, `rhomboids`, …). Раніше рушій підписував їх власною
 * табличкою на 10 рядків, тож усе поза нею витікало в UI сирим англійським
 * id («rhomboids не тренували 10 днів» — скріншот 2026-08-18). Тепер обидва
 * простори нормалізуються в доменний id, а звідти —
 * `mapDomainMuscleToAtlas` в атласний keyspace, де UA-підпис є для КОЖНОГО
 * ключа. Що не мапиться — не показуємо взагалі, англійський fallback більше
 * не існує.
 */
const LOOSE_MUSCLE_ALIASES: Record<string, string> = {
  chest: "pectoralis_major",
  back: "upper_back",
  lats: "latissimus_dorsi",
  legs: "quadriceps",
  quads: "quadriceps",
  shoulders: "front_deltoid",
  delts: "front_deltoid",
  core: "rectus_abdominis",
  abs: "rectus_abdominis",
  glutes: "gluteus_maximus",
  traps: "trapezius",
};

/** Fold any muscle key onto the canonical atlas keyspace (or drop it). */
function toAtlasMuscle(raw: unknown): BodyAtlasMuscleId | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return mapDomainMuscleToAtlas(LOOSE_MUSCLE_ALIASES[key] ?? key);
}

function parseFizrukWorkouts(): Workout[] {
  // `fizruk_workouts_v1` is tombstoned — read the canonical SQLite warm cache
  // (the source `useWorkouts` reads). Map the domain workout onto the loose
  // shape the muscle-balance heuristics expect; folding `musclesPrimary` +
  // `musclesSecondary` into `muscleGroups` gives more accurate muscle
  // detection than the legacy exercise-name regex alone.
  const fizruk = getCachedFizrukSqliteState();
  const workouts = fizruk.refreshedAt === null ? [] : fizruk.workouts;
  return workouts.map((w) => ({
    startedAt: w.startedAt,
    endedAt: w.endedAt ?? undefined,
    items: (w.items ?? []).map((it) => ({
      nameUk: it.nameUk,
      muscleGroups: [
        ...(it.musclesPrimary ?? []),
        ...(it.musclesSecondary ?? []),
      ],
    })),
  }));
}

function getExerciseMuscles(exercise: Exercise | null | undefined): string[] {
  const muscles: string[] = [];
  const ex = exercise || {};
  const name = (ex.nameUk || ex.name || ex.exercise || "").toLowerCase();
  if (/присід|squat/.test(name)) muscles.push("legs");
  if (/жим|press|bench/.test(name)) muscles.push("chest");
  if (/тяга|row|pull|deadlift/.test(name)) muscles.push("back");
  if (/плечей|lateral|shoulder|press overhead/.test(name))
    muscles.push("shoulders");
  if (/біцепс|curl|bicep/.test(name)) muscles.push("biceps");
  if (/триципс|tricep|dip/.test(name)) muscles.push("triceps");
  if (/прес|plank|crunch|abs/.test(name)) muscles.push("core");
  if (/ягодиц|glute|lunge/.test(name)) muscles.push("glutes");
  const muscleGroups = ex.muscleGroups || ex.muscles || [];
  if (Array.isArray(muscleGroups)) {
    for (const g of muscleGroups) muscles.push(String(g).toLowerCase());
  }
  return [...new Set(muscles)];
}

function buildMuscleLastTrained(
  workouts: Workout[],
): Partial<Record<BodyAtlasMuscleId, string>> {
  const last: Partial<Record<BodyAtlasMuscleId, string>> = {};
  const completed = workouts.filter((w) => w.endedAt);
  for (const w of completed) {
    for (const item of w.items || []) {
      for (const raw of getExerciseMuscles(item)) {
        // Кілька доменних мʼязів (rhomboids + upper_back + latissimus_dorsi)
        // згортаються в одну атласну групу — саме тому «спина» лишається
        // однією карткою, а не трьома.
        const m = toAtlasMuscle(raw);
        if (!m) continue;
        const prev = last[m];
        if (!prev || w.startedAt > prev) {
          last[m] = w.startedAt;
        }
      }
    }
  }
  return last;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildFinanceRecs(): Rec[] {
  // Делегує правилам з реєстру. Контекст будується один раз, далі кожне
  // правило читає потрібні зрізи і повертає 0..N рекомендацій.
  const ctx = buildFinanceContext();
  return runRules(FINANCE_RULES, ctx);
}

/** Днів без жодного тренування, після яких говорить `fizruk_long_break`. */
const LONG_BREAK_DAYS = 5;
/** Днів без конкретної мʼязової групи, після яких вона вважається несвіжою. */
const STALE_DAYS = 8;
/** Далі цієї межі група випадає з нагадування (див. коментар у місці фільтра). */
const STALE_LOOKBACK_DAYS = 45;
/** Скільки груп перелічуємо в тілі агрегованої картки. */
const STALE_MUSCLES_IN_BODY = 3;
const MUSCLE_GROUP_FORMS = {
  one: "група",
  few: "групи",
  many: "груп",
} as const;

function buildFizrukRecs(): Rec[] {
  const recs: Rec[] = [];
  const workouts = parseFizrukWorkouts();
  const completed = workouts.filter((w) => w.endedAt);
  if (!completed.length) return recs;

  const now = new Date();
  // AI-CONTEXT: одна пауза — одне число. Тут ділили ГОДИНИ на 24 і
  // округляли, а `useRestDayOverdueInsight` (fizruk) рахував календарні
  // доби від `endedAt`, тож хаб одночасно показував «15 днів» у картці
  // «Що зараз важливо» і «16 днів» в інсайтах (browser QA 2026-08-23).
  // Обидва тепер міряють `wholeDaysSince` від ОСТАННЬОГО завершення.
  let lastEndedMs = -Infinity;
  for (const w of completed) {
    const ms = Date.parse(w.endedAt as string);
    if (Number.isFinite(ms) && ms > lastEndedMs) lastEndedMs = ms;
  }
  const daysSinceWorkout = wholeDaysSince(
    lastEndedMs === -Infinity ? null : lastEndedMs,
    now,
  );

  // Нескінченність = жодного парсабельного `endedAt`. Тоді мовчимо обидві
  // гілки: «Infinity днів без тренування» — не повідомлення, а баг напоказ.
  if (Number.isFinite(daysSinceWorkout) && daysSinceWorkout > LONG_BREAK_DAYS) {
    recs.push({
      id: "fizruk_long_break",
      module: "fizruk",
      priority: 85,
      icon: "dumbbell",
      title: `${daysSinceWorkout} ${pluralDays(daysSinceWorkout)} без тренування`,
      body: "Пора відновити активність! Навіть легке тренування краще, ніж нічого.",
      action: "fizruk",
      pwaAction: "start_workout",
    });
  }

  // Мʼязовий баланс. ОДНА картка на весь дисбаланс, а не картка на групу:
  // після паузи стають несвіжими всі групи одразу, і старий цикл висипав у
  // «Що зараз важливо» до 18 однакових рядків (скріншот 2026-08-18).
  //
  // Так само мовчимо, поки діє `fizruk_long_break`: «10 днів без тренування»
  // вже сказало те саме, а перелік груп після нього — лише шум.
  if (daysSinceWorkout <= LONG_BREAK_DAYS) {
    const muscleLastTrained = buildMuscleLastTrained(completed);
    const stale = Object.entries(muscleLastTrained)
      .map(([muscle, lastIso]) => ({
        muscle: muscle as BodyAtlasMuscleId,
        days: daysBetween(lastIso as string, now.toISOString()),
      }))
      // Верхня межа: група, забута на місяці, — це вже не дисбаланс поточного
      // циклу, а слід старої історії. Нагадувати про неї щодня немає сенсу.
      .filter((s) => s.days >= STALE_DAYS && s.days <= STALE_LOOKBACK_DAYS)
      .sort((a, b) => b.days - a.days);

    if (stale.length > 0) {
      const labels = stale.map((s) => BODY_ATLAS_MUSCLE_LABELS_UK[s.muscle]);
      const maxDays = stale[0]!.days;
      const single = stale.length === 1;
      const shown = labels.slice(0, STALE_MUSCLES_IN_BODY);
      recs.push({
        id: "fizruk_muscle_balance",
        module: "fizruk",
        // Пріоритет тримається під `fizruk_long_break` (85): пауза в залі —
        // сильніший сигнал, ніж перекіс усередині активного циклу.
        priority: Math.min(55 + maxDays, 84),
        icon: "dumbbell",
        title: single
          ? `${labels[0]} не тренували ${maxDays} ${pluralDays(maxDays)}`
          : `${stale.length} ${pluralUa(stale.length, MUSCLE_GROUP_FORMS)} мʼязів без навантаження ${maxDays}+ ${pluralDays(maxDays)}`,
        body: single
          ? "Включи вправи на ці мʼязи в наступне тренування."
          : `Найдовше без роботи: ${shown.join(", ")}${
              labels.length > shown.length
                ? ` і ще ${labels.length - shown.length}`
                : ""
            }. Додай їх у наступне тренування.`,
        action: "fizruk",
        pwaAction: "start_workout",
      });
    }
  }

  const monAgo = new Date(now);
  monAgo.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monAgo.setHours(0, 0, 0, 0);
  const weekCount = completed.filter(
    (w) => new Date(w.startedAt) >= monAgo,
  ).length;
  if (weekCount === 0 && now.getDay() >= 3) {
    recs.push({
      id: "fizruk_no_week_workout",
      module: "fizruk",
      priority: 70,
      icon: "calendar",
      title: "Цього тижня ще немає тренувань",
      body: "Тиждень вже в розпалі, час запланувати тренування!",
      action: "fizruk",
      pwaAction: "start_workout",
    });
  }

  return recs;
}

function buildRoutineRecs(): Rec[] {
  const recs: Rec[] = [];
  // `hub_routine_v1` is tombstoned — read the canonical SQLite warm cache.
  const state = loadRoutineState();

  const habits = state.habits.filter((h) => !h.archived);
  const completions = state.completions;
  const today = localDateKey();

  const todayDone = habits.filter(
    (h) =>
      Array.isArray(completions[h.id]) && completions[h.id]!.includes(today),
  ).length;
  const total = habits.length;

  if (total === 0) return recs;

  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const dk = localDateKey(d);
    const allDone = habits.every(
      (h) =>
        Array.isArray(completions[h.id]) && completions[h.id]!.includes(dk),
    );
    if (!allDone) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  const MILESTONE_STREAKS = [3, 7, 14, 30, 60, 100];
  if (MILESTONE_STREAKS.includes(streak)) {
    recs.push({
      id: `routine_streak_${streak}`,
      module: "routine",
      priority: 80,
      icon: "flame",
      title: `${streak} днів поспіль! Вогонь!`,
      body: "Неймовірна серія! Продовжуй у тому ж дусі.",
      action: "routine",
    });
  }

  const hour = new Date().getHours();
  if (hour >= 18 && todayDone < total) {
    const remaining = total - todayDone;
    recs.push({
      id: "routine_evening_reminder",
      module: "routine",
      priority: 65,
      icon: "check",
      title: `${remaining} звичок ще не виконано сьогодні`,
      body: "Вечір, ще не пізно закрити всі звички.",
      action: "routine",
    });
  }

  // Серія в зоні ризику: пізній вечір + є серія + сьогодні не всі виконано
  if (hour >= 21 && streak >= 7 && todayDone < total) {
    const remaining = total - todayDone;
    recs.push({
      id: "routine_streak_at_risk",
      module: "routine",
      priority: 95,
      icon: "alert",
      title: `Серія ${streak} днів під загрозою!`,
      body: `Залишилось ${remaining} ${remaining === 1 ? "звичка" : "звичок"}, не дай рекорду згоріти.`,
      action: "routine",
    });
  }

  return recs;
}

/** Ціль вважається заданою лише якщо це додатне число. `0` — не ціль. */
function positiveTarget(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function buildNutritionRecs(): Rec[] {
  const recs: Rec[] = [];
  // `nutrition_log_v1` / `nutrition_prefs_v1` are tombstoned — read the
  // canonical SQLite warm caches.
  const log = loadNutritionLog();
  const prefs = loadNutritionPrefs();
  const today = localDateKey();
  const dayData = log[today];
  const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];

  let kcal = 0;
  let protein = 0;
  for (const m of meals) {
    kcal += m?.macros?.kcal ?? 0;
    protein += m?.macros?.protein_g ?? 0;
  }

  // Ціль може бути не задана — і тоді її НЕМА, а не «2000 за замовчуванням».
  // Раніше тут стояв фолбек, тож Hub заявляв «Лише 0 ккал з 2000 ккал цілі»
  // людині, якій сам модуль «Їжа» на сусідньому екрані пропонував ту ціль
  // спершу встановити (browser QA 2026-08-05, F-010). Сигнали, що міряють
  // прогрес відносно цілі, без цілі просто мовчать.
  const targetKcal = positiveTarget(prefs.dailyTargetKcal);
  const targetProtein = positiveTarget(prefs.dailyTargetProtein_g);

  const hour = new Date().getHours();

  if (meals.length === 0 && hour >= 13) {
    recs.push({
      id: "nutrition_no_meals_today",
      module: "nutrition",
      priority: 75,
      icon: "leaf",
      title: "Сьогодні ще немає записів про їжу",
      body: "Зафіксуй свій прийом їжі, щоб стежити за КБЖВ.",
      action: "nutrition",
      pwaAction: "add_meal",
    });
  } else if (meals.length > 0) {
    const pctKcal = targetKcal === null ? null : kcal / targetKcal;
    if (
      targetKcal !== null &&
      pctKcal !== null &&
      pctKcal < 0.5 &&
      hour >= 18
    ) {
      recs.push({
        id: "nutrition_kcal_low",
        module: "nutrition",
        priority: 70,
        icon: "zap",
        title: `Лише ${Math.round(kcal)} ккал з ${targetKcal} ккал цілі`,
        body: "Недостатнє споживання калорій може уповільнити відновлення.",
        action: "nutrition",
        pwaAction: "add_meal",
      });
    }

    const pctProtein = targetProtein === null ? null : protein / targetProtein;
    if (
      targetProtein !== null &&
      pctProtein !== null &&
      pctProtein < 0.6 &&
      hour >= 16
    ) {
      recs.push({
        id: "nutrition_protein_low",
        module: "nutrition",
        priority: 68,
        icon: "utensils",
        title: `Лише ${Math.round(protein)}г білка з ${targetProtein}г`,
        body: "Додай протеїновий прийом їжі, це важливо для мʼязів.",
        action: "nutrition",
        pwaAction: "add_meal",
      });
    }

    const workouts = parseFizrukWorkouts();
    const completed = workouts.filter((w) => w.endedAt);
    if (completed.length > 0) {
      const sorted = [...completed].sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
      const lastHours =
        (Date.now() - new Date(sorted[0]!.startedAt).getTime()) / 3_600_000;
      if (lastHours < 2 && pctProtein !== null && pctProtein < 0.4) {
        recs.push({
          id: "nutrition_post_workout_protein",
          module: "nutrition",
          priority: 88,
          icon: "award",
          title: "Після тренування, час поповнити білок!",
          body: "У тебе є ~30 хвилин на протеїновий прийом для кращого відновлення.",
          action: "nutrition",
          pwaAction: "add_meal",
        });
      }
    }
  }

  return recs;
}

function buildWeeklyDigestRecs(): Rec[] {
  // Понеділок 7:00-12:00 — підсумок минулого тижня
  const now = new Date();
  if (now.getDay() !== 1) return [];
  const hour = now.getHours();
  if (hour < 7 || hour >= 12) return [];

  const monThis = startOfWeek(now);
  const monPrev = new Date(monThis);
  monPrev.setDate(monPrev.getDate() - 7);
  const sunPrev = new Date(monThis);
  sunPrev.setMilliseconds(-1);

  // Тренування
  const workouts = parseFizrukWorkouts().filter((w) => w.endedAt);
  const workoutsLastWeek = workouts.filter((w) => {
    const t = new Date(w.startedAt);
    return t >= monPrev && t <= sunPrev;
  }).length;

  // Звички — `hub_routine_v1` is tombstoned; read the canonical SQLite cache.
  const routineState = loadRoutineState();
  let habitPctText = "";
  const habits = routineState.habits.filter((h) => !h.archived);
  const completions = routineState.completions;
  if (habits.length > 0) {
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monPrev);
      d.setDate(monPrev.getDate() + i);
      const dk = localDateKey(d);
      for (const h of habits) {
        if (Array.isArray(completions[h.id]) && completions[h.id]!.includes(dk))
          done++;
      }
    }
    const total = habits.length * 7;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    habitPctText = `звички ${pct}%`;
  }

  // Витрати минулого тижня — канонічний конвеєр, той самий, що обслуговує
  // тижневий дайджест і Hub-Reports (`readFinykStatsContext` → всесвіт
  // `bank + manual`, канонічний excluded-set, спліти).
  //
  // AI-CONTEXT: до 2026-08-04 цей блок був СЬОМИМ конвеєром витрат, якого
  // навіть не було в таблиці реєстру: він фільтрував лише `finyk_hidden_txs`
  // і внутрішні перекази, тож не знав ані про спліти, ані про
  // `finyk_excluded_stat_txs`, ані про звʼязані з receivables транзакції, ані
  // про готівку. Число в цьому нагадуванні розходилось із дайджестом на тих
  // самих даних.
  //
  // Межа вікна: `sunPrev` — остання мілісекунда перед `monThis`, а канон бере
  // `end` ЕКСКЛЮЗИВНО, тож сюди йде `monThis`, а не `sunPrev`. Пряма підстановка
  // `sunPrev` втратила б останню мілісекунду тижня.
  const { txs, excludedTxIds, txSplits } = readFinykStatsContext();
  const { totalSpent: spendLastWeek } = calcFinykPeriodAggregate(txs, {
    start: monPrev.getTime(),
    end: monThis.getTime(),
    excludedTxIds,
    txSplits,
  });

  const parts: string[] = [];
  if (workoutsLastWeek > 0) parts.push(`${workoutsLastWeek} трен.`);
  if (habitPctText) parts.push(habitPctText);
  if (spendLastWeek > 0)
    parts.push(`витрати ${formatNumberUk(Math.round(spendLastWeek))} ₴`);

  if (parts.length === 0) return [];

  return [
    {
      id: `weekly_digest_${localDateKey(monPrev)}`,
      module: "hub",
      priority: 92,
      icon: "activity",
      title: "Підсумок минулого тижня",
      body: parts.join(" · "),
      action: "reports",
    },
  ];
}

/**
 * Returns sorted list of recommendations.
 */
export function generateRecommendations(): Rec[] {
  const all: Rec[] = [
    ...buildFinanceRecs(),
    ...buildFizrukRecs(),
    ...buildRoutineRecs(),
    ...buildNutritionRecs(),
    ...buildWeeklyDigestRecs(),
  ];
  all.sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  return all.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
