import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { safeWriteSyncedLS } from "@shared/lib/storage/syncedKV";

// Writes a single preset entry directly into the matching module's
// localStorage key. This is how the FTUX PresetSheet turns "tap a tile"
// into a real (non-demo) entry without forcing the user into a module's
// full input wizard first.
//
// The writers here intentionally skip the modules' public
// `save*`/`createHabit` APIs and poke localStorage directly for one
// reason: those APIs are debounced (see `createModuleStorage`) and the
// FTUX celebration needs the entry to be visible on the very next
// render of the Hub dashboard. A 200 ms debounce window is invisible in
// normal use but long enough to break the 30-second promise headline.
//
// Each writer:
//   - fans out the same storage-change event the module listens to, so
//     the Hub dashboard re-renders synchronously;
//   - writes an entry with `demo: false` (explicit) so
//     `detectFirstRealEntry` picks it up immediately;
//   - is idempotent w.r.t. the preset itself — two rapid taps of the
//     same preset create two entries, which mirrors normal module
//     behavior (users can log the same habit / expense / meal twice).

const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const FINYK_MANUAL_ONLY_KEY = "finyk_manual_only_v1";
const ROUTINE_STATE_KEY = "hub_routine_v1";
const ROUTINE_EVENT = "hub-routine-storage";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const NUTRITION_LOG_KEY = "nutrition_log_v1";
const NUTRITION_LOG_EVENT = "nutrition-log-storage";

export type FinykPreset = {
  description: string;
  amount: number;
  category: string;
};

export type RoutinePreset = {
  name: string;
  emoji?: string;
};

export type FizrukPreset = {
  name: string;
  durationMin: number;
};

export type NutritionPreset = {
  name: string;
  kcal: number;
  mealType?: string;
};

type RoutineHabit = {
  id: string;
  demo: boolean;
  name: string;
  emoji: string;
  tagIds: string[];
  categoryId: string | null;
  createdAt: string;
  archived: boolean;
  recurrence: string;
  startDate: string;
  endDate: string | null;
  timeOfDay: string;
  reminderTimes: string[];
  weekdays: number[];
};

type RoutinePrefs = {
  showFizrukInCalendar: boolean;
  showFinykSubscriptionsInCalendar: boolean;
  routineRemindersEnabled: boolean;
};

type RoutineState = {
  schemaVersion?: number;
  prefs?: RoutinePrefs;
  tags?: unknown[];
  categories?: unknown[];
  habits?: RoutineHabit[];
  completions?: Record<string, unknown>;
  pushupsByDate?: Record<string, unknown>;
  habitOrder?: string[];
  completionNotes?: Record<string, unknown>;
};

type FizrukWorkout = {
  id: string;
  demo: boolean;
  name: string;
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  exercises: unknown[];
};

type FizrukWorkoutsState = {
  schemaVersion?: number;
  workouts?: FizrukWorkout[];
};

type NutritionMeal = {
  id: string;
  demo: boolean;
  name: string;
  time: string;
  mealType: string;
  label: string;
  macros: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  source: string;
  macroSource: string;
  amount_g: number | null;
  foodId: string | null;
};

type NutritionDay = {
  meals?: NutritionMeal[];
};

type NutritionLogState = Record<string, NutritionDay>;

