import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukDualWriteState } from "./diff";

/**
 * Parity probe for the Fizruk SQLite dual-write layer (mobile mirror
 * of `apps/web/src/modules/fizruk/lib/dualWrite/parity.ts`).
 *
 * Stage 8 §3 of `docs/planning/storage-roadmap.md` defines a
 * `<module>.sqlite.dualwrite.parity` decision-gate metric: whenever
 * the LS-derived state and the SQLite-derived state should be
 * identical (which is the steady-state invariant once the dual-write
 * `applied` outcome returns success), they are compared and a
 * `recordParityCheck` tick is emitted.
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — extends the mobile
 * probe from the original three classes (workouts, custom exercises,
 * measurements) to all six top-level entity classes shipped on web
 * by PR #070f-dualwrite:
 *
 *   1. **Workouts** — top-level rows in `fizruk_workouts`.
 *   2. **Custom exercises** — top-level rows in `fizruk_custom_exercises`.
 *   3. **Measurements** — top-level rows in `fizruk_measurements`.
 *   4. **Daily log** — top-level rows in `fizruk_daily_log`.
 *   5. **Monthly plan** — singleton `fizruk_monthly_plan` blob compared
 *      by JSON-string equality.
 *   6. **Workout templates** — top-level rows in
 *      `fizruk_workout_templates`.
 *
 * The probe is best-effort: it must NEVER throw, and any read failure
 * is surfaced as a `read.fallback` — distinct from a real parity
 * mismatch — so triage can tell `SELECT failing` apart from `LS and
 * SQLite genuinely disagree`. The orchestrator (`./index.ts`)
 * implements that distinction.
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
  // Stage 12 — daily-log + workout-template id sets, monthly-plan blob.
  const sqliteDailyLog = await readActiveIds(
    client,
    "fizruk_daily_log",
    userId,
  );
  const sqliteWorkoutTemplates = await readActiveIds(
    client,
    "fizruk_workout_templates",
    userId,
  );

  const lsWorkouts = buildIdSet(next.workouts);
  const lsCustomExercises = buildIdSet(next.customExercises);
  const lsMeasurements = buildIdSet(next.measurements);
  const lsDailyLog = buildIdSet(next.dailyLog ?? []);
  const lsWorkoutTemplates = buildIdSet(next.workoutTemplates ?? []);

  const workoutsDiff = compareSets(lsWorkouts, sqliteWorkouts);
  const customExercisesDiff = compareSets(
    lsCustomExercises,
    sqliteCustomExercises,
  );
  const measurementsDiff = compareSets(lsMeasurements, sqliteMeasurements);
  const dailyLogDiff = compareSets(lsDailyLog, sqliteDailyLog);
  const workoutTemplatesDiff = compareSets(
    lsWorkoutTemplates,
    sqliteWorkoutTemplates,
  );
  // Stage 12 — monthly-plan singleton compared by JSON-blob equality.
  const monthlyPlanDiff = await probeMonthlyPlan(client, userId, next);

  const allMatch =
    workoutsDiff.match &&
    customExercisesDiff.match &&
    measurementsDiff.match &&
    dailyLogDiff.match &&
    workoutTemplatesDiff.match &&
    monthlyPlanDiff.match;

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
        dailyLog: { ls: lsDailyLog.size, sqlite: sqliteDailyLog.size },
        workoutTemplates: {
          ls: lsWorkoutTemplates.size,
          sqlite: sqliteWorkoutTemplates.size,
        },
        monthlyPlan: monthlyPlanDiff.details,
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
      dailyLog: {
        ls: lsDailyLog.size,
        sqlite: sqliteDailyLog.size,
        lsOnly: dailyLogDiff.lsOnly,
        sqliteOnly: dailyLogDiff.sqliteOnly,
      },
      workoutTemplates: {
        ls: lsWorkoutTemplates.size,
        sqlite: sqliteWorkoutTemplates.size,
        lsOnly: workoutTemplatesDiff.lsOnly,
        sqliteOnly: workoutTemplatesDiff.sqliteOnly,
      },
      monthlyPlan: monthlyPlanDiff.details,
    },
  };
}

async function readActiveIds(
  client: SqliteMigrationClient,
  table:
    | "fizruk_workouts"
    | "fizruk_custom_exercises"
    | "fizruk_measurements"
    | "fizruk_daily_log"
    | "fizruk_workout_templates",
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

// -----------------------------------------------------------------------
// Stage 12 — monthly-plan probe (compare singleton JSON blob)
// -----------------------------------------------------------------------

interface MonthlyPlanDiffResult {
  match: boolean;
  details: Record<string, unknown>;
}

async function probeMonthlyPlan(
  client: SqliteMigrationClient,
  userId: string,
  next: FizrukDualWriteState,
): Promise<MonthlyPlanDiffResult> {
  const rows = await client.all<{ data_json: string }>(
    `SELECT data_json FROM fizruk_monthly_plan WHERE user_id = ?`,
    [userId],
  );
  const sqliteHas = rows.length > 0;
  const lsHas = next.monthlyPlan !== null && next.monthlyPlan !== undefined;

  if (!lsHas && !sqliteHas) {
    return { match: true, details: { ls: false, sqlite: false } };
  }
  if (lsHas !== sqliteHas) {
    return { match: false, details: { ls: lsHas, sqlite: sqliteHas } };
  }
  // Both sides have a row — compare the JSON blob byte-for-byte.
  const sqliteJson = rows[0]?.data_json ?? "{}";
  const lsJson = next.monthlyPlan?.dataJson ?? "{}";
  const equal = sqliteJson === lsJson;
  return {
    match: equal,
    details: equal
      ? { ls: true, sqlite: true, equal: true }
      : {
          ls: true,
          sqlite: true,
          lsLen: lsJson.length,
          sqliteLen: sqliteJson.length,
        },
  };
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
