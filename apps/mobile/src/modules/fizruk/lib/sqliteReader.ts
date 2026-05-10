/**
 * SQLite-backed read path for Фізрук (mobile).
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/sqliteReader.ts` — see
 * the web copy for the full design rationale (PR #029 of
 * `docs/planning/storage-roadmap.md`). Mobile keeps the cache shape
 * and refresh helper at parity so a later mobile read-cutover PR
 * can wire the hook overlay without touching the data layer.
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — extends the cache to
 * cover the three new entity classes shipped by web PR #070f-dualwrite:
 * `fizruk_daily_log`, `fizruk_monthly_plan`, `fizruk_workout_templates`.
 * The cache is consumed by `peekFizrukDualWriteState()` so each
 * dual-write trigger sees the SQLite-backed `prev` state for all
 * six classes.
 *
 * **Stage 12.5 / PR #070f2-mobile-dualwrite** — extends the cache to
 * cover the three remaining mobile-only entity classes
 * (`fizruk_programs`, `fizruk_plan_templates`, `fizruk_wellbeing`).
 * The shape mirrors the hook payloads so a later read cutover can
 * drive the hooks straight from the cache.
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

/**
 * Stage 12 / PR #070f-mobile-dualwrite — cached daily-log entry.
 * Mirrors the `fizruk_daily_log` row shape; `at` carries the same
 * timestamp the LS hook persists, so cache-derived snapshots stay
 * byte-equal to the diff input.
 */
export interface CachedDailyLogEntry {
  id: string;
  at: string;
  weightKg: number | null;
  sleepHours: number | null;
  energyLevel: number | null;
  mood: number | null;
  note: string;
}

/**
 * Stage 12 / PR #070f-mobile-dualwrite — cached monthly-plan
 * singleton. The whole document is held verbatim so a later read
 * cutover can pass the parsed object back to the hook without
 * round-tripping through JSON twice.
 */
export interface CachedMonthlyPlanState {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  days: Record<string, { templateId: string }>;
}

/** Stage 12 / PR #070f-mobile-dualwrite — cached workout-template. */
export interface CachedWorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  groups: unknown[];
  updatedAt: string;
  lastUsedAt: string | null;
}

/**
 * Stage 12.5 / PR #070f2-mobile-dualwrite — cached programs row.
 * Only the active-program id needs to round-trip; the catalogue is
 * shipped with the bundle.
 */
export interface CachedProgramsState {
  activeProgramId: string | null;
}

/**
 * Stage 12.5 / PR #070f2-mobile-dualwrite — cached plan-template
 * singleton. The hook persists either a free-form object or `null`,
 * so we keep the JSON blob verbatim and let the consumer parse it.
 */
export interface CachedPlanTemplateState {
  /** Verbatim JSON blob from `fizruk_plan_templates.data_json`
   * (default `'null'` for the empty slot). */
  dataJson: string;
}

/** Stage 12.5 / PR #070f2-mobile-dualwrite — cached wellbeing entry. */
export interface CachedWellbeingEntry {
  date: string;
  mood: number | null;
  energy: number | null;
  sleepQuality: number | null;
  sleepHours: number | null;
  notes: string;
  updatedAt: string;
}

