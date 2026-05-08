import type { RoutineState } from "@sergeant/routine-domain";

/**
 * Pure-function diff between two `RoutineState` snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite (`routine_entries` table).
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. The
 * orchestrator in `./index.ts` calls this on every successful
 * localStorage write whenever a dual-write context is registered.
 * Stage 8 PR #056r dropped the `feature.routine.sqlite_v2.dual_write`
 * gate — the diff/apply pipeline fires unconditionally for completion
 * ops.
 *
 * Mapping rules:
 *
 * - Habit completion **added** (a `habitId` newly appears in
 *   `state.completions[habitId]` for some `dateKey`) → upsert a row in
 *   `routine_entries` keyed by the stable id `${habitId}:${dateKey}`.
 * - Habit completion **removed** (a previously-present `(habitId,
 *   dateKey)` no longer appears) → soft-delete that same row.
 * - Habit **renamed** (same id, different `name`) → bump the
 *   denormalized `name` column on every active `routine_entries` row
 *   for that habit, so subsequent reads (PR #025) see the latest
 *   label without re-loading the LS-side `Habit[]`.
 *
 * Habit hard-delete and habit-restore both manifest as
 * completion-add / completion-remove pairs through the LS reducers
 * (`applyDeleteHabit` removes the habit's entries from
 * `state.completions`, `applyRestoreHabit` puts them back) — so the
 * diff captures them naturally without dedicated op kinds.
 *
 * The diff is intentionally lossy on streaks (`routine_streaks`):
 * those are derived data, and PR #024 keeps reads on LS, so writing
 * them now would only add noise. PR #025 (cut-over reads) will
 * extend this helper.
 */

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

export type RoutineDualWriteOp =
  | CompletionAddOp
  | CompletionRemoveOp
  | HabitRenameOp;

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

  const adds: CompletionAddOp[] = [];
  const removes: CompletionRemoveOp[] = [];
  const renames: HabitRenameOp[] = [];

  const prevHabitNames = new Map<string, string>();
  for (const h of prev.habits) prevHabitNames.set(h.id, h.name);
  const nextHabitNames = new Map<string, string>();
  for (const h of next.habits) nextHabitNames.set(h.id, h.name);

  const prevSet = buildCompletionSet(prev.completions);
  const nextSet = buildCompletionSet(next.completions);

  // Adds: in `next` but not `prev`. We look up the habit name in
  // `next` because completion-add must reflect the current label.
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

  // Removes: in `prev` but not `next`. We don't need a name here —
  // soft-delete is keyed by row id.
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

  // Renames: same id present in both, but the `name` field differs.
  for (const [habitId, nextName] of nextHabitNames) {
    const prevName = prevHabitNames.get(habitId);
    if (typeof prevName !== "string") continue;
    if (prevName === nextName) continue;
    renames.push({ kind: "habit-rename", habitId, prevName, nextName });
  }

  adds.sort(byHabitThenDate);
  removes.sort(byHabitThenDate);
  renames.sort((a, b) =>
    a.habitId < b.habitId ? -1 : a.habitId > b.habitId ? 1 : 0,
  );

  return [...adds, ...removes, ...renames];
}

/** Build the canonical id used as the SQLite primary key for completions. */
export function buildCompletionRowId(habitId: string, dateKey: string): string {
  return `${habitId}:${dateKey}`;
}

const SEPARATOR = "\u0000";

/**
 * Build the set of `${habitId}\0${dateKey}` strings present in a
 * `completions` map. NUL is used as the in-memory key separator
 * because both `habitId` (URL-safe slug) and `dateKey` (`YYYY-MM-DD`)
 * are guaranteed not to contain it — that lets `splitCompletionKey`
 * round-trip without escape logic.
 */
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
