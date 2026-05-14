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
 *
 * **P2.2a (audit `docs/audits/2026-05-13-mobile-reliability-ux-roast.md`)** —
 * this barrel is the public-API surface for the per-shape diff
 * module-folder. The monolithic `diff.ts` was decomposed into a
 * `diff/` folder mirroring `dualWrite/adapter.ts`'s operation-
 * family layout; every per-shape file holds its own op types,
 * snapshot interface, and `diff<Shape>Ops` function. Re-exports
 * here preserve the historical public API so existing imports
 * (`from "./dualWrite/diff"`) continue to resolve unchanged.
 */

import { diffActiveWorkoutOps } from "./activeWorkout";
import { diffCustomExercisesOps } from "./customExercises";
import { diffDailyLogOps } from "./dailyLog";
import { diffMeasurementsOps } from "./measurements";
import { diffMonthlyPlanOps } from "./monthlyPlan";
import { diffPlanTemplateOps } from "./planTemplate";
import { diffProgramsOps } from "./programs";
import { diffWellbeingOps } from "./wellbeing";
import { diffWorkoutTemplatesOps } from "./workoutTemplates";
import { diffWorkoutsOps } from "./workouts";

import type {
  ActiveWorkoutSetOp,
  FizrukActiveWorkoutSnapshot,
} from "./activeWorkout";
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
  FizrukPlanTemplateSnapshot,
  PlanTemplateSetOp,
} from "./planTemplate";
import type { FizrukProgramsSnapshot, ProgramsSetOp } from "./programs";
import type {
  FizrukWellbeingSnapshot,
  WellbeingDeleteOp,
  WellbeingUpsertOp,
} from "./wellbeing";
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
// Preserves the historical surface of `from "./dualWrite/diff"`. Internal
// per-shape `*Op` aliases (e.g. `WorkoutOp = WorkoutUpsertOp | WorkoutDeleteOp`)
// are intentionally NOT re-exported — the union below (`FizrukDualWriteOp`)
// is the canonical consumer-facing op type.

export type {
  ActiveWorkoutSetOp,
  CustomExerciseDeleteOp,
  CustomExerciseUpsertOp,
  DailyLogDeleteOp,
  DailyLogUpsertOp,
  FizrukActiveWorkoutSnapshot,
  FizrukCustomExerciseSnapshot,
  FizrukDailyLogSnapshot,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukPlanTemplateSnapshot,
  FizrukProgramsSnapshot,
  FizrukSetSnapshot,
  FizrukWellbeingSnapshot,
  FizrukWorkoutSnapshot,
  FizrukWorkoutTemplateSnapshot,
  MeasurementDeleteOp,
  MeasurementUpsertOp,
  MonthlyPlanSetOp,
  PlanTemplateSetOp,
  ProgramsSetOp,
  WellbeingDeleteOp,
  WellbeingUpsertOp,
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
  | WorkoutTemplateDeleteOp
  | ProgramsSetOp
  | PlanTemplateSetOp
  | WellbeingUpsertOp
  | WellbeingDeleteOp
  | ActiveWorkoutSetOp;

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
// Orchestrator
// -----------------------------------------------------------------------

export function diffFizrukDualWriteOps(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): FizrukDualWriteOp[] {
  // Diff order is part of the dual-write contract — see the
  // module header comment. Each per-shape helper returns its own
  // op subset; the orchestrator simply concatenates them.
  return [
    ...diffWorkoutsOps(prev.workouts, next.workouts),
    ...diffCustomExercisesOps(prev.customExercises, next.customExercises),
    ...diffMeasurementsOps(prev.measurements, next.measurements),
    ...diffDailyLogOps(prev.dailyLog, next.dailyLog),
    ...diffMonthlyPlanOps(prev.monthlyPlan, next.monthlyPlan),
    ...diffWorkoutTemplatesOps(prev.workoutTemplates, next.workoutTemplates),
    ...diffProgramsOps(prev.programs, next.programs),
    ...diffPlanTemplateOps(prev.planTemplate, next.planTemplate),
    ...diffWellbeingOps(prev.wellbeing, next.wellbeing),
    ...diffActiveWorkoutOps(prev.activeWorkout, next.activeWorkout),
  ];
}
