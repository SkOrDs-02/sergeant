/**
 * Boot-time residual-import helper for the Fizruk LS keys.
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`.
 * Reads any leftover values from the now-deprecated LS keys
 * (`fizruk_workouts_v1`, `fizruk_custom_exercises_v1`,
 * `fizruk_measurements_v1`), imports them into the local `fizruk_*`
 * SQLite tables (idempotent + LWW-safe), and then deletes the LS
 * entries. Subsequent boots no-op because the LS keys are gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale LS snapshot.
 *
 * Mirror of `apps/web/src/modules/nutrition/lib/residualImport.ts`
 * (PR #057n-tombstone). Mobile parity lives at
 * `apps/mobile/src/modules/fizruk/lib/residualImport.ts`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  CUSTOM_EXERCISES_KEY,
  MEASUREMENTS_STORAGE_KEY,
  WORKOUTS_STORAGE_KEY,
  parseCustomExercisesFromStorage,
  parseWorkoutsFromStorage,
  type FizrukData,
  type MeasurementEntry,
  type Workout,
} from "@sergeant/fizruk-domain";

import { applyFizrukDualWriteOps } from "./dualWrite/adapter.js";
import {
  diffFizrukDualWriteOps,
  type FizrukDualWriteState,
} from "./dualWrite/diff.js";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomExerciseSnapshots,
  extractMeasurementSnapshots,
  extractWorkoutSnapshots,
} from "./fizrukDualWriteState.js";
import { fizrukStorage } from "./fizrukStorageInstance.js";

type RawExerciseDef = FizrukData.RawExerciseDef;

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export interface ResidualImportResult {
  /** `true` when at least one LS key had data that produced ops. */
  readonly imported: boolean;
  /** `true` when LS keys were present and have been deleted. */
  readonly cleaned: boolean;
}

/**
 * Import any residual Fizruk LS data into SQLite, then delete the LS
 * entries. Always returns successfully — failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importFizrukResidualFromLs(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const workouts = readWorkoutsFromLs();
  const customExercises = readCustomExercisesFromLs();
  const measurements = readMeasurementsFromLs();

  const hasAny =
    workouts !== null || customExercises !== null || measurements !== null;
  if (!hasAny) return { imported: false, cleaned: false };

  // Build a FizrukDualWriteState from whatever was found in LS. Slots
  // that are missing fall back to the empty value so the diff against
  // `EMPTY_STATE` only emits ops for slots we have.
  const next: FizrukDualWriteState = {
    workouts: workouts ? extractWorkoutSnapshots(workouts) : [],
    customExercises: customExercises
      ? extractCustomExerciseSnapshots(customExercises)
      : [],
    measurements: measurements ? extractMeasurementSnapshots(measurements) : [],
  };

  const ops = diffFizrukDualWriteOps(EMPTY_FIZRUK_DUAL_WRITE_STATE, next);

  if (ops.length > 0) {
    try {
      await applyFizrukDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[fizruk.residualImport] apply failed; LS keys retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete the LS keys after a successful import. Done unconditionally
  // (i.e. even when ops.length === 0, e.g. LS held an empty array) so a
  // half-cleared LS state can't keep retriggering the import on every
  // boot.
  fizrukStorage.removeItem(WORKOUTS_STORAGE_KEY);
  fizrukStorage.removeItem(CUSTOM_EXERCISES_KEY);
  fizrukStorage.removeItem(MEASUREMENTS_STORAGE_KEY);

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// LS readers — defensive: any throw collapses to `null` so the import
// proceeds with whatever else was readable. Returning `null` means
// "key absent / unreadable"; an empty array means "key present, empty".
// -----------------------------------------------------------------------

function readWorkoutsFromLs(): Workout[] | null {
  try {
    const raw = fizrukStorage.readRaw(WORKOUTS_STORAGE_KEY, null);
    if (raw == null) return null;
    const parsed = parseWorkoutsFromStorage(raw);
    return Array.isArray(parsed) ? (parsed as Workout[]) : [];
  } catch {
    return null;
  }
}

function readCustomExercisesFromLs(): RawExerciseDef[] | null {
  try {
    const raw = fizrukStorage.readRaw(CUSTOM_EXERCISES_KEY, null);
    if (raw == null) return null;
    const parsed = parseCustomExercisesFromStorage(raw);
    return Array.isArray(parsed) ? (parsed as RawExerciseDef[]) : [];
  } catch {
    return null;
  }
}

function readMeasurementsFromLs(): MeasurementEntry[] | null {
  try {
    const raw = fizrukStorage.readJSON<unknown>(MEASUREMENTS_STORAGE_KEY, null);
    if (raw == null) return null;
    return Array.isArray(raw) ? (raw as MeasurementEntry[]) : [];
  } catch {
    return null;
  }
}

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
};
