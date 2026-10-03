/**
 * Workout-template diff for the Fizruk dual-write layer (Stage 12 /
 * PR #070f-mobile-dualwrite). Per-shape module-folder split from
 * the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * Mirrors the SQLite `fizruk_workout_templates` row shape; nested
 * arrays (`exerciseIds`, `groups`) are compared by reference (the
 * hook always produces fresh arrays on persist), and the LWW guard
 * uses `updatedAt`.
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
  prev: readonly FizrukWorkoutTemplateSnapshot[] | undefined,
  next: readonly FizrukWorkoutTemplateSnapshot[] | undefined,
): WorkoutTemplateOp[] {
  const ops: WorkoutTemplateOp[] = [];
  diffArray(
    prev ?? [],
    next ?? [],
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
