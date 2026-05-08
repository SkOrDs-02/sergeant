import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukDualWriteState } from "./diff.js";

/**
 * Parity probe for the Fizruk SQLite dual-write layer.
 *
 * Stage 8 §3 of `docs/planning/storage-roadmap.md` defines a
 * `<module>.sqlite.dualwrite.parity` decision-gate metric: whenever
 * the LS-derived state and the SQLite-derived state should be
 * identical (which is the steady-state invariant once the dual-write
 * `applied` outcome returns success), they are compared and a
 * `recordParityCheck` tick is emitted on the global Sentry scope.
 *
 * The orchestrator (`./index.ts`) calls this helper after every
 * successful `applyFizrukDualWriteOps` apply. Fizruk SQLite mirrors
 * three top-level entity classes — workouts, custom exercises, and
 * measurements — so the probe compares the live id-sets of each
 * against the LS-derived `next.{workouts,customExercises,measurements}`
 * lists. Child tables (`fizruk_workout_items`, `fizruk_workout_sets`)
 * are not compared directly: the workout-level cardinality already
 * captures the most common drift mode (lost or duplicated workout)
 * and child-row drift would surface as a downstream `applied:errored`
 * spike on the next dual-write attempt.
 *
 * The probe is best-effort: it must NEVER throw, and any read failure
 * is surfaced as a `read.fallback` — distinct from a real parity
 * mismatch — so triage can tell `SELECT failing` apart from `LS and
 * SQLite genuinely disagree`. The orchestrator implements that
 * distinction.
 */

interface ParityProbeOutcome {
  result: "match" | "mismatch";
  details: Record<string, unknown>;
}

/**
 * Read the active Fizruk top-level entity ids from SQLite for `userId`
 * and compare them to the LS-derived `next` snapshot. The two are
 * expected to be byte-identical right after a successful dual-write
 * apply — any divergence is a Stage 8 decision-gate signal.
 *
 * The function may throw if any of the SQLite reads fail. The caller
 * is expected to catch and route that to `recordReadFallback` rather
 * than `recordParityCheck("…", "mismatch", …)` — see `./index.ts`.
 */
export async function probeFizrukParity(
  client: SqliteMigrationClient,
  userId: string,
  next: FizrukDualWriteState,
): Promise<ParityProbeOutcome> {
  const sqliteWorkouts = await readActiveIds(client, "fizruk_workouts", userId);
  const sqliteCustomExercises = await readActiveIds(
    client,
    "fizruk_custom_exercises",
    userId,
  );
  const sqliteMeasurements = await readActiveIds(
    client,
    "fizruk_measurements",
    userId,
  );

  const lsWorkouts = buildIdSet(next.workouts);
  const lsCustomExercises = buildIdSet(next.customExercises);
  const lsMeasurements = buildIdSet(next.measurements);

  const workoutsDiff = compareSets(lsWorkouts, sqliteWorkouts);
  const customExercisesDiff = compareSets(
    lsCustomExercises,
    sqliteCustomExercises,
  );
  const measurementsDiff = compareSets(lsMeasurements, sqliteMeasurements);

  const allMatch =
    workoutsDiff.match && customExercisesDiff.match && measurementsDiff.match;

  if (allMatch) {
    return {
      result: "match",
      details: {
        workouts: { ls: lsWorkouts.size, sqlite: sqliteWorkouts.size },
        customExercises: {
          ls: lsCustomExercises.size,
          sqlite: sqliteCustomExercises.size,
        },
        measurements: {
          ls: lsMeasurements.size,
          sqlite: sqliteMeasurements.size,
        },
      },
    };
  }

  // Mismatch: surface the symmetric-difference cardinality per entity
  // class so triage can read the bucket without a follow-up query. We
  // deliberately do NOT include the actual ids — workout / exercise
  // / measurement ids are user-data and Sentry breadcrumbs leak into
  // events.
  return {
    result: "mismatch",
    details: {
      workouts: {
        ls: lsWorkouts.size,
        sqlite: sqliteWorkouts.size,
        lsOnly: workoutsDiff.lsOnly,
        sqliteOnly: workoutsDiff.sqliteOnly,
      },
      customExercises: {
        ls: lsCustomExercises.size,
        sqlite: sqliteCustomExercises.size,
        lsOnly: customExercisesDiff.lsOnly,
        sqliteOnly: customExercisesDiff.sqliteOnly,
      },
      measurements: {
        ls: lsMeasurements.size,
        sqlite: sqliteMeasurements.size,
        lsOnly: measurementsDiff.lsOnly,
        sqliteOnly: measurementsDiff.sqliteOnly,
      },
    },
  };
}

async function readActiveIds(
  client: SqliteMigrationClient,
  table: "fizruk_workouts" | "fizruk_custom_exercises" | "fizruk_measurements",
  userId: string,
): Promise<Set<string>> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM ${table}
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const out = new Set<string>();
  for (const row of rows) {
    if (typeof row.id === "string" && row.id.length > 0) out.add(row.id);
  }
  return out;
}

function buildIdSet(items: readonly { id: string }[]): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      item.id.length > 0
    ) {
      out.add(item.id);
    }
  }
  return out;
}

interface SetCompareOutcome {
  match: boolean;
  lsOnly: number;
  sqliteOnly: number;
}

function compareSets(ls: Set<string>, sqlite: Set<string>): SetCompareOutcome {
  if (ls.size === sqlite.size) {
    let allMatch = true;
    for (const key of ls) {
      if (!sqlite.has(key)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return { match: true, lsOnly: 0, sqliteOnly: 0 };
  }
  let lsOnly = 0;
  let sqliteOnly = 0;
  for (const key of ls) if (!sqlite.has(key)) lsOnly += 1;
  for (const key of sqlite) if (!ls.has(key)) sqliteOnly += 1;
  return { match: false, lsOnly, sqliteOnly };
}
