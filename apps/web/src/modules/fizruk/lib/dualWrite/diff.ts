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
 *      `fizruk_daily_log`. Same per-row shape as `fizruk_measurements`
 *      but with mood/sleep/energy/weight scalar columns. Stage 12 /
 *      PR #070f-dualwrite.
 *
 *   5. **Monthly plan** — singleton state persisted under
 *      `MONTHLY_PLAN_STORAGE_KEY`. The whole document is serialized
 *      to JSON (`data_json`) — there is no per-day normalisation in
 *      `fizruk_monthly_plan`, the document is read as one blob.
 *      Stage 12 / PR #070f-dualwrite.
 *
 *   6. **Workout templates** — `WorkoutTemplate[]` persisted under
 *      `STORAGE_KEYS.FIZRUK_TEMPLATES`. One row per template in
 *      `fizruk_workout_templates`; mirrors the per-row catalogue
 *      pattern from `fizruk_custom_exercises`. Stage 12 /
 *      PR #070f-dualwrite.
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

/**
 * Stage 12 / PR #070f-dualwrite — daily-log per-row upsert. Mirrors
 * `measurement-upsert`. The adapter writes to `fizruk_daily_log` with
 * an `INSERT … ON CONFLICT(id) DO UPDATE` and the LWW guard.
 */
export interface DailyLogUpsertOp {
  readonly kind: "daily-log-upsert";
  readonly entry: FizrukDailyLogSnapshot;
}

export interface DailyLogDeleteOp {
  readonly kind: "daily-log-delete";
  readonly entryId: string;
}

/**
 * Stage 12 / PR #070f-dualwrite — singleton monthly-plan row. Mirrors
 * Nutrition's `shopping-list-set`: a single row per user with the
 * whole document JSON-encoded into `data_json`.
 */
export interface MonthlyPlanSetOp {
  readonly kind: "monthly-plan-set";
  readonly monthlyPlan: FizrukMonthlyPlanSnapshot;
}

/**
 * Stage 12 / PR #070f-dualwrite — workout-template per-row upsert.
 * Mirrors the catalogue-style per-row pattern from
 * `fizruk_custom_exercises`. Each template is a small stable row with
 * its own id; the diff layer serialises `exerciseIds` and `groups` to
 * JSON and the adapter persists the rest as scalar columns.
 */
export interface WorkoutTemplateUpsertOp {
  readonly kind: "workout-template-upsert";
  readonly template: FizrukWorkoutTemplateSnapshot;
}

export interface WorkoutTemplateDeleteOp {
  readonly kind: "workout-template-delete";
  readonly templateId: string;
}

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

/**
 * Stage 12 / PR #070f-dualwrite — daily-log entry. Mirrors the
 * `useDailyLog` hook shape. Numeric fields are nullable to match the
 * `fizruk_daily_log` schema (`weight_kg / sleep_hours / energy_level
 * / mood`).
 */
export interface FizrukDailyLogSnapshot {
  readonly id: string;
  readonly at: string;
  readonly weightKg: number | null;
  readonly sleepHours: number | null;
  readonly energyLevel: number | null;
  readonly mood: number | null;
  readonly note: string;
}

/**
 * Stage 12 / PR #070f-dualwrite — singleton snapshot for the monthly
 * plan. The whole `MonthlyPlanState` document is serialized to JSON
 * (`data_json`) — there is no per-day normalisation in
 * `fizruk_monthly_plan`, the document is read as one blob.
 */
export interface FizrukMonthlyPlanSnapshot {
  /** Whole MonthlyPlan document serialized to JSON for `data_json`. */
  readonly dataJson: string;
}

/**
 * Stage 12 / PR #070f-dualwrite — workout-template entry. Mirrors the
 * `useWorkoutTemplates` hook shape. `exerciseIds` and `groups` are
 * serialised to JSON by the adapter; `lastUsedAt` is optional.
 */
export interface FizrukWorkoutTemplateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly exerciseIds: readonly string[];
  readonly groups: readonly unknown[];
  readonly updatedAt: string;
  readonly lastUsedAt?: string | null;
}

