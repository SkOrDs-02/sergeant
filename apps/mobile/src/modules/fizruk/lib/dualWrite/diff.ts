/**
 * Pure-function diff between two Fizruk LS-state snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/fizruk/lib/dualWrite/diff.ts` — kept
 * duplicated until Stage 5 promotes the dual-write helpers into a
 * workspace package.
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — extends the mobile
 * snapshot + op set to cover the three additional Fizruk entity
 * classes shipped on web by PR #070f-dualwrite:
 *
 *   - `daily-log-upsert` / `daily-log-delete` — top-level
 *     `fizruk_daily_log` rows (per-entry).
 *   - `monthly-plan-set` — singleton `fizruk_monthly_plan` blob
 *     (no delete op — clearing the document keeps the slot).
 *   - `workout-template-upsert` / `workout-template-delete` —
 *     top-level `fizruk_workout_templates` rows (per-template).
 *
 * **Stage 12.5 / PR #070f2-mobile-dualwrite** — extends the mobile
 * snapshot + op set to the three remaining mobile-only Fizruk hook
 * surfaces (`usePrograms`, `usePlanTemplate`, `useWellbeing`):
 *
 *   - `programs-set` — singleton `fizruk_programs` row holding the
 *     active-program id (or `null` when no program is active).
 *   - `plan-template-set` — singleton `fizruk_plan_templates` blob
 *     (free-form JSON document, mirrors the monthly-plan shape).
 *   - `wellbeing-upsert` / `wellbeing-delete` — composite-PK
 *     `fizruk_wellbeing` rows keyed by `(user_id, date_key)`.
 *
 * **Stage 12.5 / PR #070f3-active-workout-dualwrite** — adds a
 * 10th (last) Fizruk hook surface, `useActiveFizrukWorkout`. Unlike
 * the previous nine entity classes, the active-workout id does NOT
 * have a dedicated `fizruk_*` table: it is a single string slot
 * persisted into the **shared Stage 9 `kv_store` table** under
 * key `fizruk_active_workout_id_v1`. The op shape mirrors the
 * `programs-set` singleton pattern but the adapter writes through
 * to `kv_store` (and the parity probe reads from it), keeping the
 * dual-write pipeline as the single point of mirror for all 10
 * Fizruk hooks.
 *
 * The diff order is stable: workouts → custom exercises →
 * measurements → daily-log → monthly-plan → workout-templates →
 * programs → plan-template → wellbeing → active-workout. See the
 * web copy for the full mapping rules and design notes.
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

// Stage 12 / PR #070f-mobile-dualwrite -----------------------------------
export interface DailyLogUpsertOp {
  readonly kind: "daily-log-upsert";
  readonly entry: FizrukDailyLogSnapshot;
}

export interface DailyLogDeleteOp {
  readonly kind: "daily-log-delete";
  readonly entryId: string;
}

export interface MonthlyPlanSetOp {
  readonly kind: "monthly-plan-set";
  readonly monthlyPlan: FizrukMonthlyPlanSnapshot;
}

export interface WorkoutTemplateUpsertOp {
  readonly kind: "workout-template-upsert";
  readonly template: FizrukWorkoutTemplateSnapshot;
}

export interface WorkoutTemplateDeleteOp {
  readonly kind: "workout-template-delete";
  readonly templateId: string;
}

// Stage 12.5 / PR #070f2-mobile-dualwrite -------------------------------
export interface ProgramsSetOp {
  readonly kind: "programs-set";
  readonly programs: FizrukProgramsSnapshot;
}

export interface PlanTemplateSetOp {
  readonly kind: "plan-template-set";
  readonly planTemplate: FizrukPlanTemplateSnapshot;
}

export interface WellbeingUpsertOp {
  readonly kind: "wellbeing-upsert";
  readonly entry: FizrukWellbeingSnapshot;
}

export interface WellbeingDeleteOp {
  readonly kind: "wellbeing-delete";
  readonly dateKey: string;
}

// Stage 12.5 / PR #070f3-active-workout-dualwrite ----------------------
export interface ActiveWorkoutSetOp {
  readonly kind: "active-workout-set";
  readonly activeWorkout: FizrukActiveWorkoutSnapshot;
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
  | WorkoutTemplateDeleteOp
  | ProgramsSetOp
  | PlanTemplateSetOp
  | WellbeingUpsertOp
  | WellbeingDeleteOp
  | ActiveWorkoutSetOp;

// -----------------------------------------------------------------------
// Snapshot shapes
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
 * Stage 12 / PR #070f-mobile-dualwrite — Daily log entry snapshot.
 * Mirrors the SQLite `fizruk_daily_log` columns: each row is one
 * weigh-in / sleep / energy / mood entry. The hook side uses `mood`
 * directly (the mobile `DailyLogEntry` does not carry `moodScore`).
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
 * Stage 12 / PR #070f-mobile-dualwrite — Monthly plan snapshot
 * (singleton). The whole document is serialised to a JSON string so
 * the diff can compare two planforms by byte-equality. The adapter
 * writes `dataJson` straight into `fizruk_monthly_plan.data_json`.
 */
