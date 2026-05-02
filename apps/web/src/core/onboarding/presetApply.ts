import { safeReadLS, safeWriteLS } from "@shared/lib/storage";

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

function dispatch(eventName) {
  try {
    window.dispatchEvent(new CustomEvent(eventName));
  } catch {
    /* noop */
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toLocalISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Finyk ───────────────────────────────────────────────────────────────

function applyFinykPreset(preset) {
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
  safeWriteLS(FINYK_MANUAL_EXPENSES_KEY, [entry, ...list]);
  // Keep the user out of the Monobank login gate — mirrors what
  // `enableFinykManualOnly()` does on the «Далі без банку» path.
  // `safeWriteLS` keeps raw strings as-is (no JSON.stringify) so the
  // stored value matches the legacy `localStorage.setItem(_, "1")` shape.
  safeWriteLS(FINYK_MANUAL_ONLY_KEY, "1");
}

// ─── Routine ─────────────────────────────────────────────────────────────

function applyRoutinePreset(preset) {
  const state = safeReadLS(ROUTINE_STATE_KEY, null);
  const today = toLocalISODate();
  const habit = {
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

  const base =
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

function applyFizrukPreset(preset) {
  const existing = safeReadLS(FIZRUK_WORKOUTS_KEY, null);
  const existingList = Array.isArray(existing)
    ? existing
    : existing && Array.isArray(existing.workouts)
      ? existing.workouts
      : [];
  const now = new Date();
  const startedAt = new Date(now.getTime() - preset.durationMin * 60000);
  const workout = {
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

function applyNutritionPreset(preset) {
  const existing = safeReadLS(NUTRITION_LOG_KEY, null);
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const today = toLocalISODate();
  const day =
    base[today] && typeof base[today] === "object"
      ? { ...base[today] }
      : { meals: [] };
  const meals = Array.isArray(day.meals) ? [...day.meals] : [];
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
  safeWriteLS(NUTRITION_LOG_KEY, base);
  dispatch(NUTRITION_LOG_EVENT);
}

/**
 * Apply a preset to the matching module storage. The module id decides
 * which writer runs — the caller passes only preset fields relevant to
 * its module.
 *
 * @param {"routine" | "finyk" | "nutrition" | "fizruk"} moduleId
 * @param {object} preset
 */
export function applyPreset(moduleId, preset) {
  switch (moduleId) {
    case "routine":
      applyRoutinePreset(preset);
      return;
    case "finyk":
      applyFinykPreset(preset);
      return;
    case "nutrition":
      applyNutritionPreset(preset);
      return;
    case "fizruk":
      applyFizrukPreset(preset);
      return;
    default:
      /* noop */
      return;
  }
}
