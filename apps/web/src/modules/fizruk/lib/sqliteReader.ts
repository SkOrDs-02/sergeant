/**
 * SQLite-backed read path for Фізрук (workouts / items / sets,
 * custom exercises, measurements).
 *
 * Stage 4 PR #029 of `docs/planning/storage-roadmap.md`. When the
 * `feature.fizruk.sqlite_v2.read_sqlite` flag is on, the public hooks
 * (`useWorkouts`, `useExerciseCatalog`, `useMeasurements`) overlay
 * their state from this cache instead of from the LS blob. LS writes
 * still happen — they remain as a safety net during the cutover (PR
 * #029 cuts over reads only; PR #030 drops the LS path).
 *
 * Mirror of `apps/web/src/modules/routine/lib/sqliteReader.ts`. The
 * cache is a plain JS object so the merge into the React state is a
 * single object-spread on every read.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  ChecklistItem,
  Workout,
  WorkoutItem,
  WorkoutGroup,
} from "@sergeant/fizruk-domain/domain";
import type { FizrukData } from "@sergeant/fizruk-domain";
import type { MeasurementEntry } from "../hooks/useMeasurements";

type RawExerciseDef = FizrukData.RawExerciseDef;

/**
 * Stage 12 / PR #070f-dualwrite — minimal cache shapes for the new
 * tables. The hook-side TypeScript types live alongside the hooks
 * themselves; the cache only needs the structural shape used by both
 * the LS-compat React state and the `extract*Snapshot` helpers in
 * `fizrukDualWriteState.ts`.
 */
export interface CachedDailyLogEntry {
  id: string;
  at: string;
  weightKg: number | null;
  sleepHours: number | null;
  energyLevel: number | null;
  /** Coalesced from `mood` (DB column). The web hook also reads it as `moodScore`. */
  moodScore: number | null;
  note: string;
}

export interface CachedMonthlyPlanState {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  days: Record<string, { templateId: string }>;
}

export interface CachedWorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  groups: unknown[];
  updatedAt: string;
  lastUsedAt?: string | null;
}

export interface SqliteFizrukCache {
  /** Workouts ordered newest-first by `startedAt`. */
  workouts: Workout[];
  /** Custom exercises (additions on top of the static catalogue). */
  customExercises: RawExerciseDef[];
  /** Body / wellbeing measurements ordered newest-first by `at`. */
  measurements: MeasurementEntry[];
  /**
   * Daily-log entries ordered newest-first by `at`. Stage 12 /
   * PR #070f-dualwrite. Empty array means «no rows yet».
   */
  dailyLog: CachedDailyLogEntry[];
  /**
   * Singleton monthly-plan document. `null` means «no row in
   * `fizruk_monthly_plan` yet» — consumers should treat that as the
   * default-empty state. Stage 12 / PR #070f-dualwrite.
   */
  monthlyPlan: CachedMonthlyPlanState | null;
  /**
   * Workout templates ordered newest-first by `updatedAt`. Stage 12 /
   * PR #070f-dualwrite. Empty array means «no template rows yet».
   */
  workoutTemplates: CachedWorkoutTemplate[];
  /** ISO timestamp of the last successful refresh, or null. */
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteFizrukCache = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  refreshedAt: null,
};

let cache: SqliteFizrukCache = { ...EMPTY_CACHE };

/** Returns the current cached fizruk state (sync, zero-cost). */
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
    const parsed = JSON.parse(raw);
    return parsed as T;
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

function rowToMeasurement(row: MeasurementRow): MeasurementEntry {
  const entry: MeasurementEntry = { id: row.id, at: row.measured_at };
  if (row.weight_kg != null) entry.weightKg = row.weight_kg;
  if (row.waist_cm != null) entry.waistCm = row.waist_cm;
  if (row.chest_cm != null) entry.chestCm = row.chest_cm;
  if (row.hips_cm != null) entry.hipsCm = row.hips_cm;
  if (row.bicep_cm != null) {
    // bicep_cm is the only side-agnostic column; surface to both
    // legacy fields used by the UI hook.
    entry.bicepLCm = row.bicep_cm;
    entry.bicepRCm = row.bicep_cm;
  }
  if (row.sleep_hours != null) entry.sleepHours = row.sleep_hours;
  if (row.energy_level != null) entry.energyLevel = row.energy_level;
  if (row.mood != null) entry.mood = row.mood;
  return entry;
}