export interface FizrukMonthlyPlanSnapshot {
  readonly dataJson: string;
}

/**
 * Stage 12 / PR #070f-mobile-dualwrite — Workout template snapshot.
 * Mirrors the SQLite `fizruk_workout_templates` row shape; nested
 * arrays (`exerciseIds`, `groups`) are compared by reference (the
 * hook always produces fresh arrays on persist), and the LWW guard
 * uses `updatedAt`.
 */
export interface FizrukWorkoutTemplateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly exerciseIds: readonly string[];
  readonly groups: readonly unknown[];
  readonly updatedAt: string;
  readonly lastUsedAt?: string | null;
}

/**
 * Stage 12.5 / PR #070f2-mobile-dualwrite — programs singleton.
 * Mirrors the SQLite `fizruk_programs` row: just the active-program
 * id (or `null` when no program is active). The diff treats the
 * singleton as set-or-no-op (no delete op).
 */
export interface FizrukProgramsSnapshot {
  readonly activeProgramId: string | null;
}

/**
 * Stage 12.5 / PR #070f2-mobile-dualwrite — plan-template singleton.
 * The whole document (or `null` when the slot is empty) is
 * serialised to a JSON string so the diff can compare two payloads
 * by byte-equality. The adapter writes `dataJson` straight into
 * `fizruk_plan_templates.data_json` (default `'null'` for the
 * empty slot — keeping the row present for LWW timestamping).
 */
export interface FizrukPlanTemplateSnapshot {
  readonly dataJson: string;
}

/**
 * Stage 12.5 / PR #070f2-mobile-dualwrite — wellbeing entry.
 * Keyed by `dateKey` (`YYYY-MM-DD`); the SQLite primary key is the
 * composite `(user_id, date_key)`. Mood / energy / sleepQuality are
 * 1–5 integers; sleepHours is REAL (form supports half-hour ticks).
 */
export interface FizrukWellbeingSnapshot {
  readonly dateKey: string;
  readonly mood: number | null;
  readonly energy: number | null;
  readonly sleepQuality: number | null;
  readonly sleepHours: number | null;
  readonly notes: string;
  readonly updatedAt: string;
}

/**
 * Stage 12.5 / PR #070f3-active-workout-dualwrite — active-workout
 * singleton snapshot. Persisted into the shared Stage 9 `kv_store`
 * table at `key = 'fizruk_active_workout_id_v1'`, with `value`
 * encoded as `JSON.stringify(activeWorkoutId)` so the cleared slot
 * (`activeWorkoutId === null`) round-trips through the
 * `kv_store.value TEXT NOT NULL` column without a sentinel.
 */
export interface FizrukActiveWorkoutSnapshot {
  readonly activeWorkoutId: string | null;
}

// -----------------------------------------------------------------------
// State shape
// -----------------------------------------------------------------------

export interface FizrukDualWriteState {
  readonly workouts: readonly FizrukWorkoutSnapshot[];
  readonly customExercises: readonly FizrukCustomExerciseSnapshot[];
  readonly measurements: readonly FizrukMeasurementSnapshot[];
  /** Stage 12 / PR #070f-mobile-dualwrite. Optional for backwards-compat
   * with pre-Stage-12 callers that pass a 3-class state object. */
  readonly dailyLog?: readonly FizrukDailyLogSnapshot[];
  /** Stage 12 / PR #070f-mobile-dualwrite. `null` ≡ "no monthly-plan
   * row exists for the user yet". The diff treats the singleton as
   * upsert-or-no-op (no delete op). */
  readonly monthlyPlan?: FizrukMonthlyPlanSnapshot | null;
  /** Stage 12 / PR #070f-mobile-dualwrite. */
  readonly workoutTemplates?: readonly FizrukWorkoutTemplateSnapshot[];
  /** Stage 12.5 / PR #070f2-mobile-dualwrite. `null` ≡ "no programs
   * row exists for the user yet" (cold cache). */
  readonly programs?: FizrukProgramsSnapshot | null;
  /** Stage 12.5 / PR #070f2-mobile-dualwrite. `null` ≡ cold cache;
   * a present-but-empty document is encoded with `dataJson === 'null'`. */
  readonly planTemplate?: FizrukPlanTemplateSnapshot | null;
  /** Stage 12.5 / PR #070f2-mobile-dualwrite. */
  readonly wellbeing?: readonly FizrukWellbeingSnapshot[];
  /**
   * Stage 12.5 / PR #070f3-active-workout-dualwrite. `null` ≡ "no
   * value provided this tick" — the diff treats `null` on `next`
   * as cold cache (no-op). The hook always emits an explicit
   * snapshot (with `activeWorkoutId = null` for the cleared slot)
   * when persisting through `triggerFizrukDualWrite`.
   */
  readonly activeWorkout?: FizrukActiveWorkoutSnapshot | null;
}

