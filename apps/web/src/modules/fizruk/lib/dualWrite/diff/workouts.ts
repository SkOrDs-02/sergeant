/**
 * Workout-shape diff for the Fizruk dual-write layer (Stage 4 baseline).
 *
 * Mirrors the SQLite `fizruk_workouts` row shape; nested arrays
 * (`items`, `groups`, `warmup`, `cooldown`) are compared by
 * reference because the hook produces a fresh shape on every persist.
 */

import { diffArray } from "./diffArray";

export interface FizrukSetSnapshot {
  readonly weightKg: number;
  readonly reps: number;
  readonly rpe?: number | null;
  readonly [extra: string]: unknown;
}

export interface FizrukItemSnapshot {
  readonly id: string;
  readonly exerciseId: string;
  readonly nameUk: string;
  readonly primaryGroup: string;
  readonly musclesPrimary: string[];
  readonly musclesSecondary: string[];
  readonly type: string;
  readonly sets?: FizrukSetSnapshot[];
  readonly durationSec?: number;
  readonly distanceM?: number;
  readonly [extra: string]: unknown;
}

export interface FizrukWorkoutSnapshot {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly items: FizrukItemSnapshot[];
  readonly groups: { id: string; itemIds: string[] }[];
  readonly warmup: { id: string; done: boolean; label: string }[] | null;
  readonly cooldown: { id: string; done: boolean; label: string }[] | null;
  readonly note: string;
  readonly wellbeing?: {
    energy?: number | null;
    mood?: number | null;
    [k: string]: unknown;
  } | null;
  readonly [extra: string]: unknown;
}

export interface WorkoutUpsertOp {
  readonly kind: "workout-upsert";
  readonly workout: FizrukWorkoutSnapshot;
}

export interface WorkoutDeleteOp {
  readonly kind: "workout-delete";
  readonly workoutId: string;
}

export type WorkoutOp = WorkoutUpsertOp | WorkoutDeleteOp;

export function diffWorkoutsOps(
  prev: readonly FizrukWorkoutSnapshot[],
  next: readonly FizrukWorkoutSnapshot[],
): WorkoutOp[] {
  const ops: WorkoutOp[] = [];
  diffArray(
    prev,
    next,
    (w) => w.id,
    workoutChanged,
    (w) => ops.push({ kind: "workout-upsert", workout: w }),
    (id) => ops.push({ kind: "workout-delete", workoutId: id }),
  );
  return ops;
}

function workoutChanged(
  prev: FizrukWorkoutSnapshot,
  next: FizrukWorkoutSnapshot,
): boolean {
  return (
    prev.startedAt !== next.startedAt ||
    prev.endedAt !== next.endedAt ||
    prev.note !== next.note ||
    prev.items !== next.items ||
    prev.groups !== next.groups ||
    prev.warmup !== next.warmup ||
    prev.cooldown !== next.cooldown ||
    prev.wellbeing !== next.wellbeing
  );
}
