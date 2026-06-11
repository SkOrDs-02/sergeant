/**
 * Last validated: 2026-06-11
 * Status: Active
 */

// Re-export all operation handlers from subdirectory modules
export {
  upsertWorkout,
  upsertWorkoutItem,
  upsertWorkoutSet,
  softDeleteWorkout,
} from "./workouts";

export {
  upsertCustomExercise,
  softDeleteCustomExercise,
  upsertMeasurement,
  softDeleteMeasurement,
} from "./exercises";

export {
  upsertDailyLog,
  softDeleteDailyLog,
  setMonthlyPlan,
  upsertWorkoutTemplate,
  softDeleteWorkoutTemplate,
} from "./dailyPlanTemplates";

export type { WorkoutSet } from "./workouts";