import { toLocalISODate } from "@sergeant/shared";
import { routineStorage } from "@routine/lib/routineStorageInstance";
import {
  loadRoutineState,
  saveRoutineState,
} from "@routine/lib/routineStorage";

// Writes a single preset entry into the module's storage. This is how the
// FTUX PresetSheet turns "tap a tile" into a real (non-demo) routine entry
// without forcing the user into a module's full input wizard first.
//
// `applyFinykPreset`, `applyFizrukPreset`, and `applyNutritionPreset` were
// removed in dualwrite-teardown Phase 3 cleanup — they were confirmed dead
// code (PresetSheet.tsx uses the `config.action` path for those modules as
// of the 2026-07-05 staging audit). `applyRoutinePreset` is the only live
// path: it now goes through `saveRoutineState` (canonical SQLite writer)
// instead of the tombstoned `hub_routine_v1` LS key.

// Kept for demo-seed bootstrap compatibility (residualImport drains this
// key into SQLite on boot). applyRoutinePreset no longer writes here, but
// the constant is preserved so residualImport.ts keeps functioning.
const ROUTINE_STATE_KEY = "hub_routine_v1";

export type RoutinePreset = {
  name: string;
  emoji?: string;
};

// Kept for PresetSheet.tsx type-compatibility — the catalog covers all four
// modules even though applyPreset is only callable for "routine".
export type ModuleId = "routine" | "finyk" | "nutrition" | "fizruk";

export type ModulePreset = RoutinePreset | Record<string, unknown>;

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

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// ─── Routine ─────────────────────────────────────────────────────────────

function applyRoutinePreset(preset: RoutinePreset) {
  // Read current state from the SQLite warm cache (canonical path after
  // Stage-8 tombstone). Falls back to the LS tombstone key only in the
  // pre-warm window (extremely unlikely in FTUX context, but safe).
  let state: RoutineState | null = null;
  try {
    state = loadRoutineState() as RoutineState;
  } catch {
    state = routineStorage.readJSON<RoutineState>(ROUTINE_STATE_KEY, null);
  }

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

  const next: RoutineState = {
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
  };

  // Write through the canonical SQLite pipeline (updates warm cache +
  // triggers dual-write + emits storage event). No raw LS write needed.
  saveRoutineState(next as Parameters<typeof saveRoutineState>[0]);
}

/**
 * Apply a preset to the matching module storage.
 *
 * Only `routine` has a direct write path — other modules use the
 * `config.action` flow in `PresetSheet.tsx` (prefill + module add-sheet).
 */
export function applyPreset(moduleId: ModuleId, preset: ModulePreset) {
  if (moduleId === "routine") {
    applyRoutinePreset(preset as RoutinePreset);
  }
  // finyk / nutrition / fizruk: no direct write path (handled via config.action).
}
