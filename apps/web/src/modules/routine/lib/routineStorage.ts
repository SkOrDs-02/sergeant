/**
 * Hub «Рутина»: звички, теги, категорії — SQLite-backed read/persist.
 *
 * Stage 8 PR #057r-tombstone (web) — the localStorage write path is
 * retired. `loadRoutineState()` overlays the cached SQLite full-state
 * onto `defaultRoutineState()` and `saveRoutineState()` triggers the
 * dual-write pipeline (the same one Stage 10 PR #070r-dualwrite uses
 * to mirror habits / tags / categories / prefs / pushups / habitOrder /
 * completionNotes / completions to the 7 routine_* SQLite tables).
 * Residual LS data is drained on boot once via
 * `importRoutineResidualFromLs` (`./residualImport.ts`) and then the
 * legacy `STORAGE_KEYS.ROUTINE` key is deleted.
 *
 * The exported function names are unchanged so call sites across the
 * web app keep working — only the source of truth moved from LS to
 * the SQLite cache.
 */

import {
  ROUTINE_STORAGE_KEY,
  ROUTINE_EVENT,
  ROUTINE_STORAGE_ERROR,
  applyCreateTag,
  applyCreateCategory,
  applyCreateHabit,
  applyUpdateHabit,
  applySetPref,
  applyToggleHabitCompletion,
  applyMarkAllScheduledHabitsComplete,
  applySetHabitArchived,
  applyDeleteHabit,
  applyRestoreHabit,
  applyAddPushupReps,
  applyMoveHabitInOrder,
  applySetHabitOrder,
  applySetCompletionNote,
  applyUpdateTag,
  applyUpdateCategory,
  applyDeleteCategory,
  applyDeleteTag,
  snapshotHabit as snapshotHabitPure,
  normalizeRoutineState,
  ensureHabitOrder,
  defaultRoutineState,
  ROUTINE_SCHEMA_VERSION,
  type CreateHabitOptions,
  type RoutineState,
  type Habit,
  type HabitSnapshot,
} from "@sergeant/routine-domain";
import { triggerRoutineDualWrite } from "./dualWrite/index.js";
import {
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
  setCachedSqliteCompletions,
  setCachedSqliteRoutineState,
} from "./sqliteReader.js";

// Re-export key constants so web callers can keep their existing imports.
export { ROUTINE_STORAGE_KEY, ROUTINE_EVENT, ROUTINE_STORAGE_ERROR };

export function emitRoutineStorage() {
  try {
    window.dispatchEvent(new CustomEvent(ROUTINE_EVENT));
  } catch {
    /* noop */
  }
}

/**
 * Returns the routine state assembled from the SQLite warm caches.
 *
 * Stage 8 PR #057r-tombstone — LS read is retired. When the
 * `bootSqliteReadPath()` warm-up has populated
 * `getCachedSqliteRoutineState()` we overlay all 7 entity slices
 * (habits / tags / categories / prefs / pushups / habitOrder /
 * completionNotes) onto a fresh `defaultRoutineState()`. The
 * legacy `getCachedSqliteCompletions()` cache wins for
 * `completions` (it stays as source-of-truth for the
 * `routine_entries` reader so the rest of the codebase keeps
 * its O(1) lookup shape).
 *
 * If neither cache is warm yet (pre-boot window), returns
 * `defaultRoutineState()` so first-paint is deterministic.
 */
export function loadRoutineState(): RoutineState {
  const base = defaultRoutineState();

  const fullState = getCachedSqliteRoutineState();
  const completionsCache = getCachedSqliteCompletions();

  let next: RoutineState = base;

  if (fullState.refreshedAt !== null) {
    next = {
      ...base,
      habits: fullState.habits,
      tags: fullState.tags,
      categories: fullState.categories,
      prefs: { ...base.prefs, ...fullState.prefs },
      pushupsByDate: fullState.pushupsByDate,
      habitOrder: fullState.habitOrder,
      completionNotes: fullState.completionNotes,
    };
  }

  if (completionsCache.refreshedAt !== null) {
    next = { ...next, completions: completionsCache.completions };
  }

  // Idempotent: ensure the order array is canonical before handing
  // state to React. The dual-write layer mirrors the canonical order
  // back into SQLite via `saveRoutineState` if a normalization
  // happens to produce a change.
  const { state, changed } = ensureHabitOrder(next);
  if (changed) {
    saveRoutineState(state);
  }
  return state;
}

