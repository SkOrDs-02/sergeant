/** Hub «Рутина»: звички, теги, категорії (не-спорт), localStorage */

import { createModuleStorage } from "@shared/lib/createModuleStorage";
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

const storage = createModuleStorage({ name: "routine" });

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
 * Normalize habit order and persist if changed.
 * Legacy pushup migration is handled by storageManager (routine_001_migrate_fizruk_pushups)
 * which runs before the React tree mounts, so by the time this is called the migration is done.
 */
function finalizeLoadedRoutineState(state: RoutineState): RoutineState {
  const { state: s, changed } = ensureHabitOrder(state);
  if (changed) {
    saveRoutineState(s);
  }
  return s;
}

/**
 * Load and normalize the full routine state from localStorage.
 * Falls back to default state on parse errors or missing key.
 */
export function loadRoutineState(): RoutineState {
  const raw = storage.readJSON(ROUTINE_STORAGE_KEY, null);
  const merged = normalizeRoutineState(raw);
  return finalizeLoadedRoutineState(merged);
}

/**
 * Persist routine state to localStorage and dispatch a storage event.
 * Returns `true` on success, `false` if localStorage threw (e.g. quota exceeded).
 */
export function saveRoutineState(next: RoutineState): boolean {
  const ok = storage.writeJSON(ROUTINE_STORAGE_KEY, next);
  if (ok) {
    emitRoutineStorage();
    return true;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(ROUTINE_STORAGE_ERROR, {
        detail: { message: "save failed" },
      }),
    );
  } catch {
    /* noop */
  }
  return false;
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

// Silence TS about the unused default import for backward-compat consumers.
void defaultRoutineState;
