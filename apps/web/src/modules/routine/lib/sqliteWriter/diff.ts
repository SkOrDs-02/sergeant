/* eslint-disable @typescript-eslint/no-non-null-assertion -- keyed Map lookups; rename-only from dualWrite/ */
import {
  habitSkipKey,
  type Habit,
  type RoutinePrefs,
  type RoutineState,
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
 *   - `routine_habit_order` (habit-order-set)
 *   - `routine_habit_skips` (habit-skip-upsert / habit-skip-delete)
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

/**
 * Append-only журнал відміток (W1-ROUTINE-APPEND, СТАДІЯ 1).
 *
 * Ця операція йде ПОРУЧ із `completion-add` / `completion-remove`, а не
 * замість них: старий шлях (`routine_entries` + soft-delete) лишається
 * недоторканим, журнал пишеться паралельно. Якщо журнал зламається —
 * продукт не помітить, бо жоден читач на нього ще не спирається.
 *
 * `state` фіксує І зняття відмітки (`'undone'`), чого стара пара
 * add/remove не вміє: soft-delete лише ховає рядок, а факт «було
 * відмічено, потім знято» зникає (audit E-1).
 */
export interface CompletionEventAppendOp {
  readonly kind: "completion-event-append";
  readonly habitId: string;
  readonly dateKey: string;
  readonly state: "done" | "undone";
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
    readonly scope?: string | undefined;
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
    readonly emoji?: string | undefined;
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

/**
 * Третій стан дня — «не зміг з причиною» (Хвиля 4, канон §5).
 *
 * Форма навмисно дзеркалить `completion-note-*`: та сама пара
 * `(habitId, dateKey)`, згорнута в композитний ключ, той самий LWW +
 * soft-delete на боці таблиці.
 */
export interface HabitSkipUpsertOp {
  readonly kind: "habit-skip-upsert";
  readonly skipKey: string;
  readonly reason: string;
  readonly note: string;
  readonly at: string;
}

export interface HabitSkipDeleteOp {
  readonly kind: "habit-skip-delete";
  readonly skipKey: string;
}

export type RoutineDualWriteOp =
  | CompletionAddOp
  | CompletionRemoveOp
  | CompletionEventAppendOp
  | HabitRenameOp
  | HabitUpsertOp
  | HabitDeleteOp
  | TagUpsertOp
  | TagDeleteOp
  | CategoryUpsertOp
  | CategoryDeleteOp
  | PrefsSetOp
  | HabitOrderSetOp
  | CompletionNoteUpsertOp
  | CompletionNoteDeleteOp
  | HabitSkipUpsertOp
  | HabitSkipDeleteOp;

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
 *   2a. completion-event-append (habitId asc, dateKey asc, state asc) —
 *       append-only журнал, W1-ROUTINE-APPEND стадія 1; іде ПІСЛЯ старих
 *       completion-ops, щоб їхній відносний порядок не змінився
 *   3. habit-rename (habitId asc)
 *   4. habit-upsert / habit-delete (habitId asc)
 *   5. tag-upsert / tag-delete (tagId asc)
 *   6. category-upsert / category-delete (categoryId asc)
 *   7. prefs-set (at most one)
 *   8. habit-order-set (at most one)
 *   9. completion-note-upsert / completion-note-delete (noteKey asc)
 *  10. habit-skip-upsert / habit-skip-delete (skipKey asc)
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
  diffHabitOrderOps(prev, next, ops);
  diffCompletionNoteOps(prev, next, ops);
  diffHabitSkipOps(prev, next, ops);

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

  ops.push(...adds, ...removes, ...buildCompletionEventOps(prevSet, nextSet));
}

/**
 * Побудувати append-only події журналу для того самого переходу.
 *
 * Свідомо НЕ перевикористовує масиви `adds` / `removes`: ті пропускають
 * add, для якого не знайшлось імені звички у `next.habits` (стара
 * денормалізація `routine_entries.name`). Журнал такої залежності не
 * має — він фіксує сирий факт, а не рядок для показу.
 *
 * Порядок детермінований (habitId, dateKey, state), щоб батч ops не
 * «плив» між прогонами і snapshot-тести write-path-у лишались стабільними.
 *
 * AI-CONTEXT: події виводяться зі ЗНІМКОВОГО diff-у `prevSet` → `nextSet`
 * (два стани `RoutineState.completions` на межі одного `saveRoutineState`),
 * а не з наміру користувача. Тому серія toggle → untoggle → toggle
 * усередині ОДНОГО збереження згортається в кінцевий стан — журнал бачить
 * лише «було відсутнє / стало присутнє» (або навпаки), а не три окремі
 * кліки. Це прийнята межа (рішення власника, W1-ROUTINE-APPEND): другий
 * write-path, що емітував би подію на кожен клік у момент дії, свідомо не
 * будується. Для стріків/відсотків/хітмапу це коректно — там важливий лише
 * кінцевий стан дня, не мікро-історія кліків усередині одного збереження.
 */
function buildCompletionEventOps(
  prevSet: Set<string>,
  nextSet: Set<string>,
): CompletionEventAppendOp[] {
  const events: CompletionEventAppendOp[] = [];

  for (const key of nextSet) {
    if (prevSet.has(key)) continue;
    const split = splitCompletionKey(key);
    if (!split) continue;
    events.push({
      kind: "completion-event-append",
      habitId: split.habitId,
      dateKey: split.dateKey,
      state: "done",
    });
  }
  for (const key of prevSet) {
    if (nextSet.has(key)) continue;
    const split = splitCompletionKey(key);
    if (!split) continue;
    events.push({
      kind: "completion-event-append",
      habitId: split.habitId,
      dateKey: split.dateKey,
      state: "undone",
    });
  }

  events.sort((a, b) => {
    if (a.habitId !== b.habitId) return a.habitId < b.habitId ? -1 : 1;
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    if (a.state !== b.state) return a.state < b.state ? -1 : 1;
    return 0;
  });
  return events;
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

function diffHabitSkipOps(
  prev: RoutineState,
  next: RoutineState,
  ops: RoutineDualWriteOp[],
): void {
  if (prev.skips === next.skips) return;
  const prevSkips = prev.skips ?? {};
  const nextSkips = next.skips ?? {};
  const upserts: HabitSkipUpsertOp[] = [];
  const deletes: HabitSkipDeleteOp[] = [];

  const habitIds = new Set([
    ...Object.keys(prevSkips),
    ...Object.keys(nextSkips),
  ]);
  for (const habitId of habitIds) {
    const prevForHabit = prevSkips[habitId] ?? {};
    const nextForHabit = nextSkips[habitId] ?? {};
    const dateKeys = new Set([
      ...Object.keys(prevForHabit),
      ...Object.keys(nextForHabit),
    ]);
    for (const dateKey of dateKeys) {
      const before = prevForHabit[dateKey];
      const after = nextForHabit[dateKey];
      // Порівняння за ЗМІСТОМ, а не за посиланням: нормалізація на
      // читанні створює нові обʼєкти щоразу, і референсна перевірка
      // народжувала б op на кожен boot.
      if (
        before &&
        after &&
        before.reason === after.reason &&
        (before.note ?? "") === (after.note ?? "") &&
        before.at === after.at
      ) {
        continue;
      }
      const skipKey = habitSkipKey(habitId, dateKey);
      if (!after) {
        deletes.push({ kind: "habit-skip-delete", skipKey });
      } else {
        upserts.push({
          kind: "habit-skip-upsert",
          skipKey,
          reason: after.reason,
          note: after.note ?? "",
          at: after.at,
        });
      }
    }
  }
  upserts.sort((a, b) =>
    a.skipKey < b.skipKey ? -1 : a.skipKey > b.skipKey ? 1 : 0,
  );
  deletes.sort((a, b) =>
    a.skipKey < b.skipKey ? -1 : a.skipKey > b.skipKey ? 1 : 0,
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
    // Хвиля 4 — датовані паузи. Порівняння за посиланням, як і в решти
    // масивів вище: reducer-и завжди повертають новий масив, а без цього
    // рядка заявлена пауза не породжувала б `habit-upsert` взагалі й
    // лишалась би тільки в локальному стані.
    prev.pauseIntervals !== next.pauseIntervals ||
    prev.createdAt !== next.createdAt
  );
}

function tagChanged(
  prev: { id: string; name: string; scope?: string | undefined },
  next: { id: string; name: string; scope?: string | undefined },
): boolean {
  return prev.name !== next.name || prev.scope !== next.scope;
}

function categoryChanged(
  prev: { id: string; name: string; emoji?: string | undefined },
  next: { id: string; name: string; emoji?: string | undefined },
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
