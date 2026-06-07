/**
 * Pure-function diff between two Fizruk LS-state snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. The
 * orchestrator in `./index.ts` calls this on every successful
 * localStorage write. Stage 8 PR #056f dropped the
 * `feature.fizruk.sqlite_v2.dual_write` gate — the SQLite mirror is
 * now unconditional whenever a dual-write context is registered.
 *
 * Six entity classes are tracked:
 *
 *   1. **Workouts** — `Workout[]` persisted under
 *      `WORKOUTS_STORAGE_KEY`. Each workout contains nested
 *      `items: WorkoutItem[]` and each item contains nested
 *      `sets: WorkoutSet[]`. The diff flattens the tree into per-row
 *      ops for `fizruk_workouts`, `fizruk_workout_items`, and
 *      `fizruk_workout_sets`.
 *
 *   2. **Custom exercises** — `ExerciseDef[]` persisted under
 *      `CUSTOM_EXERCISES_KEY`. Stored as JSON blob per row in
 *      `fizruk_custom_exercises`.
 *
 *   3. **Measurements** — `MeasurementEntry[]` persisted under
 *      `MEASUREMENTS_STORAGE_KEY`. One row per measurement session in
 *      `fizruk_measurements`.
 *
 *   4. **Daily log** — `DailyLogEntry[]` persisted under
 *      `STORAGE_KEYS.FIZRUK_DAILY_LOG`. One row per entry in
 *      `fizruk_daily_log`. Stage 12 / PR #070f-dualwrite.
 *
 *   5. **Monthly plan** — singleton state persisted under
 *      `MONTHLY_PLAN_STORAGE_KEY`. The whole document is serialized
 *      to JSON (`data_json`). Stage 12 / PR #070f-dualwrite.
 *
 *   6. **Workout templates** — `WorkoutTemplate[]` persisted under
 *      `STORAGE_KEYS.FIZRUK_TEMPLATES`. One row per template in
 *      `fizruk_workout_templates`. Stage 12 / PR #070f-dualwrite.
 */

import { diffCustomExercisesOps } from "./customExercises";
import { diffDailyLogOps } from "./dailyLog";
import { diffMeasurementsOps } from "./measurements";
import { diffMonthlyPlanOps } from "./monthlyPlan";
import { diffWorkoutTemplatesOps } from "./workoutTemplates";
import { diffWorkoutsOps } from "./workouts";

import type {
  CustomExerciseDeleteOp,
  CustomExerciseUpsertOp,
  FizrukCustomExerciseSnapshot,
} from "./customExercises";
import type {
  DailyLogDeleteOp,
  DailyLogUpsertOp,
  FizrukDailyLogSnapshot,
} from "./dailyLog";
import type {
  FizrukMeasurementSnapshot,
  MeasurementDeleteOp,
  MeasurementUpsertOp,
} from "./measurements";
import type {
  FizrukMonthlyPlanSnapshot,
  MonthlyPlanSetOp,
} from "./monthlyPlan";
import type {
  FizrukWorkoutTemplateSnapshot,
  WorkoutTemplateDeleteOp,
  WorkoutTemplateUpsertOp,
} from "./workoutTemplates";
import type {
  FizrukItemSnapshot,
  FizrukSetSnapshot,
  FizrukWorkoutSnapshot,
  WorkoutDeleteOp,
  WorkoutUpsertOp,
} from "./workouts";

// Public re-exports ------------------------------------------------------
// Preserves the historical surface of `from "./dualWrite/diff"`.

export type {
  CustomExerciseDeleteOp,
  CustomExerciseUpsertOp,
  DailyLogDeleteOp,
  DailyLogUpsertOp,
  FizrukCustomExerciseSnapshot,
  FizrukDailyLogSnapshot,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukSetSnapshot,
  FizrukWorkoutSnapshot,
  FizrukWorkoutTemplateSnapshot,
  MeasurementDeleteOp,
  MeasurementUpsertOp,
  MonthlyPlanSetOp,
  WorkoutDeleteOp,
  WorkoutTemplateDeleteOp,
  WorkoutTemplateUpsertOp,
  WorkoutUpsertOp,
};

export type FizrukDualWriteOp =
  | WorkoutUpsertOp
  | WorkoutDeleteOp
  | CustomExerciseUpsertOp
  | CustomExerciseDeleteOp
  | MeasurementUpsertOp
  | MeasurementDeleteOp
  | DailyLogUpsertOp
  | DailyLogDeleteOp
  | MonthlyPlanSetOp
  | WorkoutTemplateUpsertOp
  | WorkoutTemplateDeleteOp;

// -----------------------------------------------------------------------
// State shape
// -----------------------------------------------------------------------

export interface FizrukDualWriteState {
  readonly workouts: readonly FizrukWorkoutSnapshot[];
  readonly customExercises: readonly FizrukCustomExerciseSnapshot[];
  readonly measurements: readonly FizrukMeasurementSnapshot[];
  /**
   * Daily-log entries keyed by `id`. Stage 12 / PR #070f-dualwrite.
   */
  readonly dailyLog: readonly FizrukDailyLogSnapshot[];
  /**
   * Monthly-plan singleton. `null` means «no row in
   * `fizruk_monthly_plan` yet». Stage 12 / PR #070f-dualwrite.
   */
  readonly monthlyPlan: FizrukMonthlyPlanSnapshot | null;
  /**
   * Workout-template entries keyed by `id`. Stage 12 / PR #070f-dualwrite.
   */
  readonly workoutTemplates: readonly FizrukWorkoutTemplateSnapshot[];
}

// -----------------------------------------------------------------------
// Orchestrator
// -----------------------------------------------------------------------

/**
 * Compute the dual-write operation list for the transition `prev → next`.
 *
 * Stable iteration order:
 *   1. workout-upsert / workout-delete (by id asc)
 *   2. custom-exercise-upsert / custom-exercise-delete (by id asc)
 *   3. measurement-upsert / measurement-delete (by id asc)
 *   4. daily-log-upsert / daily-log-delete (by id asc)
 *   5. monthly-plan-set (at most one)
 *   6. workout-template-upsert / workout-template-delete (by id asc)
 */
export function diffFizrukDualWriteOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): FizrukDualWriteOp[] {
  return [
    ...diffWorkoutsOps(prev.workouts, next.workouts),
    ...diffCustomExercisesOps(prev.customExercises, next.customExercises),
    ...diffMeasurementsOps(prev.measurements, next.measurements),
    ...diffDailyLogOps(prev.dailyLog, next.dailyLog),
    ...diffMonthlyPlanOps(prev.monthlyPlan, next.monthlyPlan),
    ...diffWorkoutTemplatesOps(prev.workoutTemplates, next.workoutTemplates),
  ];
}
