/**
 * Boot-time residual-import helper for the mobile Fizruk MMKV keys.
 *
 * Stage 8 PR #057f-tombstone (workouts / custom-exercises /
 * measurements), Stage 12 PR #057f-tombstone-mobile-stage12 (daily-log /
 * monthly-plan / workout-templates), and Stage 12.5 PR
 * #057f2-tombstone-mobile-stage12-5 (programs / plan-template /
 * wellbeing) of `docs/planning/storage-roadmap.md`.
 *
 * Reads any leftover values from the now-deprecated MMKV keys,
 * imports them into the local `fizruk_*` SQLite tables (idempotent +
 * LWW-safe), and then deletes the MMKV entries. Subsequent boots
 * no-op because the MMKV keys are gone.
 *
 * MMKV keys covered:
 *   - `fizruk_workouts_v1`
 *   - `fizruk_custom_exercises_v1`
 *   - `fizruk_measurements_v1`
 *   - `fizruk_daily_log_v1`              ← Stage 12
 *   - `fizruk_monthly_plan_v1`           ← Stage 12
 *   - `fizruk_workout_templates_v1`      ← Stage 12
 *   - `fizruk_active_program_id_v1`      ← Stage 12.5
 *   - `fizruk_plan_template_v1`          ← Stage 12.5
 *   - `fizruk_wellbeing_v1`              ← Stage 12.5
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale MMKV snapshot.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { STORAGE_KEYS } from "@sergeant/shared";
import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain/constants";
import {
  normalizeMonthlyPlanState,
  type MonthlyPlanState,
} from "@sergeant/fizruk-domain/domain/plan/index";
import type {
  ChecklistItem,
  DailyLogEntry,
  FizrukData,
  MeasurementEntry,
  Workout,
  WorkoutGroup,
  WorkoutItem,
  WorkoutWellbeing,
} from "@sergeant/fizruk-domain";
import {
  normalizeActiveProgramState,
  type ActiveProgramState,
} from "@sergeant/fizruk-domain/domain";

import { safeReadLS, safeRemoveLS } from "@/lib/storage";

import { applyFizrukDualWriteOps } from "./dualWrite/adapter";
import {
  diffFizrukDualWriteOps,
  type FizrukCustomExerciseSnapshot,
  type FizrukDailyLogSnapshot,
  type FizrukDualWriteState,
  type FizrukItemSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukSetSnapshot,
  type FizrukWorkoutSnapshot,
  type FizrukWorkoutTemplateSnapshot,
} from "./dualWrite/diff";
import {
  extractMonthlyPlanSnapshot,
  extractPlanTemplateSnapshot,
  extractProgramsSnapshot,
  extractWellbeingSnapshots,
  type FizrukPlanTemplateLike,
  type FizrukWellbeingEntryLike,
} from "./fizrukDualWriteState";

type RawExerciseDef = FizrukData.RawExerciseDef;

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const EMPTY_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 ----------------
  programs: null,
  planTemplate: null,
  wellbeing: [],
};

/** Hook-side workout-template shape (mirror of `WorkoutTemplate` in
 *  `apps/mobile/src/modules/fizruk/hooks/useWorkoutTemplates.ts`). Kept
 *  local so this module stays hook-free. */
interface ResidualWorkoutTemplate {
  id?: string | null;
  name?: string | null;
  exerciseIds?: readonly unknown[];
  groups?: readonly unknown[];
  updatedAt?: string | null;
  lastUsedAt?: string | null;
}

export interface ResidualImportResult {
  /** `true` when at least one MMKV key had data that produced ops. */
  readonly imported: boolean;
  /** `true` when MMKV keys were present and have been deleted. */
  readonly cleaned: boolean;
}

