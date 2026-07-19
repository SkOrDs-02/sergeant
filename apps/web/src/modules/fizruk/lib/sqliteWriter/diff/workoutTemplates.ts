/**
 * Workout-template diff for the Fizruk dual-write layer
 * (Stage 12 / PR #070f-dualwrite).
 *
 * Per-row upsert to `fizruk_workout_templates`. `exerciseIds` and `groups`
 * are compared by reference; the hook always replaces the arrays on every
 * persist.
 */

import { diffArray } from "./diffArray";

export interface FizrukWorkoutTemplateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly exerciseIds: readonly string[];
  readonly groups: readonly unknown[];
  readonly updatedAt: string;
  readonly lastUsedAt?: string | null;
}

export interface WorkoutTemplateUpsertOp {
  readonly kind: "workout-template-upsert";
  readonly template: FizrukWorkoutTemplateSnapshot;
}

export interface WorkoutTemplateDeleteOp {
  readonly kind: "workout-template-delete";
  readonly templateId: string;
}

export type WorkoutTemplateOp =
  WorkoutTemplateUpsertOp | WorkoutTemplateDeleteOp;

export function diffWorkoutTemplatesOps(
  prev: readonly FizrukWorkoutTemplateSnapshot[],
  next: readonly FizrukWorkoutTemplateSnapshot[],
): WorkoutTemplateOp[] {
  const ops: WorkoutTemplateOp[] = [];
  diffArray(
    prev,
    next,
    (t) => t.id,
    workoutTemplateChanged,
    (t) => ops.push({ kind: "workout-template-upsert", template: t }),
    (id) => ops.push({ kind: "workout-template-delete", templateId: id }),
  );
  return ops;
}

function workoutTemplateChanged(
  prev: FizrukWorkoutTemplateSnapshot,
  next: FizrukWorkoutTemplateSnapshot,
): boolean {
  return (
    prev.name !== next.name ||
    prev.exerciseIds !== next.exerciseIds ||
    prev.groups !== next.groups ||
    prev.updatedAt !== next.updatedAt ||
    (prev.lastUsedAt ?? null) !== (next.lastUsedAt ?? null)
  );
}
