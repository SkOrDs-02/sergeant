/**
 * Types for the monthly plan (calendar) sub-domain of Fizruk.
 *
 * Pure / DOM-free. Shared by the web `useMonthlyPlan` hook and the
 * mobile `useMonthlyPlan` / `PlanCalendar` screen. All storage I/O
 * lives in the respective apps — this file only describes shapes.
 */

/** A single day's monthly-plan entry. */
export interface MonthlyPlanDay {
  /** Id of the `WorkoutTemplate` assigned to this date. */
  templateId: string;
}

/**
 * Persisted monthly-plan state.
 *
 * - `days` is keyed by local ISO date (`"YYYY-MM-DD"`).
 * - `reminderHour` / `reminderMinute` use local wall-clock time
 *   (0–23 / 0–59). Validation lives in `reducers.applySetReminder`.
 */
export interface MonthlyPlanState {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  days: Record<string, MonthlyPlanDay>;
}

/**
 * Loose shape for "a workout record we can bucket by date". Both the
 * web `useWorkouts` payload and the mobile MMKV-backed list satisfy it;
 * anything beyond `startedAt` / `planned` is untyped here so callers
 * can pass their full `Workout` through without casting.
 */
export interface PlannedWorkoutLike {
  id: string;
  startedAt?: string | null;
  planned?: boolean | null;
  note?: string | null;
  items?: Array<{ id: string } & Record<string, unknown>> | null;
  [key: string]: unknown;
}

/** Map of local-date key → ordered list of planned workouts on that date. */
export type PlannedByDate = Record<string, PlannedWorkoutLike[]>;

/** Calendar cursor (year + 0-indexed month) used by `monthGrid`. */
export interface MonthCursor {
  y: number;
  m: number;
}

/** Result of `monthGrid(y, m)` — 6×7 = 42-cell Monday-first grid. */
export interface MonthGridResult {
  cells: Array<number | null>;
}