function dispatch(eventName: string) {
  try {
    window.dispatchEvent(new CustomEvent(eventName));
  } catch {
    /* noop */
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toLocalISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Finyk ───────────────────────────────────────────────────────────────

function applyFinykPreset(preset: FinykPreset) {
  const existing = safeReadLS(FINYK_MANUAL_EXPENSES_KEY, []);
  const list = Array.isArray(existing) ? existing : [];
  const entry = {
    id: uid("tx"),
    demo: false,
    date: new Date().toISOString(),
    description: preset.description,
    amount: preset.amount,
    category: preset.category,
  };
  // Tracked sync key (finyk module) — go through `syncedKV`.
  safeWriteSyncedLS(FINYK_MANUAL_EXPENSES_KEY, [entry, ...list]);
  // Keep the user out of the Monobank login gate — mirrors what
  // `enableFinykManualOnly()` does on the «Далі без банку» path.
  // `safeWriteLS` keeps raw strings as-is (no JSON.stringify) so the
  // stored value matches the legacy `localStorage.setItem(_, "1")` shape.
  // (Untracked key — keep using `safeWriteLS`.)
  safeWriteLS(FINYK_MANUAL_ONLY_KEY, "1");
}

// ─── Routine ─────────────────────────────────────────────────────────────

function applyRoutinePreset(preset: RoutinePreset) {
  const state = safeReadLS<RoutineState>(ROUTINE_STATE_KEY, null);
  const today = toLocalISODate();
  const habit: RoutineHabit = {
    id: uid("hab"),
    // Explicit false — `hasNonDemoItem` flags anything without `demo:true`
    // as real, but being explicit keeps `routineBackup` round-trips safe.
    demo: false,
    name: preset.name,
    emoji: preset.emoji || "✓",
    tagIds: [],
    categoryId: null,
    createdAt: new Date().toISOString(),
    archived: false,
    recurrence: "daily",
    startDate: today,
    endDate: null,
    timeOfDay: "",
    reminderTimes: [],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };

  const base: RoutineState =
    state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const nextHabits = Array.isArray(base.habits)
    ? [...base.habits, habit]
    : [habit];
  const nextOrder = Array.isArray(base.habitOrder)
    ? [...base.habitOrder, habit.id]
    : [habit.id];

  safeWriteLS(ROUTINE_STATE_KEY, {
    schemaVersion: 3,
    prefs: base.prefs || {
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: false,
    },
    tags: Array.isArray(base.tags) ? base.tags : [],
    categories: Array.isArray(base.categories) ? base.categories : [],
    habits: nextHabits,
    completions: base.completions || {},
    pushupsByDate: base.pushupsByDate || {},
    habitOrder: nextOrder,
    completionNotes: base.completionNotes || {},
  });
  dispatch(ROUTINE_EVENT);
}

// ─── Fizruk ──────────────────────────────────────────────────────────────

function applyFizrukPreset(preset: FizrukPreset) {
  const existing = safeReadLS<FizrukWorkoutsState | FizrukWorkout[]>(
    FIZRUK_WORKOUTS_KEY,
    null,
  );
  const existingList: FizrukWorkout[] = Array.isArray(existing)
    ? existing
    : existing && Array.isArray(existing.workouts)
      ? existing.workouts
      : [];
  const now = new Date();
  const startedAt = new Date(now.getTime() - preset.durationMin * 60000);
  const workout: FizrukWorkout = {
    id: uid("wo"),
    demo: false,
    name: preset.name,
    startedAt: startedAt.toISOString(),
    finishedAt: now.toISOString(),
    durationSec: preset.durationMin * 60,
    exercises: [],
  };
  safeWriteLS(FIZRUK_WORKOUTS_KEY, {
    schemaVersion: 1,
    workouts: [workout, ...existingList],
  });
}

// ─── Nutrition ───────────────────────────────────────────────────────────

function applyNutritionPreset(preset: NutritionPreset) {
  const existing = safeReadLS<NutritionLogState>(NUTRITION_LOG_KEY, null);
  const base: NutritionLogState =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const today = toLocalISODate();
  const day: NutritionDay =
    base[today] && typeof base[today] === "object"
      ? { ...base[today] }
      : { meals: [] };
  const meals: NutritionMeal[] = Array.isArray(day.meals) ? [...day.meals] : [];
  const kcal = preset.kcal;
  meals.push({
    id: uid("meal"),
    demo: false,
    name: preset.name,
    time: new Date().toTimeString().slice(0, 5),
    mealType: preset.mealType || "snack",
    label: preset.name,
    macros: {
      kcal,
      protein_g: Math.round((kcal * 0.22) / 4),
      fat_g: Math.round((kcal * 0.28) / 9),
      carbs_g: Math.round((kcal * 0.5) / 4),
    },
    source: "manual",
    macroSource: "manual",
    amount_g: null,
    foodId: null,
  });
  day.meals = meals;
  base[today] = day;
  // Tracked sync key (nutrition module) — go through `syncedKV`.
  safeWriteSyncedLS(NUTRITION_LOG_KEY, base);
  dispatch(NUTRITION_LOG_EVENT);
}

export type ModuleId = "routine" | "finyk" | "nutrition" | "fizruk";

export type ModulePreset =
  | RoutinePreset
  | FinykPreset
  | NutritionPreset
  | FizrukPreset;

/**
 * Apply a preset to the matching module storage. The module id decides
 * which writer runs — the caller passes only preset fields relevant to
 * its module.
 */
export function applyPreset(moduleId: ModuleId, preset: ModulePreset) {
  switch (moduleId) {
    case "routine":
      applyRoutinePreset(preset as RoutinePreset);
      return;
    case "finyk":
      applyFinykPreset(preset as FinykPreset);
      return;
    case "nutrition":
      applyNutritionPreset(preset as NutritionPreset);
      return;
    case "fizruk":
      applyFizrukPreset(preset as FizrukPreset);
      return;
    default:
      /* noop */
      return;
  }
}