// -----------------------------------------------------------------------
// Diff
// -----------------------------------------------------------------------

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
    () => true,
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

  // --- Programs (Stage 12.5) ---
  diffProgramsOps(prev, next, ops);

  // --- Plan template (Stage 12.5) ---
  diffPlanTemplateOps(prev, next, ops);

  // --- Wellbeing (Stage 12.5) — composite-PK array ---
  diffArray(
    (prev.wellbeing ?? []).map(toWellbeingDiffItem),
    (next.wellbeing ?? []).map(toWellbeingDiffItem),
    (e) => e.id,
    wellbeingChanged,
    (e) =>
      ops.push({
        kind: "wellbeing-upsert",
        entry: e.snapshot,
      }),
    (id) => ops.push({ kind: "wellbeing-delete", dateKey: id }),
  );

  // --- Active workout (Stage 12.5) — singleton kv_store slot ---
  diffActiveWorkoutOps(prev, next, ops);

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
    // The hook never deletes the singleton — clearing days resets
    // the document but keeps the slot. If a caller sets
    // `monthlyPlan = null` we no-op rather than emit a delete (the
    // `fizruk_monthly_plan` table has no soft-delete column).
    return;
  }
  if (prevPlan && prevPlan.dataJson === nextPlan.dataJson) return;
  ops.push({ kind: "monthly-plan-set", monthlyPlan: nextPlan });
}

// -----------------------------------------------------------------------
// Stage 12.5 — programs / plan-template singleton diffs
// -----------------------------------------------------------------------

function diffProgramsOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
  ops: FizrukDualWriteOp[],
): void {
  const prevPrograms = prev.programs ?? null;
  const nextPrograms = next.programs ?? null;
  // `null` on `next` is treated as cold cache (no-op). A registered
  // hook that explicitly clears the active program emits a snapshot
  // with `activeProgramId === null` rather than `programs === null`.
  if (nextPrograms === null) return;
  if (
    prevPrograms &&
    prevPrograms.activeProgramId === nextPrograms.activeProgramId
  ) {
    return;
  }
  ops.push({ kind: "programs-set", programs: nextPrograms });
}

function diffPlanTemplateOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
  ops: FizrukDualWriteOp[],
): void {
  const prevPlan = prev.planTemplate ?? null;
  const nextPlan = next.planTemplate ?? null;
  // `null` on `next` ≡ cold cache; the hook emits an explicit
  // `dataJson === 'null'` payload when clearing the slot, and that
  // round-trips through `fizruk_plan_templates.data_json` (default
  // `'null'`) without triggering a delete op.
  if (nextPlan === null) return;
  if (prevPlan && prevPlan.dataJson === nextPlan.dataJson) return;
  ops.push({ kind: "plan-template-set", planTemplate: nextPlan });
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f3-active-workout-dualwrite — active-workout
// singleton diff (kv_store-backed)
// -----------------------------------------------------------------------

function diffActiveWorkoutOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
  ops: FizrukDualWriteOp[],
): void {
  const prevActive = prev.activeWorkout ?? null;
  const nextActive = next.activeWorkout ?? null;
  // `null` on `next` ≡ "hook didn't include this tick" → cold-cache
  // no-op. The hook explicitly emits a snapshot with
  // `activeWorkoutId = null` when clearing the slot.
  if (nextActive === null) return;
  if (prevActive && prevActive.activeWorkoutId === nextActive.activeWorkoutId) {
    return;
  }
  ops.push({ kind: "active-workout-set", activeWorkout: nextActive });
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

  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      onDelete(id);
    }
  }
}

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
 * Stage 12 / PR #070f-mobile-dualwrite — daily-log shallow comparison.
 * The snapshot is flat (no nested arrays) so every scalar field is
 * part of the equality check.
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
 * Stage 12 / PR #070f-mobile-dualwrite — workout-template shallow
 * comparison. `exerciseIds` and `groups` are compared by reference;
 * mutating them in place won't trigger an op, but the hook always
 * replaces the arrays on every persist (`persist((prev) => ...)`
 * returns a fresh shape).
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

// -----------------------------------------------------------------------
// Stage 12.5 — wellbeing diff helpers
// -----------------------------------------------------------------------

/** Diff key wrapper so `diffArray` can key wellbeing rows by
 * `dateKey` while still carrying the full snapshot through to the
 * upsert op. */
interface WellbeingDiffItem {
  readonly id: string;
  readonly snapshot: FizrukWellbeingSnapshot;
}

function toWellbeingDiffItem(
  snapshot: FizrukWellbeingSnapshot,
): WellbeingDiffItem {
  return { id: snapshot.dateKey, snapshot };
}

function wellbeingChanged(
  prev: WellbeingDiffItem,
  next: WellbeingDiffItem,
): boolean {
  const a = prev.snapshot;
  const b = next.snapshot;
  return (
    a.mood !== b.mood ||
    a.energy !== b.energy ||
    a.sleepQuality !== b.sleepQuality ||
    a.sleepHours !== b.sleepHours ||
    a.notes !== b.notes ||
    a.updatedAt !== b.updatedAt
  );
}
