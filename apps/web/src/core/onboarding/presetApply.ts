import { toLocalISODate } from "@sergeant/shared";
import { resolveHabitGlyph } from "@sergeant/routine-domain";
import { routineStorage } from "@routine/lib/routineStorageInstance";
import {
  loadRoutineState,
  saveRoutineStateDurable,
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

// `applyRoutinePreset` no longer writes here (SQLite is canonical), but
// still reads this key as a defensive pre-warm-window fallback below —
// see the try/catch in `applyRoutinePreset`. The boot-time residual-import
// drain that ALSO used to read this key (`residualImport.ts`) was removed
// 2026-08 once no pre-beta testers were left with pre-SQLite LS data to
// migrate; that removal does not affect this fallback's own reason to
// keep the constant.
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
  habitOrder?: string[];
  completionNotes?: Record<string, unknown>;
};

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// ─── Routine ─────────────────────────────────────────────────────────────

async function applyRoutinePreset(preset: RoutinePreset): Promise<boolean> {
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
    emoji: resolveHabitGlyph(preset.emoji),
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
    habitOrder: nextOrder,
    completionNotes: base.completionNotes || {},
  };

  // Write through the canonical SQLite pipeline (updates warm cache +
  // dual-write + emits storage event) and WAIT for SQLite to confirm.
  // The fire-and-forget `saveRoutineState` would answer `true` even when
  // no dual-write context is registered — and the caller spends the
  // one-shot СТАРТ card on this answer. See `saveRoutineStateDurable`.
  return saveRoutineStateDurable(
    next as Parameters<typeof saveRoutineStateDurable>[0],
  );
}

/**
 * Apply a preset to the matching module storage.
 *
 * Only `routine` has a direct write path — other modules use the
 * `config.action` flow in `PresetSheet.tsx` (prefill + module add-sheet).
 *
 * Resolves `true` only when the entry is durably stored. `false` means the
 * caller must NOT treat the first action as spent: either the write failed,
 * or this module has no direct write path and the real save happens later
 * in the module's own add-sheet.
 */
export async function applyPreset(
  moduleId: ModuleId,
  preset: ModulePreset,
): Promise<boolean> {
  if (moduleId === "routine") {
    return applyRoutinePreset(preset as RoutinePreset);
  }
  // finyk / nutrition / fizruk: no direct write path (handled via config.action).
  return false;
}
