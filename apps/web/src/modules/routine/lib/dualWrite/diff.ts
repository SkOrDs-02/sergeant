import type {
  Habit,
  RoutinePrefs,
  RoutineState,
} from "@sergeant/routine-domain";

/**
 * Pure-function diff between two `RoutineState` snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. The
 * orchestrator in `./index.ts` calls this on every successful
 * localStorage write whenever a dual-write context is registered.
 * Stage 8 PR #056r dropped the `feature.routine.sqlite_v2.dual_write`
 * gate — the diff/apply pipeline fires unconditionally for completion
 * ops.
 *
 * **Stage 10 / PR #070r-dualwrite** extends coverage from the
 * completions-only mirror (routine_entries) to all 7 new tables
 * introduced in PR #070r-schema:
 *
 *   - `routine_habits` (habit-upsert / habit-delete)
 *   - `routine_tags` (tag-upsert / tag-delete)
 *   - `routine_categories` (category-upsert / category-delete)
 *   - `routine_prefs` (prefs-set)
 *   - `routine_pushups` (pushup-upsert)
 *   - `routine_habit_order` (habit-order-set)
 *   - `routine_completion_notes` (completion-note-upsert /
 *     completion-note-delete)
 *
 * The original completion-add / completion-remove / habit-rename ops
 * remain unchanged for backward compatibility with the
 * `routine_entries` table.
 */

// -----------------------------------------------------------------------
// Legacy op types (completion-add / completion-remove / habit-rename)
// -----------------------------------------------------------------------

export interface CompletionAddOp {
  readonly kind: "completion-add";
  readonly habitId: string;
  readonly habitName: string;
  readonly dateKey: string;
}

export interface CompletionRemoveOp {
  readonly kind: "completion-remove";
  readonly habitId: string;
  readonly dateKey: string;
}

export interface HabitRenameOp {
  readonly kind: "habit-rename";
  readonly habitId: string;
  readonly prevName: string;
  readonly nextName: string;
}

// -----------------------------------------------------------------------
// Stage 10 op types
// -----------------------------------------------------------------------

export interface HabitUpsertOp {
  readonly kind: "habit-upsert";
  readonly habit: Habit;
}

export interface HabitDeleteOp {
  readonly kind: "habit-delete";
  readonly habitId: string;
}

export interface TagUpsertOp {
  readonly kind: "tag-upsert";
  readonly tag: {
    readonly id: string;
    readonly name: string;
    readonly scope?: string;
  };
}

export interface TagDeleteOp {
  readonly kind: "tag-delete";
  readonly tagId: string;
}

export interface CategoryUpsertOp {
  readonly kind: "category-upsert";
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly emoji?: string;
  };
}

export interface CategoryDeleteOp {
  readonly kind: "category-delete";
  readonly categoryId: string;
}

export interface PrefsSetOp {
  readonly kind: "prefs-set";
  readonly prefs: RoutinePrefs;
}

export interface PushupUpsertOp {
  readonly kind: "pushup-upsert";
  readonly dateKey: string;
  readonly reps: number;
}

export interface HabitOrderSetOp {
  readonly kind: "habit-order-set";
  readonly orderedIds: readonly string[];
}

export interface CompletionNoteUpsertOp {
  readonly kind: "completion-note-upsert";
  readonly noteKey: string;
  readonly note: string;
}

export interface CompletionNoteDeleteOp {
  readonly kind: "completion-note-delete";
  readonly noteKey: string;
}

export type RoutineDualWriteOp =
  | CompletionAddOp
  | CompletionRemoveOp
  | HabitRenameOp
  | HabitUpsertOp
  | HabitDeleteOp
  | TagUpsertOp
  | TagDeleteOp
  | CategoryUpsertOp
  | CategoryDeleteOp
  | PrefsSetOp
  | PushupUpsertOp
  | HabitOrderSetOp
  | CompletionNoteUpsertOp
  | CompletionNoteDeleteOp;

/**
 * Compute the dual-write operation list for the transition `prev → next`.
 *
 * Identity short-cut: if the same reference is passed for both states
 * (the common case when an LS-reducer returned `state` unchanged) the
 * function returns an empty list immediately.
 *
 * Stable iteration order:
 *
 *   1. completion-add (habitId asc, dateKey asc)
 *   2. completion-remove (habitId asc, dateKey asc)
 *   3. habit-rename (habitId asc)
 *   4. habit-upsert / habit-delete (habitId asc)
 *   5. tag-upsert / tag-delete (tagId asc)
 *   6. category-upsert / category-delete (categoryId asc)
 *   7. prefs-set (at most one)
 *   8. pushup-upsert (dateKey asc)
 *   9. habit-order-set (at most one)
 *  10. completion-note-upsert / completion-note-delete (noteKey asc)
 *
 * — so adapter callers can rely on a deterministic apply order, which
 * matters when several SQLite writes target the same row id (e.g. a
 * remove + add of the same `(habitId, dateKey)` after `applyDeleteHabit`
 * + `applyRestoreHabit`).
 */