export interface SqliteFizrukCache {
  workouts: Workout[];
  customExercises: RawExerciseDef[];
  measurements: FizrukMeasurementEntry[];
  /** Stage 12 / PR #070f-mobile-dualwrite. */
  dailyLog: CachedDailyLogEntry[];
  /** Stage 12 / PR #070f-mobile-dualwrite. `null` ≡ "no row yet". */
  monthlyPlan: CachedMonthlyPlanState | null;
  /** Stage 12 / PR #070f-mobile-dualwrite. */
  workoutTemplates: CachedWorkoutTemplate[];
  /** Stage 12.5 / PR #070f2-mobile-dualwrite. `null` ≡ "no row yet". */
  programs: CachedProgramsState | null;
  /** Stage 12.5 / PR #070f2-mobile-dualwrite. `null` ≡ "no row yet". */
  planTemplate: CachedPlanTemplateState | null;
  /** Stage 12.5 / PR #070f2-mobile-dualwrite. */
  wellbeing: CachedWellbeingEntry[];
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteFizrukCache = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  programs: null,
  planTemplate: null,
  wellbeing: [],
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

// Stage 12 / PR #070f-mobile-dualwrite — row shapes for the new tables.
interface DailyLogRow {
  id: string;
  entry_at: string;
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
  last_used_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
}

// Stage 12.5 / PR #070f2-mobile-dualwrite — row shapes for the new tables.
interface ProgramsRow {
  active_program_id: string | null;
  [key: string]: unknown;
}

interface PlanTemplateRow {
  data_json: string | null;
  [key: string]: unknown;
}

interface WellbeingRow {
  date_key: string;
  mood: number | null;
  energy: number | null;
  sleep_quality: number | null;
  sleep_hours: number | null;
  notes: string | null;
  updated_at: string | null;
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

// Stage 12 / PR #070f-mobile-dualwrite — row mappers ---------------------

function rowToDailyLog(row: DailyLogRow): CachedDailyLogEntry {
  return {
    id: String(row.id),
    at: String(row.entry_at),
    weightKg: row.weight_kg ?? null,
    sleepHours: row.sleep_hours ?? null,
    energyLevel: row.energy_level ?? null,
    mood: row.mood ?? null,
    note: row.note ?? "",
  };
}

function rowToWorkoutTemplate(row: WorkoutTemplateRow): CachedWorkoutTemplate {
  return {
    id: String(row.id),
    name: row.name ?? "",
    exerciseIds: safeParseJson<string[]>(row.exercise_ids_json, []),
    groups: safeParseJson<unknown[]>(row.groups_json, []),
    updatedAt: row.updated_at ?? "",
    lastUsedAt: row.last_used_at ?? null,
  };
}

// Stage 12.5 / PR #070f2-mobile-dualwrite — row mappers ------------------

function rowToPrograms(
  row: ProgramsRow | undefined,
): CachedProgramsState | null {
  if (!row) return null;
  return {
    activeProgramId:
      typeof row.active_program_id === "string" &&
      row.active_program_id.length > 0
        ? row.active_program_id
        : null,
  };
}

function rowToPlanTemplate(
  row: PlanTemplateRow | undefined,
): CachedPlanTemplateState | null {
  if (!row) return null;
  return { dataJson: row.data_json ?? "null" };
}

function rowToWellbeing(row: WellbeingRow): CachedWellbeingEntry {
  return {
    date: String(row.date_key),
    mood: row.mood ?? null,
    energy: row.energy ?? null,
    sleepQuality: row.sleep_quality ?? null,
    sleepHours: row.sleep_hours ?? null,
    notes: row.notes ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function rowToMonthlyPlan(
  row: MonthlyPlanRow | undefined,
): CachedMonthlyPlanState | null {
  if (!row) return null;
  const parsed = safeParseJson<Partial<CachedMonthlyPlanState> | null>(
    row.data_json,
    null,
  );
  if (!parsed || typeof parsed !== "object") return null;
  const days: Record<string, { templateId: string }> = {};
  if (parsed.days && typeof parsed.days === "object") {
    for (const [k, v] of Object.entries(parsed.days)) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as { templateId?: unknown }).templateId === "string"
      ) {
        days[k] = { templateId: (v as { templateId: string }).templateId };
      }
    }
  }
  return {
    reminderEnabled: parsed.reminderEnabled !== false,
    reminderHour: Number.isFinite(parsed.reminderHour)
      ? Math.max(0, Math.min(23, parsed.reminderHour ?? 18))
      : 18,
    reminderMinute: Number.isFinite(parsed.reminderMinute)
      ? Math.max(0, Math.min(59, parsed.reminderMinute ?? 0))
      : 0,
    days,
  };
}

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
    programsRows,
    planTemplateRows,
    wellbeingRows,
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
    // Stage 12 / PR #070f-mobile-dualwrite ----------------------------
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
      `SELECT id, name, exercise_ids_json, groups_json, last_used_at, updated_at
           FROM fizruk_workout_templates
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC, id ASC`,
      [userId],
    ),
    // Stage 12.5 / PR #070f2-mobile-dualwrite ------------------------
    client.all<ProgramsRow>(
      `SELECT active_program_id FROM fizruk_programs WHERE user_id = ?`,
      [userId],
    ),
    client.all<PlanTemplateRow>(
      `SELECT data_json FROM fizruk_plan_templates WHERE user_id = ?`,
      [userId],
    ),
    client.all<WellbeingRow>(
      `SELECT date_key, mood, energy, sleep_quality, sleep_hours, notes, updated_at
           FROM fizruk_wellbeing
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY date_key DESC`,
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
  const dailyLog = dailyLogRows.map(rowToDailyLog);
  const monthlyPlan = rowToMonthlyPlan(monthlyPlanRows[0]);
  const workoutTemplates = workoutTemplateRows.map(rowToWorkoutTemplate);
  const programs = rowToPrograms(programsRows[0]);
  const planTemplate = rowToPlanTemplate(planTemplateRows[0]);
  const wellbeing = wellbeingRows.map(rowToWellbeing);

  cache = {
    workouts,
    customExercises,
    measurements,
    dailyLog,
    monthlyPlan,
    workoutTemplates,
    programs,
    planTemplate,
    wellbeing,
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}

export function clearFizrukSqliteCache(): void {
  cache = { ...EMPTY_CACHE };
}

/**
 * Test helper: seed the cache directly without running migrations /
 * SQLite queries. The provided fields override the empty defaults and
 * the cache is marked as refreshed (`refreshedAt`) so consumers treat
 * it as warm.
 *
 * Stage 8 PR #057f-tombstone — used by mobile hook tests now that the
 * load/persist surface reads from this cache instead of MMKV.
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
