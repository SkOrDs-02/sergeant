/**
 * Mobile Fizruk — full-backup payload helpers.
 *
 * Stage 13 PR #071 of `docs/planning/storage-roadmap.md` — mobile
 * mirror of `apps/web/src/modules/fizruk/lib/fizrukStorage.ts`'s
 * `buildFizrukFullBackupPayload` / `applyFizrukFullBackupPayload`.
 *
 * After Stage 8 PR #057f-tombstone (workouts / custom-exercises /
 * measurements) and Stage 12 PR #057f-tombstone-mobile-stage12
 * (daily-log / monthly-plan / workout-templates), the corresponding
 * MMKV slots are empty on mobile — the residual-import drained them
 * into SQLite once and the keys are deleted. Reading from MMKV the
 * way `hubBackup.ts` did before this PR therefore returned an empty
 * payload on export, and writing to MMKV on import never reached the
 * SQLite tables that all hooks read from.
 *
 * Read path:    SQLite warm cache → JSON-string blobs keyed by the
 *               same `FIZRUK_FULL_BACKUP_KEYS` the web copy emits, so
 *               the on-disk file format stays identical (a backup
 *               taken on mobile imports cleanly on web and vice-versa).
 * Apply path:   parse each JSON string → diff-friendly `FizrukDual-
 *               WriteState` slice → `triggerFizrukDualWrite` against
 *               `EMPTY_STATE`, emitting a fresh-`Date.now()` op-log
 *               batch the LWW guard accepts.
 */

import {
  CUSTOM_EXERCISES_KEY,
  FIZRUK_FULL_BACKUP_KEYS,
  MEASUREMENTS_STORAGE_KEY,
  MONTHLY_PLAN_STORAGE_KEY,
  SELECTED_TEMPLATE_STORAGE_KEY,
  TEMPLATES_STORAGE_KEY,
  WORKOUTS_STORAGE_KEY,
} from "@sergeant/fizruk-domain/constants";
import {
  normalizeMonthlyPlanState,
  type MonthlyPlanState,
} from "@sergeant/fizruk-domain/domain/plan/index";
import type {
  FizrukData,
  MeasurementEntry,
  Workout,
} from "@sergeant/fizruk-domain";

import { safeReadStringLS, safeWriteLS } from "@/lib/storage";

import { triggerFizrukDualWrite } from "./dualWrite";
import { type FizrukDualWriteState } from "./dualWrite/diff";
import {
  extractCustomExerciseSnapshots,
  extractMeasurementSnapshots,
  extractMonthlyPlanSnapshot,
  extractWorkoutSnapshots,
  extractWorkoutTemplateSnapshots,
} from "./fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "./sqliteReader";

type RawExerciseDef = FizrukData.RawExerciseDef;

const EMPTY_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  programs: null,
  planTemplate: null,
  wellbeing: [],
};

export interface FizrukFullBackupPayload {
  kind: "fizruk-full-backup";
  schemaVersion: 1;
  exportedAt: string;
  data: Record<string, string | null>;
}

/**
 * Snapshot the SQLite warm cache + the still-MMKV-only
 * `FIZRUK_SELECTED_TEMPLATE` slot into the legacy LS-string shape so
 * the export is byte-compatible with the web payload.
 *
 * Cache slices map straight onto LS keys:
 *   workouts                 → `fizruk_workouts_v1`
 *   measurements             → `fizruk_measurements_v1`
 *   customExercises          → `fizruk_custom_exercises_v1`
 *   workoutTemplates         → `fizruk_workout_templates_v1`
 *   monthlyPlan              → `fizruk_monthly_plan_v1`
 *
 * `fizruk_selected_template_id_v1` remains a regular MMKV slot
 * (not yet on SQLite); read it directly so its current value lands
 * in the backup just like any other LS-string slot.
 */