export function diffRoutineDualWriteOps(
  prev: RoutineState,
  next: RoutineState,
): RoutineDualWriteOp[] {
  if (prev === next) return [];

  const ops: RoutineDualWriteOp[] = [];

  // --- Legacy: completion-add / completion-remove / habit-rename ---
  diffCompletionOps(prev, next, ops);
  diffHabitRenameOps(prev, next, ops);

  // --- Stage 10: full-state entity ops ---
  diffHabitEntityOps(prev, next, ops);
  diffTagOps(prev, next, ops);
  diffCategoryOps(prev, next, ops);
  diffPrefsOps(prev, next, ops);
  diffPushupOps(prev, next, ops);
  diffHabitOrderOps(prev, next, ops);
  diffCompletionNoteOps(prev, next, ops);

  return ops;
}

/** Build the canonical id used as the SQLite primary key for completions. */
export function buildCompletionRowId(habitId: string, dateKey: string): string {
  return `${habitId}:${dateKey}`;
}

// -----------------------------------------------------------------------
// Legacy diff helpers
// -----------------------------------------------------------------------

function diffCompletionOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  const nextHabitNames = new Map<string, string>();
  for (const h of next.habits) nextHabitNames.set(h.id, h.name);

  const prevSet = buildCompletionSet(prev.completions);
  const nextSet = buildCompletionSet(next.completions);

  const adds: CompletionAddOp[] = [];
  for (const key of nextSet) {
    if (prevSet.has(key)) continue;
    const split = splitCompletionKey(key);
    if (!split) continue;
    const name = nextHabitNames.get(split.habitId);
    if (typeof name !== "string") continue;
    adds.push({
      kind: "completion-add",
      habitId: split.habitId,
      habitName: name,
      dateKey: split.dateKey,
    });
  }
  adds.sort(byHabitThenDate);

  const removes: CompletionRemoveOp[] = [];
  for (const key of prevSet) {
    if (nextSet.has(key)) continue;
    const split = splitCompletionKey(key);
    if (!split) continue;
    removes.push({
      kind: "completion-remove",
      habitId: split.habitId,
      dateKey: split.dateKey,
    });
  }
  removes.sort(byHabitThenDate);

  ops.push(...adds, ...removes);
}

function diffHabitRenameOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  const prevNames = new Map<string, string>();
  for (const h of prev.habits) prevNames.set(h.id, h.name);
  const nextNames = new Map<string, string>();
  for (const h of next.habits) nextNames.set(h.id, h.name);

  const renames: HabitRenameOp[] = [];
  for (const [habitId, nextName] of nextNames) {
    const prevName = prevNames.get(habitId);
    if (typeof prevName !== "string") continue;
    if (prevName === nextName) continue;
    renames.push({ kind: "habit-rename", habitId, prevName, nextName });
  }
  renames.sort((a, b) =>
    a.habitId < b.habitId ? -1 : a.habitId > b.habitId ? 1 : 0,
  );
  ops.push(...renames);
}

// -----------------------------------------------------------------------
// Stage 10 diff helpers
// -----------------------------------------------------------------------

function diffHabitEntityOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  diffEntityArray(
    prev.habits,
    next.habits,
    (h) => h.id,
    habitChanged,
    (h) => ops.push({ kind: "habit-upsert", habit: h }),
    (id) => ops.push({ kind: "habit-delete", habitId: id }),
  );
}

function diffTagOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  diffEntityArray(
    prev.tags,
    next.tags,
    (t) => t.id,
    tagChanged,
    (t) => ops.push({ kind: "tag-upsert", tag: t }),
    (id) => ops.push({ kind: "tag-delete", tagId: id }),
  );
}

function diffCategoryOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  diffEntityArray(
    prev.categories,
    next.categories,
    (c) => c.id,
    categoryChanged,
    (c) => ops.push({ kind: "category-upsert", category: c }),
    (id) => ops.push({ kind: "category-delete", categoryId: id }),
  );
}

function diffPrefsOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  if (prev.prefs === next.prefs) return;
  if (JSON.stringify(prev.prefs) === JSON.stringify(next.prefs)) return;
  ops.push({ kind: "prefs-set", prefs: next.prefs });
}

function diffPushupOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  if (prev.pushupsByDate === next.pushupsByDate) return;
  const pushups: PushupUpsertOp[] = [];
  const allKeys = new Set([
    ...Object.keys(prev.pushupsByDate ?? {}),
    ...Object.keys(next.pushupsByDate ?? {}),
  ]);
  for (const dateKey of allKeys) {
    const prevVal = (prev.pushupsByDate ?? {})[dateKey] ?? 0;
    const nextVal = (next.pushupsByDate ?? {})[dateKey] ?? 0;
    if (prevVal !== nextVal) {
      pushups.push({ kind: "pushup-upsert", dateKey, reps: nextVal });
    }
  }
  pushups.sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  );
  ops.push(...pushups);
}

function diffHabitOrderOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  if (prev.habitOrder === next.habitOrder) return;
  const prevOrder = prev.habitOrder ?? [];
  const nextOrder = next.habitOrder ?? [];
  if (
    prevOrder.length === nextOrder.length &&
    prevOrder.every((id, i) => id === nextOrder[i])
  ) {
    return;
  }
  ops.push({ kind: "habit-order-set", orderedIds: nextOrder });
}

function diffCompletionNoteOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  if (prev.completionNotes === next.completionNotes) return;
  const prevNotes = prev.completionNotes ?? {};
  const nextNotes = next.completionNotes ?? {};
  const upserts: CompletionNoteUpsertOp[] = [];
  const deletes: CompletionNoteDeleteOp[] = [];
  const allKeys = new Set([
    ...Object.keys(prevNotes),
    ...Object.keys(nextNotes),
  ]);
  for (const noteKey of allKeys) {
    const prevVal = prevNotes[noteKey] ?? "";
    const nextVal = nextNotes[noteKey] ?? "";
    if (prevVal === nextVal) continue;
    if (nextVal.trim() === "") {
      deletes.push({ kind: "completion-note-delete", noteKey });
    } else {
      upserts.push({ kind: "completion-note-upsert", noteKey, note: nextVal });
    }
  }
  upserts.sort((a, b) =>
    a.noteKey < b.noteKey ? -1 : a.noteKey > b.noteKey ? 1 : 0,
  );
  deletes.sort((a, b) =>
    a.noteKey < b.noteKey ? -1 : a.noteKey > b.noteKey ? 1 : 0,
  );
  ops.push(...upserts, ...deletes);
}

// -----------------------------------------------------------------------
// Generic entity-array diff (mirrors Fizruk's `diffArray`)
// -----------------------------------------------------------------------

function diffEntityArray<T extends { readonly id: string }>(
  prev: readonly T[],
  next: readonly T[],
  getId: (item: T) => string,
  hasChanged: (prev: T, next: T) => boolean,
  onUpsert: (item: T) => void,
  onDelete: (id: string) => void,
): void {
  const prevMap = new Map<string, T>();
  for (const item of prev) prevMap.set(getId(item), item);
  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(getId(item), item);

  const sortedNextIds = [...nextMap.keys()].sort();
  for (const id of sortedNextIds) {
    const nextItem = nextMap.get(id)!;
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      onUpsert(nextItem);
    } else if (prevItem !== nextItem && hasChanged(prevItem, nextItem)) {
      onUpsert(nextItem);
    }
  }

  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      onDelete(id);
    }
  }
}

function habitChanged(prev: Habit, next: Habit): boolean {
  return (
    prev.name !== next.name ||
    prev.emoji !== next.emoji ||
    prev.categoryId !== next.categoryId ||
    prev.archived !== next.archived ||
    prev.paused !== next.paused ||
    prev.recurrence !== next.recurrence ||
    prev.startDate !== next.startDate ||
    prev.endDate !== next.endDate ||
    prev.timeOfDay !== next.timeOfDay ||
    prev.tagIds !== next.tagIds ||
    prev.reminderTimes !== next.reminderTimes ||
    prev.weekdays !== next.weekdays ||
    prev.createdAt !== next.createdAt
  );
}

function tagChanged(
  prev: { id: string; name: string; scope?: string },
  next: { id: string; name: string; scope?: string },
): boolean {
  return prev.name !== next.name || prev.scope !== next.scope;
}

function categoryChanged(
  prev: { id: string; name: string; emoji?: string },
  next: { id: string; name: string; emoji?: string },
): boolean {
  return prev.name !== next.name || prev.emoji !== next.emoji;
}

// -----------------------------------------------------------------------
// Completion set helpers (unchanged from PR #024)
// -----------------------------------------------------------------------

const SEPARATOR = "\u0000";

function buildCompletionSet(
  completions: Record<string, string[]> | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!completions || typeof completions !== "object") return out;
  for (const [habitId, dateKeys] of Object.entries(completions)) {
    if (!Array.isArray(dateKeys)) continue;
    for (const dk of dateKeys) {
      if (typeof dk !== "string" || dk.length === 0) continue;
      out.add(`${habitId}${SEPARATOR}${dk}`);
    }
  }
  return out;
}

function splitCompletionKey(
  key: string,
): { habitId: string; dateKey: string } | null {
  const idx = key.indexOf(SEPARATOR);
  if (idx <= 0 || idx === key.length - 1) return null;
  return { habitId: key.slice(0, idx), dateKey: key.slice(idx + 1) };
}

function byHabitThenDate(
  a: CompletionAddOp | CompletionRemoveOp,
  b: CompletionAddOp | CompletionRemoveOp,
): number {
  if (a.habitId !== b.habitId) return a.habitId < b.habitId ? -1 : 1;
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
  return 0;
}
