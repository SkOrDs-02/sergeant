/**
 * Hub «Рутина»: звички, теги, категорії — SQLite-backed read/persist.
 *
 * Stage 8 PR #057r-tombstone (web) — the localStorage write path is
 * retired. `loadRoutineState()` overlays the cached SQLite full-state
 * onto `defaultRoutineState()` and `saveRoutineState()` triggers the
 * dual-write pipeline (the same one Stage 10 PR #070r-dualwrite uses
 * to mirror habits / tags / categories / prefs / habitOrder /
 * completionNotes / completions to the 7 routine_* SQLite tables).
 * Residual LS data used to be drained on boot once via
 * `importRoutineResidualFromLs` (`./residualImport.ts`) before the
 * legacy `STORAGE_KEYS.ROUTINE` key was deleted — that one-time
 * pre-beta drain was removed 2026-08 once no testers were left with
 * pre-SQLite LS data to migrate (see git history for the prior
 * implementation).
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
  applyMoveHabitInOrder,
  applySetHabitOrder,
  applySetCompletionNote,
  applySetHabitSkip,
  applyClearHabitSkip,
  applyPauseHabitBetween,
  applyResumeHabitFrom,
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
  type HabitDraftPatch,
  type RoutineState,
  type Habit,
  type HabitSnapshot,
  type SkipReason,
} from "@sergeant/routine-domain";
import {
  dualWriteRoutineState,
  triggerRoutineDualWrite,
} from "./sqliteWriter/index.js";
import {
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
  setCachedSqliteCompletions,
  setCachedSqliteRoutineState,
} from "./sqliteReader.js";
import { emitHubBus } from "@shared/lib/modules/hubBus";

// Re-export key constants so web callers can keep their existing imports.
export { ROUTINE_STORAGE_KEY, ROUTINE_EVENT, ROUTINE_STORAGE_ERROR };

export function emitRoutineStorage() {
  try {
    window.dispatchEvent(new CustomEvent(ROUTINE_EVENT));
  } catch {
    /* noop */
  }
  // Notify same-tab Hub consumers (F3/F10 fix) so Hub Reports / Dashboard
  // re-aggregate immediately without waiting for a cross-tab storage event.
  emitHubBus("storageUpdated", undefined);
}

/**
 * Returns the routine state assembled from the SQLite warm caches.
 *
 * Stage 8 PR #057r-tombstone — LS read is retired. When the
 * `bootSqliteReadPath()` warm-up has populated
 * `getCachedSqliteRoutineState()` we overlay all 7 entity slices
 * (habits / tags / categories / prefs / habitOrder /
 * completionNotes / skips) onto a fresh `defaultRoutineState()`. The
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
      habitOrder: fullState.habitOrder,
      completionNotes: fullState.completionNotes,
      skips: fullState.skips,
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
    const prev = writeThroughRoutineCaches(next);
    triggerRoutineDualWrite(prev, next);
    emitRoutineStorage();
    return true;
  } catch (err) {
    emitRoutineStorageError(err);
    return false;
  }
}

/**
 * Persist routine state and RESOLVE ONLY ONCE SQLite has confirmed it.
 *
 * `saveRoutineState` returns `true` as soon as the dual-write trigger is
 * dispatched, and `triggerRoutineDualWrite` returns silently when no
 * dual-write context is registered — so a `true` there means "handed off",
 * never "stored". That is fine for a call site that only needs the warm
 * cache updated, and wrong for one that spends a one-shot UI affordance on
 * the strength of the answer.
 *
 * AI-CONTEXT: the FTUX preset tile is exactly such a call site. It burns the
 * СТАРТ hero card, and the card never comes back — so if the write never
 * reached SQLite, the visitor has traded their first action for nothing and
 * finds an empty module after reload. The spec
 * (`docs/90-work/planning/specs/anonymous-local-first-persistence.md`,
 * «Похідне правило») requires a CONFIRMED durable write before the block is
 * marked spent. This is that confirmation: `dualWriteRoutineState` resolves
 * with `status: "applied"` only after the ops actually landed, and reports
 * `"skipped"` when SQLite was unavailable or no context was registered.
 *
 * The warm-cache write-through still happens first and is deliberately NOT
 * rolled back on failure — the visitor keeps seeing what they created in the
 * current session, and the caller keeps the retry affordance on screen.
 */
export async function saveRoutineStateDurable(
  next: RoutineState,
): Promise<boolean> {
  try {
    const prev = writeThroughRoutineCaches(next);
    const outcome = await dualWriteRoutineState(prev, next);
    emitRoutineStorage();
    return outcome.status === "applied";
  } catch (err) {
    emitRoutineStorageError(err);
    return false;
  }
}

/**
 * Write-through: update the warm caches synchronously so the next
 * `loadRoutineState()` reflects the change without waiting for the async
 * dual-write → SQLite round trip. The dual-write is still authoritative on
 * boot (`refreshSqliteRoutineState` overwrites these caches with the
 * canonical SQLite read). Returns the pre-write snapshot, which
 * `diffRoutineDualWriteOps` needs as its `prev`.
 */
function writeThroughRoutineCaches(next: RoutineState): RoutineState {
  const prev = readCachedRoutineState();
  setCachedSqliteRoutineState({
    habits: next.habits,
    tags: next.tags,
    categories: next.categories,
    prefs: next.prefs,
    habitOrder: next.habitOrder,
    completionNotes: next.completionNotes,
    skips: next.skips ?? {},
  });
  setCachedSqliteCompletions(next.completions);
  return prev;
}

function emitRoutineStorageError(err: unknown): void {
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
      habitOrder: fullState.habitOrder,
      completionNotes: fullState.completionNotes,
      skips: fullState.skips,
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
  opts: Partial<CreateHabitOptions> | HabitDraftPatch = {},
): RoutineState {
  const next = applyCreateHabit(state, opts as Partial<CreateHabitOptions>);
  if (next === state) return state;
  return persist(next);
}

/** Apply a partial patch to a habit by id, persist, and return next state. */
export function updateHabit(
  state: RoutineState,
  id: string,
  patch: Partial<Habit> | HabitDraftPatch,
): RoutineState {
  return persist(applyUpdateHabit(state, id, patch as Partial<Habit>));
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

/**
 * Позначити день як «не зміг з причиною» (канон §5, третій стан).
 *
 * Взаємно виключно з відміткою виконання — домен сам зніме `completions`-ключ.
 */
export function setHabitSkip(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  reason: SkipReason,
  note?: string,
): RoutineState {
  const next = applySetHabitSkip(state, habitId, dateKey, reason, note);
  if (next === state) return state;
  return persist(next);
}

/** Зняти позначку «не зміг» — день повертається у стан «не зробив». */
export function clearHabitSkip(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const next = applyClearHabitSkip(state, habitId, dateKey);
  if (next === state) return state;
  return persist(next);
}

/** Заявити плановану паузу датованим інтервалом (канон §4). */
export function pauseHabitBetween(
  state: RoutineState,
  habitId: string,
  fromKey: string,
  toKey: string | null,
): RoutineState {
  const next = applyPauseHabitBetween(state, habitId, fromKey, toKey);
  if (next === state) return state;
  return persist(next);
}

/** Достроково завершити паузу, що накриває день. */
export function resumeHabitFrom(
  state: RoutineState,
  habitId: string,
  dateKey: string,
): RoutineState {
  const next = applyResumeHabitFrom(state, habitId, dateKey);
  if (next === state) return state;
  return persist(next);
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
    // eslint-disable-next-line no-restricted-syntax -- backup export wall-clock metadata
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