/**
 * Persist routine state via the dual-write pipeline.
 *
 * Stage 8 PR #057r-tombstone — no localStorage write. The function
 * (a) snapshots the previous state from the SQLite warm cache so
 * `diffRoutineDualWriteOps` can emit only the deltas, (b) fires the
 * fire-and-forget dual-write trigger, and (c) emits the legacy
 * `ROUTINE_EVENT` so existing same-tab subscribers (`useRoutineState`,
 * etc.) refresh their snapshots. Returns `true` whenever the trigger
 * is dispatched — SQLite latency / failures are observed via
 * dual-write telemetry, not the boolean return.
 */
export function saveRoutineState(next: RoutineState): boolean {
  try {
    const prev = readCachedRoutineState();

    // Write-through: update the warm caches synchronously so the next
    // `loadRoutineState()` reflects the change without waiting for
    // the async dual-write → SQLite round trip. The dual-write is
    // still authoritative on boot (`refreshSqliteRoutineState`
    // overwrites these caches with the canonical SQLite read).
    setCachedSqliteRoutineState({
      habits: next.habits,
      tags: next.tags,
      categories: next.categories,
      prefs: next.prefs,
      pushupsByDate: next.pushupsByDate,
      habitOrder: next.habitOrder,
      completionNotes: next.completionNotes,
    });
    setCachedSqliteCompletions(next.completions);

    triggerRoutineDualWrite(prev, next);
    emitRoutineStorage();
    return true;
  } catch (err) {
    try {
      window.dispatchEvent(
        new CustomEvent(ROUTINE_STORAGE_ERROR, {
          detail: {
            message: err instanceof Error ? err.message : "save failed",
          },
        }),
      );
    } catch {
      /* noop */
    }
    return false;
  }
}

/**
 * Snapshot the currently-cached routine state. Mirrors the structure
 * of {@link loadRoutineState} without the
 * `ensureHabitOrder` re-save that the loader performs — used by
 * {@link saveRoutineState} as the `prev` argument to
 * `diffRoutineDualWriteOps`.
 */
function readCachedRoutineState(): RoutineState {
  const base = defaultRoutineState();
  const fullState = getCachedSqliteRoutineState();
  const completionsCache = getCachedSqliteCompletions();

  let prev: RoutineState = base;
  if (fullState.refreshedAt !== null) {
    prev = {
      ...base,
      habits: fullState.habits,
      tags: fullState.tags,
      categories: fullState.categories,
      prefs: { ...base.prefs, ...fullState.prefs },
      pushupsByDate: fullState.pushupsByDate,
      habitOrder: fullState.habitOrder,
      completionNotes: fullState.completionNotes,
    };
  }
  if (completionsCache.refreshedAt !== null) {
    prev = { ...prev, completions: completionsCache.completions };
  }
  return prev;
}

/** Generic wrapper: apply a pure reducer and persist the result. */
function persist<T extends RoutineState>(next: T): T {
  saveRoutineState(next);
  return next;
}

export function createTag(state: RoutineState, name: string): RoutineState {
  const next = applyCreateTag(state, name);
  if (next === state) return state;
  return persist(next);
}

export function createCategory(
  state: RoutineState,
  name: string,
  emoji = "",
): RoutineState {
  const next = applyCreateCategory(state, name, emoji);
  if (next === state) return state;
  return persist(next);
}

/**
 * Create a new habit, append it to `state.habits`, persist, and return next state.
 * Returns original state (unchanged) if `name` is empty/blank.
 */
export function createHabit(
  state: RoutineState,
  opts: Partial<CreateHabitOptions> = {},
): RoutineState {
  const next = applyCreateHabit(state, opts);
  if (next === state) return state;
  return persist(next);
}

/** Apply a partial patch to a habit by id, persist, and return next state. */
export function updateHabit(
  state: RoutineState,
  id: string,
  patch: Partial<Habit>,
): RoutineState {
  return persist(applyUpdateHabit(state, id, patch));
}