/**
 * Import any residual Fizruk MMKV data into SQLite, then delete the
 * MMKV entries. Always returns successfully — failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importFizrukResidualFromMmkv(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const workouts = readWorkoutsFromMmkv();
  const customExercises = readCustomExercisesFromMmkv();
  const measurements = readMeasurementsFromMmkv();
  // Stage 12 / PR #057f-tombstone-mobile-stage12 -----------------------
  const dailyLog = readDailyLogFromMmkv();
  const monthlyPlan = readMonthlyPlanFromMmkv();
  const workoutTemplates = readWorkoutTemplatesFromMmkv();
  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 -----------------
  const programs = readProgramsFromMmkv();
  const planTemplateRead = readPlanTemplateFromMmkv();
  const wellbeing = readWellbeingFromMmkv();

  const hasAny =
    workouts !== null ||
    customExercises !== null ||
    measurements !== null ||
    dailyLog !== null ||
    monthlyPlan !== null ||
    workoutTemplates !== null ||
    programs !== null ||
    planTemplateRead !== null ||
    wellbeing !== null;
  if (!hasAny) return { imported: false, cleaned: false };

  const next: FizrukDualWriteState = {
    workouts: workouts ? extractWorkoutSnapshots(workouts) : [],
    customExercises: customExercises
      ? extractCustomExerciseSnapshots(customExercises)
      : [],
    measurements: measurements ? extractMeasurementSnapshots(measurements) : [],
    dailyLog: dailyLog ? extractDailyLogSnapshots(dailyLog) : [],
    monthlyPlan: monthlyPlan ? extractMonthlyPlanSnapshot(monthlyPlan) : null,
    workoutTemplates: workoutTemplates
      ? extractWorkoutTemplateSnapshots(workoutTemplates)
      : [],
    // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 ---------------
    programs: programs
      ? (extractProgramsSnapshot(programs) ?? { activeProgramId: null })
      : null,
    planTemplate: planTemplateRead
      ? extractPlanTemplateSnapshot(planTemplateRead.value)
      : null,
    wellbeing: wellbeing ? extractWellbeingSnapshots(wellbeing) : [],
  };

  const ops = diffFizrukDualWriteOps(EMPTY_STATE, next);

  if (ops.length > 0) {
    try {
      await applyFizrukDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[fizruk.residualImport] apply failed; MMKV keys retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete MMKV keys after a successful import. Done unconditionally
  // (i.e. even when ops.length === 0) so a half-cleared MMKV state
  // can't keep retriggering the import on every boot.
  safeRemoveLS(STORAGE_KEYS.FIZRUK_WORKOUTS);
  safeRemoveLS(STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES);
  safeRemoveLS(STORAGE_KEYS.FIZRUK_MEASUREMENTS);
  // Stage 12 / PR #057f-tombstone-mobile-stage12 -----------------------
  safeRemoveLS(STORAGE_KEYS.FIZRUK_DAILY_LOG);
  safeRemoveLS(MONTHLY_PLAN_STORAGE_KEY);
  safeRemoveLS(STORAGE_KEYS.FIZRUK_TEMPLATES);
  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 -----------------
  safeRemoveLS(STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM);
  safeRemoveLS(STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE);
  safeRemoveLS(STORAGE_KEYS.FIZRUK_WELLBEING);

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// MMKV readers — defensive: any throw collapses to `null`.
// -----------------------------------------------------------------------

function readWorkoutsFromMmkv(): Workout[] | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_WORKOUTS, null);
    if (raw === null || raw === undefined) return null;
    return Array.isArray(raw) ? (raw as Workout[]) : [];
  } catch {
    return null;
  }
}

function readCustomExercisesFromMmkv(): RawExerciseDef[] | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES, null);
    if (raw === null || raw === undefined) return null;
    if (Array.isArray(raw)) return raw as RawExerciseDef[];
    // Storage may carry the legacy `{ schemaVersion, items }` envelope.
    if (raw && typeof raw === "object") {
      const items = (raw as { items?: unknown }).items;
      return Array.isArray(items) ? (items as RawExerciseDef[]) : [];
    }
    return [];
  } catch {
    return null;
  }
}

function readMeasurementsFromMmkv(): MeasurementEntry[] | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_MEASUREMENTS, null);
    if (raw === null || raw === undefined) return null;
    return Array.isArray(raw) ? (raw as MeasurementEntry[]) : [];
  } catch {
    return null;
  }
}

// Stage 12 / PR #057f-tombstone-mobile-stage12 -------------------------

function readDailyLogFromMmkv(): DailyLogEntry[] | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_DAILY_LOG, null);
    if (raw === null || raw === undefined) return null;
    return Array.isArray(raw) ? (raw as DailyLogEntry[]) : [];
  } catch {
    return null;
  }
}

function readMonthlyPlanFromMmkv(): MonthlyPlanState | null {
  try {
    const raw = safeReadLS<unknown>(MONTHLY_PLAN_STORAGE_KEY, null);
    if (raw === null || raw === undefined) return null;
    // Always normalise so partial / legacy payloads heal centrally.
    return normalizeMonthlyPlanState(raw);
  } catch {
    return null;
  }
}

function readWorkoutTemplatesFromMmkv(): ResidualWorkoutTemplate[] | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_TEMPLATES, null);
    if (raw === null || raw === undefined) return null;
    return Array.isArray(raw) ? (raw as ResidualWorkoutTemplate[]) : [];
  } catch {
    return null;
  }
}

// Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 -------------------

/**
 * Read the legacy active-program slot. Pre-Stage-12.5 the hook stored
 * either the bare id string or the `{ activeProgramId }` object — we
 * normalise both shapes through `normalizeActiveProgramState` so the
 * extractor downstream sees a consistent payload.
 */
