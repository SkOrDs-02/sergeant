/**
 * Boot-time residual-import helper for the mobile Fizruk MMKV keys.
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`
 * (mobile parity for `apps/web/src/modules/fizruk/lib/residualImport.ts`).
 * Reads any leftover values from the now-deprecated MMKV keys
 * (`fizruk_workouts_v1`, `fizruk_custom_exercises_v1`,
 * `fizruk_measurements_v1`), imports them into the local `fizruk_*`
 * SQLite tables (idempotent + LWW-safe), and then deletes the MMKV
 * entries. Subsequent boots no-op because the MMKV keys are gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale MMKV snapshot.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { STORAGE_KEYS } from "@sergeant/shared";
import type {
  ChecklistItem,
  FizrukData,
  MeasurementEntry,
  Workout,
  WorkoutGroup,
  WorkoutItem,
  WorkoutWellbeing,
} from "@sergeant/fizruk-domain";

import { safeReadLS, safeRemoveLS } from "@/lib/storage";

import { applyFizrukDualWriteOps } from "./dualWrite/adapter";
import {
  diffFizrukDualWriteOps,
  type FizrukCustomExerciseSnapshot,
  type FizrukDualWriteState,
  type FizrukItemSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukSetSnapshot,
  type FizrukWorkoutSnapshot,
} from "./dualWrite/diff";

type RawExerciseDef = FizrukData.RawExerciseDef;

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const EMPTY_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
};

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

  const hasAny =
    workouts !== null || customExercises !== null || measurements !== null;
  if (!hasAny) return { imported: false, cleaned: false };

  const next: FizrukDualWriteState = {
    workouts: workouts ? extractWorkoutSnapshots(workouts) : [],
    customExercises: customExercises
      ? extractCustomExerciseSnapshots(customExercises)
      : [],
    measurements: measurements ? extractMeasurementSnapshots(measurements) : [],
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

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
};
