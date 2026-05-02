import type { RoutineState } from "@sergeant/routine-domain";

/**
 * Pure-function diff between two `RoutineState` snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite (`routine_entries` table).
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/routine/lib/dualWrite/diff.ts` byte-for-byte
 * — kept duplicated until Stage 5 promotes the dual-write helpers
 * into a workspace package alongside the SPIKE library.
 *
 * See the web copy for full mapping rules and design notes.
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
 * Returns an empty list when `prev === next` (the common case for
 * reducer no-ops).
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
