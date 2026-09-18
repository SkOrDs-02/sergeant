/**
 * Shared domain types for the Fizruk Progress page.
 *
 * Kept platform-neutral so both `apps/web` and `apps/mobile` consume
 * the same selectors without pulling in DOM or React Native specifics.
 */

/**
 * Subset of {@link import("../types.js").MeasurementEntry} that the
 * Progress selectors rely on. Intentionally narrow — accepts anything
 * with an ISO `at` timestamp plus numeric/string measurement fields —
 * so callers (hooks that return loosely-typed persisted records) do
 * not need to widen/cast before passing data in.
 */
export interface ProgressMeasurementInput {
  at: string;
  weightKg?: number | string | null;
  bodyFatPct?: number | string | null;
  [key: string]: unknown;
}

/**
 * Subset of {@link import("../types.js").Workout} used by the Progress
 * KPI aggregator. A completed workout is one with a truthy `endedAt`.
 */
export interface ProgressWorkoutInput {
  startedAt?: string | null;
  endedAt?: string | null;
  items?:
    | readonly {
        exerciseId?: string | null;
        type?: string;
        sets?:
          | readonly {
              weightKg?: number | string | null;
              reps?: number | string | null;
            }[]
          | undefined;
      }[]
    | undefined;
}

/**
 * A single point on a measurement trend chart. `value` is `null` when
 * the measurement record exists but that specific field was missing,
 * so consumers (victory-native, MiniLineChart) can skip nulls without
 * re-filtering the raw entries.
 */
export interface MeasurementPoint {
  /** ISO timestamp of the source measurement entry. */
  iso: string;
  /** Numeric field value, or `null` if the field is missing/invalid. */
  value: number | null;
  /** Short locale-formatted tick label ("12 кві"). */
  label: string;
}

/** Signed delta between the two most recent numeric measurements. */
export type MeasurementDelta = number | null;

/** Aggregate KPI strip shown above the charts. */
export interface ProgressKpis {
  /** Number of completed (`endedAt` set) workouts. */
  doneCount: number;
  /** Count of unique strength exercises with a positive Epley 1RM. */
  prsCount: number;
  /** Count of measurement entries the user has logged. */
  entriesCount: number;
  /** ISO timestamp of the latest completed workout (or `null`). */
  latestWorkoutIso: string | null;
}
