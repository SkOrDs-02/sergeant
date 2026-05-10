import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FizrukActiveWorkoutSnapshot,
  FizrukCustomExerciseSnapshot,
  FizrukDailyLogSnapshot,
  FizrukDualWriteOp,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukPlanTemplateSnapshot,
  FizrukProgramsSnapshot,
  FizrukWellbeingSnapshot,
  FizrukWorkoutSnapshot,
  FizrukWorkoutTemplateSnapshot,
} from "./diff";

/**
 * Stage 12.5 / PR #070f3-active-workout-dualwrite — the kv_store
 * key under which the active-workout id is mirrored. Mirrors the
 * MMKV slot constant `STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT` exactly
 * so a future tombstone PR can drain MMKV → kv_store on boot under
 * the same key.
 */
export const ACTIVE_WORKOUT_KV_KEY = "fizruk_active_workout_id_v1";

/**
 * Async SQLite-side adapter for the Fizruk dual-write layer.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/fizruk/lib/dualWrite/adapter.ts` — see the
 * web copy for the full design notes (best-effort, idempotency,
 * LWW guard).
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — extends mobile to
 * cover daily-log / monthly-plan / workout-template ops in parity
 * with web PR #070f-dualwrite. Each new op uses the same SQL surface
 * the web adapter ships, so unit-tests run unchanged on
 * `better-sqlite3`.
 *
 * Both copies use the same `SqliteMigrationClient` (`{exec, run, all}`)
 * shape so a single SQL surface serves both web (sqlite-wasm) and
 * mobile (expo-sqlite), and unit-tests run unchanged on `better-sqlite3`.
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
  readonly logger?: DualWriteLogger;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

export async function applyFizrukDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FizrukDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const logger = options.logger ?? DEFAULT_LOGGER;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(client, op, options);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

type ApplyOutcome = "applied" | "skipped";

async function applyOne(
  client: SqliteMigrationClient,
  op: FizrukDualWriteOp,
  options: ApplyDualWriteOptions,
): Promise<ApplyOutcome> {
  const { userId, clientTs } = options;
  switch (op.kind) {
    case "workout-upsert":
      await upsertWorkout(client, op.workout, userId, clientTs);
      return "applied";

    case "workout-delete":
      await softDeleteWorkout(client, op.workoutId, userId, clientTs);
      return "applied";

    case "custom-exercise-upsert":
      await upsertCustomExercise(client, op.exercise, userId, clientTs);
      return "applied";

    case "custom-exercise-delete":
      await softDeleteCustomExercise(client, op.exerciseId, userId, clientTs);
      return "applied";

    case "measurement-upsert":
      await upsertMeasurement(client, op.measurement, userId, clientTs);
      return "applied";

    case "measurement-delete":
      await softDeleteMeasurement(client, op.measurementId, userId, clientTs);
      return "applied";

    // Stage 12 / PR #070f-mobile-dualwrite ops -----------------------
    case "daily-log-upsert":
      await upsertDailyLog(client, op.entry, userId, clientTs);
      return "applied";

    case "daily-log-delete":
      await softDeleteDailyLog(client, op.entryId, userId, clientTs);
      return "applied";

    case "monthly-plan-set":
      await setMonthlyPlan(client, op.monthlyPlan, userId, clientTs);
      return "applied";

    case "workout-template-upsert":
      await upsertWorkoutTemplate(client, op.template, userId, clientTs);
      return "applied";

    case "workout-template-delete":
      await softDeleteWorkoutTemplate(client, op.templateId, userId, clientTs);
      return "applied";

    // Stage 12.5 / PR #070f2-mobile-dualwrite ops --------------------
    case "programs-set":
      await setPrograms(client, op.programs, userId, clientTs);
      return "applied";

    case "plan-template-set":
      await setPlanTemplate(client, op.planTemplate, userId, clientTs);
      return "applied";

    case "wellbeing-upsert":
      await upsertWellbeing(client, op.entry, userId, clientTs);
      return "applied";

    case "wellbeing-delete":
      await softDeleteWellbeing(client, op.dateKey, userId, clientTs);
      return "applied";

    // Stage 12.5 / PR #070f3-active-workout-dualwrite ---------------
    case "active-workout-set":
      await setActiveWorkout(client, op.activeWorkout, clientTs);
      return "applied";

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}

// -----------------------------------------------------------------------
// Workout upsert
// -----------------------------------------------------------------------

async function upsertWorkout(
  client: SqliteMigrationClient,
  w: FizrukWorkoutSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const groupsJson = JSON.stringify(w.groups ?? []);
  const warmupJson = w.warmup ? JSON.stringify(w.warmup) : null;
  const cooldownJson = w.cooldown ? JSON.stringify(w.cooldown) : null;
  const wellbeingJson = w.wellbeing ? JSON.stringify(w.wellbeing) : null;

  await client.run(
    `INSERT INTO fizruk_workouts
       (id, user_id, started_at, ended_at, note, groups_json,
        warmup_json, cooldown_json, wellbeing_json,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       started_at     = excluded.started_at,
       ended_at       = excluded.ended_at,
       note           = excluded.note,
       groups_json    = excluded.groups_json,
       warmup_json    = excluded.warmup_json,
       cooldown_json  = excluded.cooldown_json,
       wellbeing_json = excluded.wellbeing_json,
       updated_at     = excluded.updated_at,
       deleted_at     = NULL
     WHERE excluded.updated_at > fizruk_workouts.updated_at`,
    [
      w.id,
      userId,
      w.startedAt,
      w.endedAt ?? null,
      w.note ?? "",
      groupsJson,
      warmupJson,
      cooldownJson,
      wellbeingJson,
      clientTs,
      clientTs,
    ],
  );

  const items = w.items ?? [];
  for (let i = 0; i < items.length; i++) {
    await upsertWorkoutItem(client, items[i]!, w.id, userId, clientTs, i);
  }

  const itemIds = items.map((it) => it.id);
  await softDeleteRemovedChildren(
    client,
    "fizruk_workout_items",
    "workout_id",
    w.id,
    userId,
    clientTs,
    itemIds,
  );
}

async function upsertWorkoutItem(
  client: SqliteMigrationClient,
  item: FizrukItemSnapshot,
  workoutId: string,
  userId: string,
  clientTs: string,
  sortOrder: number,
): Promise<void> {
  const musclesPrimary = JSON.stringify(item.musclesPrimary ?? []);
  const musclesSecondary = JSON.stringify(item.musclesSecondary ?? []);

  await client.run(
    `INSERT INTO fizruk_workout_items
       (id, workout_id, user_id, exercise_id, name_uk, primary_group,
        muscles_primary, muscles_secondary, type, duration_sec, distance_m,
        sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       workout_id        = excluded.workout_id,
       exercise_id       = excluded.exercise_id,
       name_uk           = excluded.name_uk,
       primary_group     = excluded.primary_group,
       muscles_primary   = excluded.muscles_primary,
       muscles_secondary = excluded.muscles_secondary,
       type              = excluded.type,
       duration_sec      = excluded.duration_sec,
       distance_m        = excluded.distance_m,
       sort_order        = excluded.sort_order,
       updated_at        = excluded.updated_at,
       deleted_at        = NULL
     WHERE excluded.updated_at > fizruk_workout_items.updated_at`,
    [
      item.id,
      workoutId,
      userId,
      item.exerciseId ?? "",
      item.nameUk ?? "",
      item.primaryGroup ?? "",
      musclesPrimary,
      musclesSecondary,
      item.type ?? "strength",
      item.durationSec ?? null,
      item.distanceM ?? null,
      sortOrder,
      clientTs,
      clientTs,
    ],
  );

  const sets = item.sets ?? [];
  for (let s = 0; s < sets.length; s++) {
    const setId = `${item.id}:s${s}`;
    await upsertWorkoutSet(
      client,
      setId,
      item.id,
      userId,
      clientTs,
      sets[s]!,
      s,
    );
  }

  const setIds = sets.map((_, s) => `${item.id}:s${s}`);
  await softDeleteRemovedChildren(
    client,
    "fizruk_workout_sets",
    "workout_item_id",
    item.id,
    userId,
    clientTs,
    setIds,
  );
}

async function upsertWorkoutSet(
  client: SqliteMigrationClient,
  setId: string,
  workoutItemId: string,
  userId: string,
  clientTs: string,
  set: {
    weightKg: number;
    reps: number;
    rpe?: number | null;
    [k: string]: unknown;
  },
  sortOrder: number,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_workout_sets
       (id, workout_item_id, user_id, weight_kg, reps, rpe,
        sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       weight_kg       = excluded.weight_kg,
       reps            = excluded.reps,
       rpe             = excluded.rpe,
       sort_order      = excluded.sort_order,
       updated_at      = excluded.updated_at,
       deleted_at      = NULL
     WHERE excluded.updated_at > fizruk_workout_sets.updated_at`,
    [
      setId,
      workoutItemId,
      userId,
      set.weightKg ?? 0,
      set.reps ?? 0,
      set.rpe ?? null,
      sortOrder,
      clientTs,
      clientTs,
    ],
  );
}

// -----------------------------------------------------------------------
// Soft-delete helpers
// -----------------------------------------------------------------------

async function softDeleteWorkout(
  client: SqliteMigrationClient,
  workoutId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_workouts
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, workoutId, userId, clientTs],
  );
  await client.run(
    `UPDATE fizruk_workout_items
        SET deleted_at = ?, updated_at = ?
      WHERE workout_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [clientTs, clientTs, workoutId, userId],
  );
  await client.run(
    `UPDATE fizruk_workout_sets
        SET deleted_at = ?, updated_at = ?
      WHERE workout_item_id IN (
        SELECT id FROM fizruk_workout_items WHERE workout_id = ?
      ) AND user_id = ? AND deleted_at IS NULL`,
    [clientTs, clientTs, workoutId, userId],
  );
}

async function softDeleteCustomExercise(
  client: SqliteMigrationClient,
  exerciseId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_custom_exercises
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, exerciseId, userId, clientTs],
  );
}

async function softDeleteMeasurement(
  client: SqliteMigrationClient,
  measurementId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_measurements
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, measurementId, userId, clientTs],
  );
}

// -----------------------------------------------------------------------
// Custom exercise upsert
// -----------------------------------------------------------------------

async function upsertCustomExercise(
  client: SqliteMigrationClient,
  exercise: FizrukCustomExerciseSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const dataJson = JSON.stringify(exercise);
  await client.run(
    `INSERT INTO fizruk_custom_exercises
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > fizruk_custom_exercises.updated_at`,
    [exercise.id, userId, dataJson, clientTs, clientTs],
  );
}

// -----------------------------------------------------------------------
// Measurement upsert
// -----------------------------------------------------------------------

async function upsertMeasurement(
  client: SqliteMigrationClient,
  m: FizrukMeasurementSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_measurements
       (id, user_id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm,
        bicep_cm, sleep_hours, energy_level, mood,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       measured_at  = excluded.measured_at,
       weight_kg    = excluded.weight_kg,
       waist_cm     = excluded.waist_cm,
       chest_cm     = excluded.chest_cm,
       hips_cm      = excluded.hips_cm,
       bicep_cm     = excluded.bicep_cm,
       sleep_hours  = excluded.sleep_hours,
       energy_level = excluded.energy_level,
       mood         = excluded.mood,
       updated_at   = excluded.updated_at,
       deleted_at   = NULL
     WHERE excluded.updated_at > fizruk_measurements.updated_at`,
    [
      m.id,
      userId,
      m.at,
      toIntOrNull(m.weightKg),
      toIntOrNull(m.waistCm),
      toIntOrNull(m.chestCm),
      toIntOrNull(m.hipsCm),
      toIntOrNull(m.bicepCm),
      toIntOrNull(m.sleepHours),
      toIntOrNull(m.energyLevel),
      toIntOrNull(m.mood),
      clientTs,
      clientTs,
    ],
  );
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toRealOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — daily-log per-row upsert/soft-delete
// -----------------------------------------------------------------------

async function upsertDailyLog(
  client: SqliteMigrationClient,
  e: FizrukDailyLogSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_daily_log
       (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
        note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       entry_at      = excluded.entry_at,
       weight_kg     = excluded.weight_kg,
       sleep_hours   = excluded.sleep_hours,
       energy_level  = excluded.energy_level,
       mood          = excluded.mood,
       note          = excluded.note,
       updated_at    = excluded.updated_at,
       deleted_at    = NULL
     WHERE excluded.updated_at > fizruk_daily_log.updated_at`,
    [
      e.id,
      userId,
      e.at,
      toRealOrNull(e.weightKg),
      toRealOrNull(e.sleepHours),
      toIntOrNull(e.energyLevel),
      toIntOrNull(e.mood),
      e.note ?? "",
      clientTs,
      clientTs,
    ],
  );
}

async function softDeleteDailyLog(
  client: SqliteMigrationClient,
  entryId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_daily_log
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, entryId, userId, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — monthly-plan singleton row
// -----------------------------------------------------------------------

async function setMonthlyPlan(
  client: SqliteMigrationClient,
  monthlyPlan: FizrukMonthlyPlanSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_monthly_plan (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > fizruk_monthly_plan.updated_at`,
    [userId, monthlyPlan.dataJson ?? "{}", clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — workout-template per-row upsert/soft-delete
// -----------------------------------------------------------------------

async function upsertWorkoutTemplate(
  client: SqliteMigrationClient,
  t: FizrukWorkoutTemplateSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const exerciseIdsJson = JSON.stringify(
    Array.isArray(t.exerciseIds) ? t.exerciseIds.map(String) : [],
  );
  const groupsJson = JSON.stringify(Array.isArray(t.groups) ? t.groups : []);
  await client.run(
    `INSERT INTO fizruk_workout_templates
       (id, user_id, name, exercise_ids_json, groups_json, last_used_at,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name              = excluded.name,
       exercise_ids_json = excluded.exercise_ids_json,
       groups_json       = excluded.groups_json,
       last_used_at      = excluded.last_used_at,
       updated_at        = excluded.updated_at,
       deleted_at        = NULL
     WHERE excluded.updated_at > fizruk_workout_templates.updated_at`,
    [
      t.id,
      userId,
      t.name ?? "",
      exerciseIdsJson,
      groupsJson,
      t.lastUsedAt ?? null,
      clientTs,
      clientTs,
    ],
  );
}

async function softDeleteWorkoutTemplate(
  client: SqliteMigrationClient,
  templateId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_workout_templates
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, templateId, userId, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — programs singleton row
// -----------------------------------------------------------------------

async function setPrograms(
  client: SqliteMigrationClient,
  programs: FizrukProgramsSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_programs (user_id, active_program_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       active_program_id = excluded.active_program_id,
       updated_at        = excluded.updated_at
     WHERE excluded.updated_at > fizruk_programs.updated_at`,
    [userId, programs.activeProgramId ?? null, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — plan-template singleton row
// -----------------------------------------------------------------------

async function setPlanTemplate(
  client: SqliteMigrationClient,
  planTemplate: FizrukPlanTemplateSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_plan_templates (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > fizruk_plan_templates.updated_at`,
    [userId, planTemplate.dataJson ?? "null", clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — wellbeing per-(user,date) row
// -----------------------------------------------------------------------

async function upsertWellbeing(
  client: SqliteMigrationClient,
  e: FizrukWellbeingSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_wellbeing
       (user_id, date_key, mood, energy, sleep_quality, sleep_hours,
        notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, date_key) DO UPDATE SET
       mood          = excluded.mood,
       energy        = excluded.energy,
       sleep_quality = excluded.sleep_quality,
       sleep_hours   = excluded.sleep_hours,
       notes         = excluded.notes,
       updated_at    = excluded.updated_at,
       deleted_at    = NULL
     WHERE excluded.updated_at > fizruk_wellbeing.updated_at`,
    [
      userId,
      e.dateKey,
      toIntOrNull(e.mood),
      toIntOrNull(e.energy),
      toIntOrNull(e.sleepQuality),
      toRealOrNull(e.sleepHours),
      e.notes ?? "",
      clientTs,
      clientTs,
    ],
  );
}

async function softDeleteWellbeing(
  client: SqliteMigrationClient,
  dateKey: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_wellbeing
        SET deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND date_key = ? AND updated_at < ?`,
    [clientTs, clientTs, userId, dateKey, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f3-active-workout-dualwrite — active-workout
// kv_store slot writer
// -----------------------------------------------------------------------

/**
 * Mirror the active-workout id into the shared `kv_store` table at
 * key `fizruk_active_workout_id_v1`. The `value` column is
 * `JSON.stringify(activeWorkoutId)` — a JSON-encoded `string`
 * (`'"abc"'`) for an active id, or the JSON literal `'null'` when
 * the slot is cleared. The `updated_at` column is `INTEGER` epoch
 * millis (per the `kvStore` Drizzle schema), so we coerce `clientTs`
 * (ISO 8601) via `Date.parse` and apply the LWW guard against the
 * existing row's `updated_at`.
 *
 * Unlike the per-table writers above, this op does **not** scope the
 * row to a `user_id`: `kv_store` is a per-device table (no
 * server-side counterpart) and the active-workout slot is a single
 * device-local string. Multi-account devices share the same
 * `kv_store` row across users — matching the existing MMKV slot
 * `STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT` semantics.
 */