export function setPref<K extends string>(
  state: RoutineState,
  key: K,
  value: unknown,
): RoutineState {
  return persist(applySetPref(state, key, value));
}

/**
 * Toggle a habit's completion for a given date.
 * No-op if the habit is not scheduled on that date (and it wasn't already marked).
 */
export function toggleHabitCompletion(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const next = applyToggleHabitCompletion(state, habitId, dateKey);
  if (next === state) return state;
  return persist(next);
}

/** Усі активні звички, заплановані на день, отримують відмітку (якщо ще немає). */
export function markAllScheduledHabitsComplete(
  state: RoutineState,
  dateKey: string,
): RoutineState {
  const next = applyMarkAllScheduledHabitsComplete(state, dateKey);
  if (next === state) return state;
  return persist(next);
}

export function setHabitArchived(
  state: RoutineState,
  id: string,
  archived: boolean,
): RoutineState {
  return persist(applySetHabitArchived(state, id, archived));
}

export function deleteHabit(state: RoutineState, id: string): RoutineState {
  return persist(applyDeleteHabit(state, id));
}

/**
 * Snapshot усього, що потрібно для відновлення звички після `deleteHabit`:
 * сам запис звички, її completions, notes, позиція в habitOrder.
 * Використовується undo-toast-ом у `RoutineSettingsSection`.
 */
export function snapshotHabit(
  state: RoutineState,
  id: string,
): HabitSnapshot | null {
  return snapshotHabitPure(state, id);
}

/**
 * Відновлює звичку зі знімка, отриманого `snapshotHabit`. Ідемпотентно:
 * якщо звичка з таким id уже є — повертає state без змін.
 */
export function restoreHabit(
  state: RoutineState,
  snapshot: HabitSnapshot | null | undefined,
): RoutineState {
  const next = applyRestoreHabit(state, snapshot);
  if (next === state) return state;
  return persist(next);
}

export function addPushupReps(
  state: RoutineState,
  reps: unknown,
): RoutineState {
  const next = applyAddPushupReps(state, reps);
  if (next === state) return state;
  return persist(next);
}

export function moveHabitInOrder(
  state: RoutineState,
  habitId: string,
  delta: number,
): RoutineState {
  const next = applyMoveHabitInOrder(state, habitId, delta);
  if (next === state) return state;
  return persist(next);
}

/** Повний порядок активних звичок (наприклад після drag-and-drop) */
export function setHabitOrder(
  state: RoutineState,
  orderedActiveIds: string[],
): RoutineState {
  return persist(applySetHabitOrder(state, orderedActiveIds));
}

export function setCompletionNote(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  text: string,
): RoutineState {
  const next = applySetCompletionNote(state, habitId, dateKey, text);
  if (next === state) return state;
  return persist(next);
}

/**
 * Build a JSON-serializable backup payload for the Routine module.
 */
export function buildRoutineBackupPayload() {
  return {
    kind: "hub-routine-backup" as const,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: loadRoutineState(),
  };
}

export function applyRoutineBackupPayload(parsed: unknown): void {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { kind?: unknown }).kind !== "hub-routine-backup" ||
    !(parsed as { data?: unknown }).data ||
    typeof (parsed as { data?: unknown }).data !== "object"
  ) {
    throw new Error("Некоректний файл резервної копії Рутини.");
  }
  const d = (parsed as { data: unknown }).data;
  const merged = normalizeRoutineState(d);
  const { state: s } = ensureHabitOrder(merged);
  if (!saveRoutineState(s)) {
    throw new Error(
      "Не вдалося записати дані після імпорту (наприклад, переповнення сховища).",
    );
  }
}

export function updateTag(
  state: RoutineState,
  id: string,
  newName: string,
): RoutineState {
  const next = applyUpdateTag(state, id, newName);
  if (next === state) return state;
  return persist(next);
}

export function updateCategory(
  state: RoutineState,
  id: string,
  patch: { name?: string; emoji?: string },
): RoutineState {
  return persist(applyUpdateCategory(state, id, patch));
}

export function deleteCategory(state: RoutineState, id: string): RoutineState {
  return persist(applyDeleteCategory(state, id));
}

export function deleteTag(state: RoutineState, id: string): RoutineState {
  return persist(applyDeleteTag(state, id));
}
