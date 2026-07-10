/**
 * Custom-exercise diff for the Fizruk dual-write layer (Stage 4 baseline).
 *
 * Each custom exercise is a JSON blob row in `fizruk_custom_exercises`;
 * the diff always upserts on reference change.
 */

import { diffArray } from "./diffArray";

export interface FizrukCustomExerciseSnapshot {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface CustomExerciseUpsertOp {
  readonly kind: "custom-exercise-upsert";
  readonly exercise: FizrukCustomExerciseSnapshot;
}

export interface CustomExerciseDeleteOp {
  readonly kind: "custom-exercise-delete";
  readonly exerciseId: string;
}

export type CustomExerciseOp = CustomExerciseUpsertOp | CustomExerciseDeleteOp;

export function diffCustomExercisesOps(
  prev: readonly FizrukCustomExerciseSnapshot[],
  next: readonly FizrukCustomExerciseSnapshot[],
): CustomExerciseOp[] {
  const ops: CustomExerciseOp[] = [];
  diffArray(
    prev,
    next,
    (e) => e.id,
    () => true, // always upsert on reference change — JSON blob
    (e) => ops.push({ kind: "custom-exercise-upsert", exercise: e }),
    (id) => ops.push({ kind: "custom-exercise-delete", exerciseId: id }),
  );
  return ops;
}