function readProgramsFromMmkv(): ActiveProgramState | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM, null);
    if (raw === null || raw === undefined) return null;
    return normalizeActiveProgramState(raw);
  } catch {
    return null;
  }
}

/**
 * Read the legacy plan-template slot. Returns `null` when no MMKV
 * key exists, or `{ value }` when one does. The hook stored an
 * arbitrary object (or `null`); we narrow it to the loose
 * `FizrukPlanTemplateLike` shape and let
 * `extractPlanTemplateSnapshot` serialise it. Non-object payloads
 * collapse onto `null` so the extractor returns the `'null'` JSON
 * sentinel — the row is still upserted (LWW timestamping) and the
 * MMKV key is still cleaned.
 */
function readPlanTemplateFromMmkv(): {
  value: FizrukPlanTemplateLike | null;
} | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE, null);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "object") {
      return { value: raw as FizrukPlanTemplateLike };
    }
    return { value: null };
  } catch {
    return null;
  }
}

/**
 * Read the legacy wellbeing array. Each entry is loose-typed (mood,
 * energy, sleep* may be missing) — the extractor filters out invalid
 * shapes.
 */
function readWellbeingFromMmkv(): FizrukWellbeingEntryLike[] | null {
  try {
    const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_WELLBEING, null);
    if (raw === null || raw === undefined) return null;
    return Array.isArray(raw) ? (raw as FizrukWellbeingEntryLike[]) : [];
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// Snapshot extractors — copies of the helpers used by the mobile hooks
// (kept private to this file so the residual-import is self-contained
// and the import path doesn't pull in React-only dependencies).
// -----------------------------------------------------------------------

function extractWorkoutSnapshots(
  workouts: readonly Workout[],
): FizrukWorkoutSnapshot[] {
  const out: FizrukWorkoutSnapshot[] = [];
  for (const w of workouts) {
    if (!w || typeof w !== "object" || !w.id) continue;
    out.push(toWorkoutSnapshot(w));
  }
  return out;
}

function extractCustomExerciseSnapshots(
  exercises: readonly RawExerciseDef[],
): FizrukCustomExerciseSnapshot[] {
  const out: FizrukCustomExerciseSnapshot[] = [];
  for (const e of exercises) {
    if (!e || typeof e !== "object" || !e.id) continue;
    out.push({ ...e, id: String(e.id) });
  }
  return out;
}

function extractMeasurementSnapshots(
  entries: readonly MeasurementEntry[],
): FizrukMeasurementSnapshot[] {
  const out: FizrukMeasurementSnapshot[] = [];
  for (const m of entries) {
    if (!m || typeof m !== "object" || !m.id || !m.at) continue;
    out.push({ ...m, id: String(m.id), at: String(m.at) });
  }
  return out;
}

function toWorkoutSnapshot(workout: Workout): FizrukWorkoutSnapshot {
  return {
    id: String(workout.id),
    startedAt: String(workout.startedAt ?? ""),
    endedAt: workout.endedAt ?? null,
    items: (workout.items ?? []).map(toItemSnapshot),
    groups: (workout.groups ?? []).map(toGroupSnapshot),
    warmup: workout.warmup ? workout.warmup.map(toChecklistSnapshot) : null,
    cooldown: workout.cooldown
      ? workout.cooldown.map(toChecklistSnapshot)
      : null,
    note: typeof workout.note === "string" ? workout.note : "",
    wellbeing: workout.wellbeing
      ? toWellbeingSnapshot(workout.wellbeing)
      : null,
  };
}

function toItemSnapshot(item: WorkoutItem): FizrukItemSnapshot {
  const out: {
    id: string;
    exerciseId: string;
    nameUk: string;
    primaryGroup: string;
    musclesPrimary: string[];
    musclesSecondary: string[];
    type: string;
    sets?: FizrukSetSnapshot[];
    durationSec?: number;
    distanceM?: number;
  } = {
    id: String(item.id),
    exerciseId: String(item.exerciseId ?? ""),
    nameUk: String(item.nameUk ?? ""),
    primaryGroup: String(item.primaryGroup ?? ""),
    musclesPrimary: Array.isArray(item.musclesPrimary)
      ? item.musclesPrimary.map(String)
      : [],
    musclesSecondary: Array.isArray(item.musclesSecondary)
      ? item.musclesSecondary.map(String)
      : [],
    type: String(item.type ?? "strength"),
  };
  if (Array.isArray(item.sets)) {
    out.sets = item.sets.map(
      (s): FizrukSetSnapshot => ({
        weightKg: typeof s.weightKg === "number" ? s.weightKg : 0,
        reps: typeof s.reps === "number" ? s.reps : 0,
        ...(typeof s.rpe === "number" ? { rpe: s.rpe } : {}),
      }),
    );
  }
  if (typeof item.durationSec === "number") out.durationSec = item.durationSec;
  if (typeof item.distanceM === "number") out.distanceM = item.distanceM;
  return out as FizrukItemSnapshot;
}

function toGroupSnapshot(group: WorkoutGroup): {
  id: string;
  itemIds: string[];
} {
  return {
    id: String(group.id),
    itemIds: Array.isArray(group.itemIds) ? group.itemIds.map(String) : [],
  };
}

function toChecklistSnapshot(item: ChecklistItem): {
  id: string;
  done: boolean;
  label: string;
} {
  return {
    id: String(item.id),
    done: Boolean(item.done),
    label: String(item.label ?? ""),
  };
}

function toWellbeingSnapshot(w: WorkoutWellbeing): {
  energy?: number | null;
  mood?: number | null;
} {
  const out: { energy?: number | null; mood?: number | null } = {};
  if (w.energy !== undefined) out.energy = w.energy;
  if (w.mood !== undefined) out.mood = w.mood;
  return out;
}

// Stage 12 / PR #057f-tombstone-mobile-stage12 extractors --------------

function extractDailyLogSnapshots(
  entries: readonly DailyLogEntry[],
): FizrukDailyLogSnapshot[] {
  const out: FizrukDailyLogSnapshot[] = [];
  for (const e of entries) {
    if (!e || typeof e !== "object" || !e.id || !e.at) continue;
    out.push({
      id: String(e.id),
      at: String(e.at),
      weightKg: numericOrNull(e.weightKg),
      sleepHours: numericOrNull(e.sleepHours),
      energyLevel: numericOrNull(e.energyLevel),
      mood: numericOrNull(e.mood),
      note: typeof e.note === "string" ? e.note : "",
    });
  }
  return out;
}

function extractWorkoutTemplateSnapshots(
  templates: readonly ResidualWorkoutTemplate[],
): FizrukWorkoutTemplateSnapshot[] {
  const out: FizrukWorkoutTemplateSnapshot[] = [];
  for (const t of templates) {
    if (!t || typeof t !== "object" || !t.id) continue;
    const exerciseIds: string[] = Array.isArray(t.exerciseIds)
      ? (t.exerciseIds as readonly unknown[]).filter(
          (id: unknown): id is string => typeof id === "string",
        )
      : [];
    const groups = Array.isArray(t.groups) ? [...t.groups] : [];
    out.push({
      id: String(t.id),
      name: typeof t.name === "string" ? t.name : "",
      exerciseIds,
      groups,
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : "",
      lastUsedAt: typeof t.lastUsedAt === "string" ? t.lastUsedAt : null,
    });
  }
  return out;
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
};
