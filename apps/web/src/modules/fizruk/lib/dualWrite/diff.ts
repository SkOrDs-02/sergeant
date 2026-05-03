/**
 * Pure-function diff between two Fizruk LS-state snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. The
 * orchestrator in `./index.ts` calls this on every successful
 * localStorage write when the user has opted in via the
 * `feature.fizruk.sqlite_v2.dual_write` flag.
 *
 * Three entity classes are tracked:
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
 */

// -----------------------------------------------------------------------
// Op types
// -----------------------------------------------------------------------

export interface WorkoutUpsertOp {
  readonly kind: "workout-upsert";
  readonly workout: FizrukWorkoutSnapshot;
}

export interface WorkoutDeleteOp {
  readonly kind: "workout-delete";
  readonly workoutId: string;
}

export interface CustomExerciseUpsertOp {
  readonly kind: "custom-exercise-upsert";
  readonly exercise: FizrukCustomExerciseSnapshot;
}

export interface CustomExerciseDeleteOp {
  readonly kind: "custom-exercise-delete";
  readonly exerciseId: string;
}

export interface MeasurementUpsertOp {
  readonly kind: "measurement-upsert";
  readonly measurement: FizrukMeasurementSnapshot;
}

export interface MeasurementDeleteOp {
  readonly kind: "measurement-delete";
  readonly measurementId: string;
}

export type FizrukDualWriteOp =
  | WorkoutUpsertOp
  | WorkoutDeleteOp
  | CustomExerciseUpsertOp
  | CustomExerciseDeleteOp
  | MeasurementUpsertOp
  | MeasurementDeleteOp;

// -----------------------------------------------------------------------
// Snapshot shapes — loose mirrors of the domain types, kept minimal so
// the diff layer doesn't pull in the full domain package. The adapter
// reads these to produce SQL statements.
// -----------------------------------------------------------------------

export interface FizrukSetSnapshot {
  readonly weightKg: number;
  readonly reps: number;
  readonly rpe?: number | null;
  readonly [extra: string]: unknown;
}

export interface FizrukItemSnapshot {
  readonly id: string;
  readonly exerciseId: string;
  readonly nameUk: string;
  readonly primaryGroup: string;
  readonly musclesPrimary: string[];
  readonly musclesSecondary: string[];
  readonly type: string;
  readonly sets?: FizrukSetSnapshot[];
  readonly durationSec?: number;
  readonly distanceM?: number;
  readonly [extra: string]: unknown;
}

export interface FizrukWorkoutSnapshot {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly items: FizrukItemSnapshot[];
  readonly groups: { id: string; itemIds: string[] }[];
  readonly warmup: { id: string; done: boolean; label: string }[] | null;
  readonly cooldown: { id: string; done: boolean; label: string }[] | null;
  readonly note: string;
  readonly wellbeing?: {
    energy?: number | null;
    mood?: number | null;
    [k: string]: unknown;
  } | null;
  readonly [extra: string]: unknown;
}

export interface FizrukCustomExerciseSnapshot {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface FizrukMeasurementSnapshot {
  readonly id: string;
  readonly at: string;
  readonly [fieldId: string]: string | number | undefined;
}

// -----------------------------------------------------------------------
// State shape — what LS looks like per storage key
// -----------------------------------------------------------------------

export interface FizrukDualWriteState {
  readonly workouts: readonly FizrukWorkoutSnapshot[];
  readonly customExercises: readonly FizrukCustomExerciseSnapshot[];
  readonly measurements: readonly FizrukMeasurementSnapshot[];
}

// -----------------------------------------------------------------------
// Diff
// -----------------------------------------------------------------------

/**
 * Compute the dual-write operation list for the transition `prev → next`.
 *
 * Stable iteration order:
 *   1. workout-upsert / workout-delete (by id asc)
 *   2. custom-exercise-upsert / custom-exercise-delete (by id asc)
 *   3. measurement-upsert / measurement-delete (by id asc)
 */
export function diffFizrukDualWriteOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): FizrukDualWriteOp[] {
  const ops: FizrukDualWriteOp[] = [];

  // --- Workouts ---
  diffArray(
    prev.workouts,
    next.workouts,
    (w) => w.id,
    workoutChanged,
    (w) => ops.push({ kind: "workout-upsert", workout: w }),
    (id) => ops.push({ kind: "workout-delete", workoutId: id }),
  );

  // --- Custom exercises ---
  diffArray(
    prev.customExercises,
    next.customExercises,
    (e) => e.id,
    () => true, // always upsert on reference change — JSON blob
    (e) => ops.push({ kind: "custom-exercise-upsert", exercise: e }),
    (id) => ops.push({ kind: "custom-exercise-delete", exerciseId: id }),
  );

  // --- Measurements ---
  diffArray(
    prev.measurements,
    next.measurements,
    (m) => m.id,
    () => true,
    (m) => ops.push({ kind: "measurement-upsert", measurement: m }),
    (id) => ops.push({ kind: "measurement-delete", measurementId: id }),
  );

  return ops;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function diffArray<T extends { readonly id: string }>(
  prev: readonly T[],
  next: readonly T[],
  getId: (item: T) => string,
  hasChanged: (prev: T, next: T) => boolean,
  onUpsert: (item: T) => void,
  onDelete: (id: string) => void,
): void {
  const prevMap = new Map<string, T>();
  for (const item of prev) prevMap.set(getId(item), item);

  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(getId(item), item);

  // Upserts: items in next that are new or changed.
  const sortedNextIds = [...nextMap.keys()].sort();
  for (const id of sortedNextIds) {
    const nextItem = nextMap.get(id)!;
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      onUpsert(nextItem);
    } else if (prevItem !== nextItem && hasChanged(prevItem, nextItem)) {
      onUpsert(nextItem);
    }
  }

  // Deletes: items in prev that are absent in next.
  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      onDelete(id);
    }
  }
}

/**
 * Shallow comparison of workout top-level fields to detect changes.
 * Nested items/sets are compared by reference — if any child array ref
 * changed, we re-upsert the whole workout tree (the adapter handles
 * idempotency via ON CONFLICT).
 */
function workoutChanged(
  prev: FizrukWorkoutSnapshot,
  next: FizrukWorkoutSnapshot,
): boolean {
  return (
    prev.startedAt !== next.startedAt ||
    prev.endedAt !== next.endedAt ||
    prev.note !== next.note ||
    prev.items !== next.items ||
    prev.groups !== next.groups ||
    prev.warmup !== next.warmup ||
    prev.cooldown !== next.cooldown ||
    prev.wellbeing !== next.wellbeing
  );
}
