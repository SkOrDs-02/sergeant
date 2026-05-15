/**
 * Shared types for the Fizruk Workouts mobile port.
 *
 * Re-uses the core `Workout` / `WorkoutItem` / `WorkoutSet` shapes from
 * `../types.js` (the existing web + mobile persistence format) and
 * extends them with the active-set editor draft shape the mobile
 * page uses today. RPE is optional because legacy entries do not
 * carry it — writes default to `null` on skip and numeric values are
 * clamped to the 1..10 Borg range.
 */

import type {
  Workout,
  WorkoutItem,
  WorkoutItemType,
  WorkoutSet,
} from "../types.js";

export type { Workout, WorkoutItem, WorkoutItemType, WorkoutSet };

/**
 * Exercise entry as it lives in the local catalogue JSON (with
 * nested `name` / `muscles` objects). Mirrored from
 * `@sergeant/fizruk-domain/data` so the page can consume custom and
 * built-in entries interchangeably without importing the data module
 * transitively.
 */
export interface WorkoutExerciseCatalogEntry {
  id: string;
  name?: { uk?: string; en?: string };
  primaryGroup?: string;
  primaryGroupUk?: string;
  muscles?: { primary?: string[]; secondary?: string[] };
  aliases?: string[];
  description?: string;
  equipment?: string[];
  [extra: string]: unknown;
}

/** Active-set editor draft — weight / reps / optional RPE. */
export interface WorkoutSetDraft {
  weightKg: number;
  reps: number;
  /** Borg 1..10 RPE. Omitted when the user has not filled it in. */
  rpe?: number | null;
}

/** Shape of per-field validation errors for the active-set form. */
export interface WorkoutSetDraftErrors {
  weightKg?: string;
  reps?: string;
  rpe?: string;
}

/** Bucket of workouts keyed by their local-date `YYYY-MM-DD` prefix. */
export type WorkoutsByDate = Record<string, Workout[]>;

/** Grouped-catalogue bucket used by the `ExerciseCatalogList`. */
export interface WorkoutCatalogGroup {
  /** Primary-group id (`chest`, `back`, …). */
  id: string;
  /** Localised label for the header. */
  label: string;
  /** Up to `limit` exercises matching the filter, stable-sorted. */
  items: WorkoutExerciseCatalogEntry[];
  /** Unfiltered count for the header chip. */
  total: number;
}

/** Aggregated summary of a single workout (used by journal rows). */
export interface WorkoutSummary {
  itemCount: number;
  setCount: number;
  tonnageKg: number;
  durationSec: number | null;
  isFinished: boolean;
}

/**
 * Minimum-shape input for the strength/duration aggregators in
 * `journal.ts`. Both the strict domain `Workout` and partial mobile
 * shapes (e.g. `apps/mobile/src/modules/fizruk/hooks/useFizrukWorkouts.ts`
 * `FizrukWorkout` with optional `exerciseId`/`nameUk`) are structurally
 * assignable — the selectors only read `items[].type` and
 * `items[].sets[].{weightKg,reps}`. Exported so consumers can type
 * adapters explicitly instead of reaching for `as unknown as Workout`.
 */
export interface WorkoutSetLike {
  weightKg?: unknown;
  reps?: unknown;
}

export interface WorkoutItemLike {
  type?: string;
  sets?: ReadonlyArray<WorkoutSetLike | null | undefined>;
}

export interface WorkoutSummaryInput {
  startedAt?: string;
  endedAt?: string | null;
  items?: ReadonlyArray<WorkoutItemLike | null | undefined>;
}

/**
 * Minimum-shape input for `buildWorkoutJournalSections` (and the
 * private grouping helpers it calls). Pass-through generic — the
 * caller's wider workout type is preserved on the way out so that
 * mobile render code keeps its concrete `FizrukWorkout` shape.
 */
export interface WorkoutForJournal {
  id: string;
  startedAt: string;
}
