/**
 * Barrel re-export for the decomposed Fizruk dual-write diff module.
 *
 * The monolithic diff.ts was split into per-shape files under `./diff/`.
 * This file preserves the historical public API so all existing imports
 * (`from "./dualWrite/diff"`) continue to resolve unchanged.
 */

export { diffFizrukDualWriteOps } from "./diff";
export type {
  FizrukDualWriteOp,
  FizrukDualWriteState,
  FizrukSetSnapshot,
  FizrukItemSnapshot,
  FizrukWorkoutSnapshot,
  FizrukCustomExerciseSnapshot,
  FizrukMeasurementSnapshot,
  FizrukDailyLogSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukWorkoutTemplateSnapshot,
  WorkoutUpsertOp,
  WorkoutDeleteOp,
  CustomExerciseUpsertOp,
  CustomExerciseDeleteOp,
  MeasurementUpsertOp,
  MeasurementDeleteOp,
  DailyLogUpsertOp,
  DailyLogDeleteOp,
  MonthlyPlanSetOp,
  WorkoutTemplateUpsertOp,
  WorkoutTemplateDeleteOp,
} from "./diff";
