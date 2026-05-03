/**
 * SQLite-backed read path for Фізрук (mobile).
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/sqliteReader.ts` — see
 * the web copy for the full design rationale (PR #029 of
 * `docs/planning/storage-roadmap.md`). Mobile keeps the cache shape
 * and refresh helper at parity so a later mobile read-cutover PR
 * can wire the hook overlay without touching the data layer.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  ChecklistItem,
  Workout,
  WorkoutItem,
  WorkoutGroup,
} from "@sergeant/fizruk-domain/domain";
import type { FizrukData } from "@sergeant/fizruk-domain";

type RawExerciseDef = FizrukData.RawExerciseDef;

/** Raw measurement entry mirrored to the mobile MMKV slot. */
export interface FizrukMeasurementEntry {
  id: string;
  at: string;
  [field: string]: number | string | undefined;
}

export interface SqliteFizrukCache {
  workouts: Workout[];
  customExercises: RawExerciseDef[];
  measurements: FizrukMeasurementEntry[];
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteFizrukCache = {
  workouts: [],
  customExercises: [],
  measurements: [],
  refreshedAt: null,
};

let cache: SqliteFizrukCache = { ...EMPTY_CACHE };

export function getCachedFizrukSqliteState(): SqliteFizrukCache {
  return cache;
}

interface WorkoutRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  groups_json: string | null;
  warmup_json: string | null;
  cooldown_json: string | null;
  wellbeing_json: string | null;
  [key: string]: unknown;
}

interface WorkoutItemRow {
  id: string;
  workout_id: string;
  exercise_id: string | null;
  name_uk: string | null;
  primary_group: string | null;
  muscles_primary: string | null;
  muscles_secondary: string | null;
  type: string | null;
  duration_sec: number | null;
  distance_m: number | null;
  sort_order: number | null;
  [key: string]: unknown;
}

interface WorkoutSetRow {
  id: string;
  workout_item_id: string;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  sort_order: number | null;
  [key: string]: unknown;
}

interface CustomExerciseRow {
  id: string;
  data_json: string | null;
  [key: string]: unknown;
}

interface MeasurementRow {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  bicep_cm: number | null;
  sleep_hours: number | null;
  energy_level: number | null;
  mood: number | null;
  [key: string]: unknown;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToWorkout(
  row: WorkoutRow,
  itemsByWorkout: Map<string, WorkoutItem[]>,
): Workout {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    note: row.note ?? "",
    groups: safeParseJson<WorkoutGroup[]>(row.groups_json, []),
    warmup: row.warmup_json
      ? safeParseJson<ChecklistItem[]>(row.warmup_json, [])
      : null,
    cooldown: row.cooldown_json
      ? safeParseJson<ChecklistItem[]>(row.cooldown_json, [])
      : null,
    items: itemsByWorkout.get(row.id) ?? [],
  };
}

function rowToWorkoutItem(
  row: WorkoutItemRow,
  setsByItem: Map<string, WorkoutItem["sets"]>,
): WorkoutItem {
  const type =
    row.type === "distance" || row.type === "time" || row.type === "strength"
      ? row.type
      : "strength";
  const item: WorkoutItem = {
    id: row.id,
    exerciseId: row.exercise_id ?? "",
    nameUk: row.name_uk ?? "",
    primaryGroup: row.primary_group ?? "",
    musclesPrimary: safeParseJson<string[]>(row.muscles_primary, []),
    musclesSecondary: safeParseJson<string[]>(row.muscles_secondary, []),
    type,
  };
  const sets = setsByItem.get(row.id);
  if (sets && sets.length > 0) item.sets = sets;
  if (row.duration_sec != null) item.durationSec = row.duration_sec;
  if (row.distance_m != null) item.distanceM = row.distance_m;
  return item;
}

function rowToCustomExercise(row: CustomExerciseRow): RawExerciseDef | null {
  if (!row.data_json) return null;
  const parsed = safeParseJson<RawExerciseDef | null>(row.data_json, null);
  if (!parsed || typeof parsed !== "object") return null;
  return { ...parsed, id: row.id };
}

function rowToMeasurement(row: MeasurementRow): FizrukMeasurementEntry {
  const entry: FizrukMeasurementEntry = { id: row.id, at: row.measured_at };
  if (row.weight_kg != null) entry.weightKg = row.weight_kg;
  if (row.waist_cm != null) entry.waistCm = row.waist_cm;
  if (row.chest_cm != null) entry.chestCm = row.chest_cm;
  if (row.hips_cm != null) entry.hipsCm = row.hips_cm;
  if (row.bicep_cm != null) {
    entry.bicepLCm = row.bicep_cm;
    entry.bicepRCm = row.bicep_cm;
  }
  if (row.sleep_hours != null) entry.sleepHours = row.sleep_hours;
  if (row.energy_level != null) entry.energyLevel = row.energy_level;
  if (row.mood != null) entry.mood = row.mood;
  return entry;
}

export async function refreshFizrukSqliteState(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteFizrukCache> {
  const [workoutRows, itemRows, setRows, customRows, measurementRows] =
    await Promise.all([
      client.all<WorkoutRow>(
        `SELECT id, started_at, ended_at, note, groups_json,
                warmup_json, cooldown_json, wellbeing_json
           FROM fizruk_workouts
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY started_at DESC`,
        [userId],
      ),
      client.all<WorkoutItemRow>(
        `SELECT id, workout_id, exercise_id, name_uk, primary_group,
                muscles_primary, muscles_secondary, type,
                duration_sec, distance_m, sort_order
           FROM fizruk_workout_items
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY workout_id ASC, sort_order ASC, id ASC`,
        [userId],
      ),
      client.all<WorkoutSetRow>(
        `SELECT id, workout_item_id, weight_kg, reps, rpe, sort_order
           FROM fizruk_workout_sets
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY workout_item_id ASC, sort_order ASC, id ASC`,
        [userId],
      ),
      client.all<CustomExerciseRow>(
        `SELECT id, data_json
           FROM fizruk_custom_exercises
          WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      ),
      client.all<MeasurementRow>(
        `SELECT id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm,
                bicep_cm, sleep_hours, energy_level, mood
           FROM fizruk_measurements
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY measured_at DESC`,
        [userId],
      ),
    ]);

  const setsByItem = new Map<string, WorkoutItem["sets"]>();
  for (const row of setRows) {
    const arr = setsByItem.get(row.workout_item_id) ?? [];
    arr.push({
      weightKg: row.weight_kg ?? 0,
      reps: row.reps ?? 0,
      ...(row.rpe != null ? { rpe: row.rpe } : {}),
    });
    setsByItem.set(row.workout_item_id, arr);
  }

  const itemsByWorkout = new Map<string, WorkoutItem[]>();
  for (const row of itemRows) {
    const arr = itemsByWorkout.get(row.workout_id) ?? [];
    arr.push(rowToWorkoutItem(row, setsByItem));
    itemsByWorkout.set(row.workout_id, arr);
  }

  const workouts = workoutRows.map((row) => rowToWorkout(row, itemsByWorkout));
  const customExercises = customRows
    .map(rowToCustomExercise)
    .filter((x): x is RawExerciseDef => x !== null);
  const measurements = measurementRows.map(rowToMeasurement);

  cache = {
    workouts,
    customExercises,
    measurements,
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}

export function clearFizrukSqliteCache(): void {
  cache = { ...EMPTY_CACHE };
}
