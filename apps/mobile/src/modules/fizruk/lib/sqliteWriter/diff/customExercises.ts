/**
 * Custom-exercise diff for the Fizruk dual-write layer (Stage 4
 * baseline). Per-shape module-folder split from the monolithic
 * `diff.ts` — see `docs/audits/2026-05-13-mobile-reliability-ux-roast.md`
 * § P2.2a.
 *
 * The hook owns the freshness contract — any presence in the next
 * snapshot emits an upsert; absence emits a delete. The diff has no
 * intrinsic equality check beyond identity.
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
    () => true,
    (e) => ops.push({ kind: "custom-exercise-upsert", exercise: e }),
    (id) => ops.push({ kind: "custom-exercise-delete", exerciseId: id }),
  );
  return ops;
}