// -----------------------------------------------------------------------
// State shape — what LS looks like per storage key
// -----------------------------------------------------------------------

export interface FizrukDualWriteState {
  readonly workouts: readonly FizrukWorkoutSnapshot[];
  readonly customExercises: readonly FizrukCustomExerciseSnapshot[];
  readonly measurements: readonly FizrukMeasurementSnapshot[];
  /**
   * Daily-log entries keyed by `id`. Stage 12 / PR #070f-dualwrite.
   * Empty array means «no daily-log rows yet».
   */
  readonly dailyLog: readonly FizrukDailyLogSnapshot[];
  /**
   * Monthly-plan singleton. `null` means «no row in
   * `fizruk_monthly_plan` yet» — the diff treats `null → non-null` as
   * a single `monthly-plan-set` op. Stage 12 / PR #070f-dualwrite.
   */
  readonly monthlyPlan: FizrukMonthlyPlanSnapshot | null;
  /**
   * Workout-template entries keyed by `id`. Stage 12 /
   * PR #070f-dualwrite. Empty array means «no template rows yet».
   */
  readonly workoutTemplates: readonly FizrukWorkoutTemplateSnapshot[];
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
 *   4. daily-log-upsert / daily-log-delete (by id asc) — Stage 12 / PR #070f-dualwrite
 *   5. monthly-plan-set (at most one) — Stage 12 / PR #070f-dualwrite
 *   6. workout-template-upsert / workout-template-delete (by id asc) — Stage 12 / PR #070f-dualwrite
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

  // --- Daily log (Stage 12) ---
  diffArray(
    prev.dailyLog ?? [],
    next.dailyLog ?? [],
    (e) => e.id,
    dailyLogChanged,
    (e) => ops.push({ kind: "daily-log-upsert", entry: e }),
    (id) => ops.push({ kind: "daily-log-delete", entryId: id }),
  );

  // --- Monthly plan (Stage 12) ---
  diffMonthlyPlanOps(prev, next, ops);

  // --- Workout templates (Stage 12) ---
  diffArray(
    prev.workoutTemplates ?? [],
    next.workoutTemplates ?? [],
    (t) => t.id,
    workoutTemplateChanged,
    (t) => ops.push({ kind: "workout-template-upsert", template: t }),
    (id) => ops.push({ kind: "workout-template-delete", templateId: id }),
  );

  return ops;
}

// -----------------------------------------------------------------------
// Stage 12 — monthly-plan singleton diff
// -----------------------------------------------------------------------

function diffMonthlyPlanOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
  ops: FizrukDualWriteOp[],
): void {
  const prevPlan = prev.monthlyPlan ?? null;
  const nextPlan = next.monthlyPlan ?? null;
  if (prevPlan === nextPlan) return;
  if (nextPlan === null) {
    // The hook never deletes the singleton — clearing days resets the
    // document but keeps the slot. Still, if a caller sets `monthlyPlan
    // = null` we no-op rather than emit a delete op (the table has no
    // soft-delete column).
    return;
  }
  if (prevPlan && prevPlan.dataJson === nextPlan.dataJson) return;
  ops.push({ kind: "monthly-plan-set", monthlyPlan: nextPlan });
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

/**
 * Stage 12 / PR #070f-dualwrite — daily-log shallow comparison. The
 * snapshot is flat (no nested arrays) so every scalar field is part of
 * the equality check.
 */
function dailyLogChanged(
  prev: FizrukDailyLogSnapshot,
  next: FizrukDailyLogSnapshot,
): boolean {
  return (
    prev.at !== next.at ||
    prev.weightKg !== next.weightKg ||
    prev.sleepHours !== next.sleepHours ||
    prev.energyLevel !== next.energyLevel ||
    prev.mood !== next.mood ||
    prev.note !== next.note
  );
}

/**
 * Stage 12 / PR #070f-dualwrite — workout-template shallow comparison.
 * `exerciseIds` and `groups` are compared by reference; mutating them
 * in place won't trigger an op, but the hook always replaces the
 * arrays on every persist (`persist((prev) => ...)` returns a fresh
 * shape).
 */
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