async function setActiveWorkout(
  client: SqliteMigrationClient,
  activeWorkout: FizrukActiveWorkoutSnapshot,
  clientTs: string,
): Promise<void> {
  const id = activeWorkout.activeWorkoutId;
  const value = JSON.stringify(id ?? null);
  const parsed = Date.parse(clientTs);
  const updatedAtMs = Number.isFinite(parsed) ? parsed : Date.now();
  await client.run(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value      = excluded.value,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > kv_store.updated_at`,
    [ACTIVE_WORKOUT_KV_KEY, value, updatedAtMs],
  );
}

// -----------------------------------------------------------------------
// Child-row cleanup
// -----------------------------------------------------------------------

async function softDeleteRemovedChildren(
  client: SqliteMigrationClient,
  tableName: string,
  parentCol: string,
  parentId: string,
  userId: string,
  clientTs: string,
  keepIds: string[],
): Promise<void> {
  if (keepIds.length === 0) {
    await client.run(
      `UPDATE ${tableName}
          SET deleted_at = ?, updated_at = ?
        WHERE ${parentCol} = ? AND user_id = ? AND deleted_at IS NULL`,
      [clientTs, clientTs, parentId, userId],
    );
    return;
  }
  const placeholders = keepIds.map(() => "?").join(",");
  await client.run(
    `UPDATE ${tableName}
        SET deleted_at = ?, updated_at = ?
      WHERE ${parentCol} = ?
        AND user_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (${placeholders})`,
    [clientTs, clientTs, parentId, userId, ...keepIds],
  );
}
