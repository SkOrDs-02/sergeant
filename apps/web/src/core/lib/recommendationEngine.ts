/**
 * Rule-based recommendation engine.
 * Reads data from localStorage and generates cross-module nudges.
 */

import { buildFinanceContext } from "./recommendations/financeContext";
import { Recommendations } from "@sergeant/insights";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage/storage";

const { FINANCE_RULES, runRules } = Recommendations;
export type Rec = Recommendations.Rec;

interface Transaction {
  id: string;
  amount: number;
  time: number;
}

interface Exercise {
  nameUk?: string;
  name?: string;
  exercise?: string;
  muscleGroups?: string[];
  muscles?: string[];
}

interface Workout {
  startedAt: string;
  endedAt?: string;
  items?: Exercise[];
}

interface Habit {
  id: string;
  archived?: boolean;
}

interface RoutineState {
  habits?: Habit[];
  completions?: Record<string, string[]>;
}

interface Meal {
  macros?: {
    kcal?: number;
    protein_g?: number;
  };
}

interface NutritionDay {
  meals?: Meal[];
}

type NutritionLog = Record<string, NutritionDay | undefined>;

interface NutritionPrefs {
  dailyTargetKcal?: number;
  dailyTargetProtein_g?: number;
  dailyTargetProtein?: number;
}

function safeLS<T>(key: string, fallback: T): T {
  return safeReadLS<T>(key, fallback) ?? fallback;
}

function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

const MUSCLE_LABELS_UK: Record<string, string> = {
  chest: "Груди",
  back: "Спина",
  legs: "Ноги",
  shoulders: "Плечі",
  biceps: "Біцепс",
  triceps: "Триципс",
  core: "Прес",
  glutes: "Сідниці",
  hamstrings: "Задня поверхня стегна",
  calves: "Литки",
};