export function buildFizrukFullBackupPayload(): FizrukFullBackupPayload {
  const cache = getCachedFizrukSqliteState();
  const data: Record<string, string | null> = {};

  data[WORKOUTS_STORAGE_KEY] = safeStringify(cache.workouts);
  data[MEASUREMENTS_STORAGE_KEY] = safeStringify(cache.measurements);
  data[CUSTOM_EXERCISES_KEY] = safeStringify(cache.customExercises);
  data[TEMPLATES_STORAGE_KEY] = safeStringify(cache.workoutTemplates);
  data[MONTHLY_PLAN_STORAGE_KEY] = cache.monthlyPlan
    ? safeStringify(cache.monthlyPlan)
    : null;
  data[SELECTED_TEMPLATE_STORAGE_KEY] = safeReadStringLS(
    SELECTED_TEMPLATE_STORAGE_KEY,
    null,
  );

  return {
    kind: "fizruk-full-backup",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Apply the legacy LS-string blobs through the dual-write pipeline.
 * Each slot is parsed back into its domain shape, fed through the
 * shared `extract*Snapshots` helpers (so the snapshot semantics stay
 * identical to the boot-time residual-import path) and then handed to
 * `triggerFizrukDualWrite` as a single `prev → next` op batch with a
 * fresh `Date.now()` clientTs.
 */
export function applyFizrukFullBackupPayload(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Невірний формат файлу");
  }
  const d = (parsed as { data?: unknown }).data;
  if (!d || typeof d !== "object") {
    throw new Error("Невірний формат файлу");
  }
  const dataObj = d as Record<string, unknown>;

  const workouts = parseJson<Workout[]>(dataObj[WORKOUTS_STORAGE_KEY]);
  const customExercises = parseCustomExercises(dataObj[CUSTOM_EXERCISES_KEY]);
  const measurements = parseJson<MeasurementEntry[]>(
    dataObj[MEASUREMENTS_STORAGE_KEY],
  );
  const workoutTemplates = parseJson<unknown[]>(dataObj[TEMPLATES_STORAGE_KEY]);
  const monthlyPlan = parseMonthlyPlan(dataObj[MONTHLY_PLAN_STORAGE_KEY]);
  const selectedTemplateRaw = dataObj[SELECTED_TEMPLATE_STORAGE_KEY];

  const next: FizrukDualWriteState = {
    workouts: Array.isArray(workouts) ? extractWorkoutSnapshots(workouts) : [],
    customExercises: Array.isArray(customExercises)
      ? extractCustomExerciseSnapshots(customExercises)
      : [],
    measurements: Array.isArray(measurements)
      ? extractMeasurementSnapshots(
          measurements as ReadonlyArray<{ id: string; at: string }>,
        )
      : [],
    dailyLog: [],
    monthlyPlan: monthlyPlan ? extractMonthlyPlanSnapshot(monthlyPlan) : null,
    workoutTemplates: Array.isArray(workoutTemplates)
      ? extractWorkoutTemplateSnapshots(
          workoutTemplates as ReadonlyArray<{ id: string }>,
        )
      : [],
    programs: null,
    planTemplate: null,
    wellbeing: [],
  };

  triggerFizrukDualWrite(EMPTY_STATE, next);

  // `fizruk_selected_template_id_v1` is not yet a SQLite slot — keep
  // writing it to MMKV directly so the import still restores the
  // user's last-selected template.
  if (typeof selectedTemplateRaw === "string") {
    safeWriteLS(SELECTED_TEMPLATE_STORAGE_KEY, selectedTemplateRaw);
  }
}

function safeStringify(v: unknown): string | null {
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseCustomExercises(raw: unknown): RawExerciseDef[] | null {
  const parsed = parseJson<unknown>(raw);
  if (parsed === null || parsed === undefined) return null;
  if (Array.isArray(parsed)) return parsed as RawExerciseDef[];
  if (parsed && typeof parsed === "object") {
    const items = (parsed as { items?: unknown }).items;
    return Array.isArray(items) ? (items as RawExerciseDef[]) : [];
  }
  return [];
}

function parseMonthlyPlan(raw: unknown): MonthlyPlanState | null {
  const parsed = parseJson<unknown>(raw);
  if (parsed === null || parsed === undefined) return null;
  try {
    return normalizeMonthlyPlanState(parsed);
  } catch {
    return null;
  }
}

export { FIZRUK_FULL_BACKUP_KEYS };
