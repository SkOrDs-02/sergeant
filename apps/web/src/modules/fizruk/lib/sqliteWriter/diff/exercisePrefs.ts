/**
 * Дифф памʼяті типу виміру вправи (`fizruk_exercise_prefs`, міграція 173,
 * спека `docs/work/specs/fizruk-exercise-measure-type.md`, зріз 5).
 *
 * Рядок на вправу: `id` = id вправи, `measure` = тип, обраний людиною.
 * Зникнення рядка = soft-delete, тобто «повернути дефолт каталогу».
 */

import type { ExerciseMeasure } from "@sergeant/fizruk-domain/domain";

import { diffArray } from "./diffArray";

export interface FizrukExercisePrefSnapshot {
  readonly id: string;
  readonly measure: ExerciseMeasure;
}

export interface ExercisePrefUpsertOp {
  readonly kind: "exercise-pref-upsert";
  readonly pref: FizrukExercisePrefSnapshot;
}

export interface ExercisePrefDeleteOp {
  readonly kind: "exercise-pref-delete";
  readonly exerciseId: string;
}

export type ExercisePrefOp = ExercisePrefUpsertOp | ExercisePrefDeleteOp;

export function diffExercisePrefsOps(
  prev: readonly FizrukExercisePrefSnapshot[] | undefined,
  next: readonly FizrukExercisePrefSnapshot[] | undefined,
): ExercisePrefOp[] {
  const ops: ExercisePrefOp[] = [];
  diffArray(
    prev ?? [],
    next ?? [],
    (p) => p.id,
    (a, b) => a.measure !== b.measure,
    (p) => ops.push({ kind: "exercise-pref-upsert", pref: p }),
    (id) => ops.push({ kind: "exercise-pref-delete", exerciseId: id }),
  );
  return ops;
}