function parseFizrukWorkouts(): Workout[] {
  const raw = safeReadStringLS("fizruk_workouts_v1");
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

function buildMuscleLastTrained(workouts: Workout[]): Record<string, string> {
  const last: Record<string, string> = {};
  const completed = workouts.filter((w) => w.endedAt);
  for (const w of completed) {
    for (const item of w.items || []) {
      const muscles = getExerciseMuscles(item);
      for (const m of muscles) {
        if (!last[m] || w.startedAt > last[m]) {
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

function txTimestamp(tx: Transaction): number {
  return tx.time > 1e10 ? tx.time : tx.time * 1000;
}

function buildFinanceRecs(): Rec[] {
  // Делегує правилам з реєстру. Контекст будується один раз, далі кожне
  // правило читає потрібні зрізи і повертає 0..N рекомендацій.
  const ctx = buildFinanceContext();
  return runRules(FINANCE_RULES, ctx);
}

function buildFizrukRecs(): Rec[] {
  const recs: Rec[] = [];
  const workouts = parseFizrukWorkouts();
  const completed = workouts.filter((w) => w.endedAt);
  if (!completed.length) return recs;

  const sorted = [...completed].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const now = new Date();
  const lastMs = new Date(sorted[0].startedAt).getTime();
  const hoursAgo = (now.getTime() - lastMs) / 3_600_000;
  const daysSinceWorkout = hoursAgo / 24;

  if (daysSinceWorkout > 5) {
    recs.push({
      id: "fizruk_long_break",
      module: "fizruk",
      priority: 85,
      icon: "🏋️",
      title: `${Math.round(daysSinceWorkout)} днів без тренування`,
      body: "Пора відновити активність! Навіть легке тренування краще, ніж нічого.",
      action: "fizruk",
      pwaAction: "start_workout",
    });
  }

  const muscleLastTrained = buildMuscleLastTrained(completed);
  const STALE_DAYS = 8;
  for (const [muscle, lastIso] of Object.entries(muscleLastTrained)) {
    const days = daysBetween(lastIso, now.toISOString());
    if (days >= STALE_DAYS) {
      const label = MUSCLE_LABELS_UK[muscle] || muscle;
      recs.push({
        id: `fizruk_muscle_${muscle}`,
        module: "fizruk",
        priority: 55 + days,
        icon: "💪",
        title: `${label} не тренували ${days} днів`,
        body: "Включи вправи на ці м'язи в наступне тренування.",
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
      icon: "📅",
      title: "Цього тижня ще немає тренувань",
      body: "Тиждень вже в розпалі — час запланувати тренування!",
      action: "fizruk",
      pwaAction: "start_workout",
    });
  }

  return recs;
}

function buildRoutineRecs(): Rec[] {
  const recs: Rec[] = [];
  const state = safeLS<RoutineState | null>("hub_routine_v1", null);
  if (!state) return recs;

  const habits = (state.habits || []).filter((h) => !h.archived);
  const completions = state.completions || {};
  const today = localDateKey();

  const todayDone = habits.filter(
    (h) =>
      Array.isArray(completions[h.id]) && completions[h.id].includes(today),
  ).length;
  const total = habits.length;

  if (total === 0) return recs;

  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const dk = localDateKey(d);
    const allDone = habits.every(
      (h) => Array.isArray(completions[h.id]) && completions[h.id].includes(dk),
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
      icon: "🔥",
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
      icon: "✅",
      title: `${remaining} звичок ще не виконано сьогодні`,
      body: "Вечір — ще не пізно закрити всі звички.",
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
      icon: "🚨",
      title: `Серія ${streak} днів під загрозою!`,
      body: `Залишилось ${remaining} ${remaining === 1 ? "звичка" : "звичок"} — не дай рекорду згоріти.`,
      action: "routine",
    });
  }

  return recs;
}

function buildNutritionRecs(): Rec[] {
  const recs: Rec[] = [];
  const log = safeLS<NutritionLog>("nutrition_log_v1", {});
  const prefs = safeLS<NutritionPrefs | null>("nutrition_prefs_v1", null);
  const today = localDateKey();
  const dayData = log?.[today];
  const meals: Meal[] = Array.isArray(dayData?.meals) ? dayData.meals : [];

  let kcal = 0;
  let protein = 0;
  for (const m of meals) {
    kcal += m?.macros?.kcal ?? 0;
    protein += m?.macros?.protein_g ?? 0;
  }

  const targetKcal = prefs?.dailyTargetKcal ?? 2000;
  const targetProtein =
    prefs?.dailyTargetProtein_g ?? prefs?.dailyTargetProtein ?? 120;

  const hour = new Date().getHours();

  if (meals.length === 0 && hour >= 13) {
    recs.push({
      id: "nutrition_no_meals_today",
      module: "nutrition",
      priority: 75,
      icon: "🥗",
      title: "Сьогодні ще немає записів про їжу",
      body: "Зафіксуй свій прийом їжі, щоб стежити за КБЖВ.",
      action: "nutrition",
      pwaAction: "add_meal",
    });
  } else if (meals.length > 0) {
    const pctKcal = kcal / targetKcal;
    if (pctKcal < 0.5 && hour >= 18) {
      recs.push({
        id: "nutrition_kcal_low",
        module: "nutrition",
        priority: 70,
        icon: "⚡",
        title: `Лише ${Math.round(kcal)} ккал з ${targetKcal} ккал цілі`,
        body: "Недостатнє споживання калорій може уповільнити відновлення.",
        action: "nutrition",
        pwaAction: "add_meal",
      });
    }

    const pctProtein = protein / targetProtein;
    if (pctProtein < 0.6 && hour >= 16) {
      recs.push({
        id: "nutrition_protein_low",
        module: "nutrition",
        priority: 68,
        icon: "🥩",
        title: `Лише ${Math.round(protein)}г білка з ${targetProtein}г`,
        body: "Додай протеїновий прийом їжі — це важливо для м'язів.",
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
        (Date.now() - new Date(sorted[0].startedAt).getTime()) / 3_600_000;
      if (lastHours < 2 && pctProtein < 0.4) {
        recs.push({
          id: "nutrition_post_workout_protein",
          module: "nutrition",
          priority: 88,
          icon: "🏆",
          title: "Після тренування — час поповнити білок!",
          body: "У вас є ~30 хвилин на протеїновий прийом для кращого відновлення.",
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

  // Звички
  const state = safeLS<RoutineState | null>("hub_routine_v1", null);
  let habitPctText = "";
  if (state) {
    const habits = (state.habits || []).filter((h) => !h.archived);
    const completions = state.completions || {};
    if (habits.length > 0) {
      let done = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monPrev);
        d.setDate(monPrev.getDate() + i);
        const dk = localDateKey(d);
        for (const h of habits) {
          if (
            Array.isArray(completions[h.id]) &&
            completions[h.id].includes(dk)
          )
            done++;
        }
      }
      const total = habits.length * 7;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      habitPctText = `звички ${pct}%`;
    }
  }

  // Витрати минулого тижня
  const txCache = safeLS<{ txs?: Transaction[] } | Transaction[] | null>(
    "finyk_tx_cache",
    null,
  );
  const transactions: Transaction[] = txCache
    ? Array.isArray(txCache)
      ? txCache
      : (txCache.txs ?? [])
    : [];
  const txCategories = safeLS<Record<string, string>>("finyk_tx_cats", {});
  const hiddenTxIds = new Set<string>(safeLS<string[]>("finyk_hidden_txs", []));
  const transferIds = new Set<string>(
    Object.entries(txCategories)
      .filter(([, v]) => v === "internal_transfer")
      .map(([k]) => k),
  );
  let spendLastWeek = 0;
  for (const tx of transactions) {
    if (hiddenTxIds.has(tx.id) || transferIds.has(tx.id)) continue;
    if ((tx.amount ?? 0) >= 0) continue;
    const ts = txTimestamp(tx);
    if (ts >= monPrev.getTime() && ts <= sunPrev.getTime()) {
      spendLastWeek += Math.abs(tx.amount / 100);
    }
  }

  const parts: string[] = [];
  if (workoutsLastWeek > 0) parts.push(`${workoutsLastWeek} трен.`);
  if (habitPctText) parts.push(habitPctText);
  if (spendLastWeek > 0)
    parts.push(
      `витрати ${Math.round(spendLastWeek).toLocaleString("uk-UA")} ₴`,
    );

  if (parts.length === 0) return [];

  return [
    {
      id: `weekly_digest_${localDateKey(monPrev)}`,
      module: "hub",
      priority: 92,
      icon: "📊",
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