// Stage 12 / PR #070f-dualwrite — row shapes for the new tables.
interface DailyLogRow {
  id: string;
  at: string;
  weight_kg: number | null;
  sleep_hours: number | null;
  energy_level: number | null;
  mood: number | null;
  note: string | null;
  [key: string]: unknown;
}

interface MonthlyPlanRow {
  data_json: string | null;
  [key: string]: unknown;
}

interface WorkoutTemplateRow {
  id: string;
  name: string | null;
  exercise_ids_json: string | null;
  groups_json: string | null;
  updated_at: string | null;
  last_used_at: string | null;
  [key: string]: unknown;
}

function rowToDailyLog(row: DailyLogRow): CachedDailyLogEntry {
  return {
    id: row.id,
    at: row.at,
    weightKg: row.weight_kg ?? null,
    sleepHours: row.sleep_hours ?? null,
    energyLevel: row.energy_level ?? null,
    moodScore: row.mood ?? null,
    note: row.note ?? "",
  };
}

function rowToWorkoutTemplate(row: WorkoutTemplateRow): CachedWorkoutTemplate {
  return {
    id: row.id,
    name: row.name ?? "",
    exerciseIds: safeParseJson<string[]>(row.exercise_ids_json, []),
    groups: safeParseJson<unknown[]>(row.groups_json, []),
    updatedAt: row.updated_at ?? "",
    lastUsedAt: row.last_used_at ?? null,
  };
}

function rowToMonthlyPlan(
  row: MonthlyPlanRow | undefined,
): CachedMonthlyPlanState | null {
  if (!row || !row.data_json) return null;
  try {
    const parsed = JSON.parse(row.data_json) as Partial<CachedMonthlyPlanState>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      reminderEnabled: parsed.reminderEnabled !== false,
      reminderHour: Number.isFinite(parsed.reminderHour)
        ? Math.max(0, Math.min(23, parsed.reminderHour ?? 18))
        : 18,
      reminderMinute: Number.isFinite(parsed.reminderMinute)
        ? Math.max(0, Math.min(59, parsed.reminderMinute ?? 0))
        : 0,
      days:
        parsed.days && typeof parsed.days === "object"
          ? (parsed.days as Record<string, { templateId: string }>)
          : {},
    };
  } catch {
    return null;
  }
}

/**
 * Refresh the fizruk cache from the local SQLite tables. Reads all
 * active (non-tombstoned) rows for `userId`, joins items↔sets, and
 * sorts the result so the hook output matches the LS shape.
 */
export async function refreshFizrukSqliteState(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteFizrukCache> {
  const [
    workoutRows,
    itemRows,
    setRows,
    customRows,
    measurementRows,
    dailyLogRows,
    monthlyPlanRows,
    workoutTemplateRows,
  ] = await Promise.all([
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
    client.all<DailyLogRow>(
      `SELECT id, entry_at, weight_kg, sleep_hours, energy_level, mood, note
         FROM fizruk_daily_log
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY entry_at DESC, id ASC`,
      [userId],
    ),
    client.all<MonthlyPlanRow>(
      `SELECT data_json FROM fizruk_monthly_plan WHERE user_id = ?`,
      [userId],
    ),
    client.all<WorkoutTemplateRow>(
      `SELECT id, name, exercise_ids_json, groups_json,
              updated_at, last_used_at
         FROM fizruk_workout_templates
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, id ASC`,
      [userId],
    ),
  ]);

  // Build sets-by-item map first.
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

  // Build items-by-workout map.
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
  const dailyLog = dailyLogRows.map(rowToDailyLog);
  const monthlyPlan = rowToMonthlyPlan(monthlyPlanRows[0]);
  const workoutTemplates = workoutTemplateRows.map(rowToWorkoutTemplate);

  cache = {
    workouts,
    customExercises,
    measurements,
    dailyLog,
    monthlyPlan,
    workoutTemplates,
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}

/** Reset cache — used by tests and when the flag is toggled off. */
export function clearFizrukSqliteCache(): void {
  cache = { ...EMPTY_CACHE };
}

/**
 * Test helper: seed the cache directly without running migrations /
 * SQLite queries. The provided fields override the empty defaults and
 * the cache is marked as refreshed (`refreshedAt`) so consumers treat
 * it as warm.
 *
 * Stage 8 PR #057f-tombstone — used by hook tests now that the
 * load/persist surface reads from this cache instead of LS.
 */
export function __setFizrukSqliteCacheForTests(
  partial: Partial<SqliteFizrukCache>,
): void {
  cache = {
    ...EMPTY_CACHE,
    refreshedAt: new Date().toISOString(),
    ...partial,
  };
}
