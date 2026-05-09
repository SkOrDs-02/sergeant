import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for the `fizruk_workouts` table.
 *
 * Mirrors the Postgres version from `apps/server/src/migrations/029_fizruk_tables.sql`
 * and `packages/db-schema/src/pg/fizruk.ts`. Hosts the Fizruk workout sessions
 * on SQLite for both surfaces — web (sqlite-wasm via OPFS-SAH) and mobile
 * (`expo-sqlite`).
 *
 * Stage 4 / PR #027 of `docs/planning/storage-roadmap.md`.
 *
 * Differences from Postgres:
 * - `id` is TEXT (UUID stored as a string — SQLite has no native UUID).
 *   Generation is the client's responsibility (`crypto.randomUUID()`).
 * - All TIMESTAMPTZ columns are TEXT (ISO-8601 with offset).
 * - JSONB → TEXT (JSON stored as string in SQLite).
 * - No FK to `"user"(id)` — the client SQLite database has no auth tables.
 * - Index names are `_lite`-suffixed to spot drift between server and client.
 */
export const fizrukWorkouts = sqliteTable(
  "fizruk_workouts",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    note: text().notNull().default(""),
    groupsJson: text("groups_json").notNull().default("[]"),
    warmupJson: text("warmup_json"),
    cooldownJson: text("cooldown_json"),
    wellbeingJson: text("wellbeing_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_workouts_user_started_idx_lite").on(
      table.userId,
      sql`${table.startedAt} DESC`,
    ),
    index("fizruk_workouts_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `fizruk_workout_items` table.
 *
 * Per-exercise entries within a workout. Denormalized exercise metadata
 * preserved so deleted exercises don't break historical display.
 */
export const fizrukWorkoutItems = sqliteTable(
  "fizruk_workout_items",
  {
    id: text().primaryKey(),
    workoutId: text("workout_id").notNull(),
    userId: text("user_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    nameUk: text("name_uk").notNull(),
    primaryGroup: text("primary_group").notNull().default(""),
    musclesPrimary: text("muscles_primary").notNull().default("[]"),
    musclesSecondary: text("muscles_secondary").notNull().default("[]"),
    type: text().notNull().default("strength"),
    durationSec: integer("duration_sec"),
    distanceM: integer("distance_m"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_workout_items_workout_idx_lite").on(
      table.workoutId,
      table.sortOrder,
    ),
    index("fizruk_workout_items_user_idx_lite").on(table.userId),
  ],
);

/**
 * SQLite schema for the `fizruk_workout_sets` table.
 *
 * Per-set entries within a workout item. Core trackable: weight x reps.
 * `weight_kg` and `rpe` use REAL in both SQLite and Postgres.
 */
export const fizrukWorkoutSets = sqliteTable(
  "fizruk_workout_sets",
  {
    id: text().primaryKey(),
    workoutItemId: text("workout_item_id").notNull(),
    userId: text("user_id").notNull(),
    weightKg: integer("weight_kg").notNull().default(0),
    reps: integer().notNull().default(0),
    rpe: integer(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_workout_sets_item_idx_lite").on(
      table.workoutItemId,
      table.sortOrder,
    ),
  ],
);

/**
 * SQLite schema for the `fizruk_custom_exercises` table.
 *
 * User-defined exercises. Full definition stored as JSON text.
 */
export const fizrukCustomExercises = sqliteTable(
  "fizruk_custom_exercises",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_custom_exercises_user_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `fizruk_measurements` table.
 *
 * Body measurements and wellbeing scores. One row per measurement session.
 * All numeric fields nullable — the user picks which to fill.
 */
export const fizrukMeasurements = sqliteTable(
  "fizruk_measurements",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    measuredAt: text("measured_at").notNull(),
    weightKg: integer("weight_kg"),
    waistCm: integer("waist_cm"),
    chestCm: integer("chest_cm"),
    hipsCm: integer("hips_cm"),
    bicepCm: integer("bicep_cm"),
    sleepHours: integer("sleep_hours"),
    energyLevel: integer("energy_level"),
    mood: integer(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_measurements_user_date_idx_lite").on(
      table.userId,
      sql`${table.measuredAt} DESC`,
    ),
  ],
);

/**
 * SQLite schema for `fizruk_daily_log`.
 *
 * Per-row daily wellbeing/weight log entries (one entry per
 * `{ id, user_id }` pair) — the slice currently persisted via
 * `safeWriteLS(STORAGE_KEYS.FIZRUK_DAILY_LOG, ...)` in
 * `apps/{web,mobile}/src/modules/fizruk/hooks/useDailyLog.ts`.
 *
 * Stage 12 / PR #070f-schema of `docs/planning/storage-roadmap.md`.
 *
 * Differences from `fizruk_measurements` (the closest existing slot):
 *  - `daily_log` rows are user-edited diary entries with the full
 *    mood / sleep / energy / weight quartet, while `measurements` is
 *    body-circumference focused. Both share `user_id` + ISO-8601
 *    timestamps; mood is normalised to a single integer column
 *    (web's `moodScore` and mobile's `mood` map onto this slot in
 *    the dual-write adapter).
 *  - `weight_kg` and `sleep_hours` are REAL — the input form accepts
 *    half-hour sleep ticks (`7.5`) and decimal weights (`72.4 kg`).
 */
export const fizrukDailyLog = sqliteTable(
  "fizruk_daily_log",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    entryAt: text("entry_at").notNull(),
    weightKg: real("weight_kg"),
    sleepHours: real("sleep_hours"),
    energyLevel: integer("energy_level"),
    mood: integer(),
    note: text().notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_daily_log_user_entry_idx_lite").on(
      table.userId,
      sql`${table.entryAt} DESC`,
    ),
    index("fizruk_daily_log_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for `fizruk_monthly_plan`.
 *
 * Singleton-per-user JSON blob backing the
 * `STORAGE_KEYS.FIZRUK_MONTHLY_PLAN` slot (`fizruk_monthly_plan_v1`)
 * — `{ reminderEnabled, reminderHour, reminderMinute, days:
 * Record<dateKey, { templateId }> }`.
 *
 * Stage 12 / PR #070f-schema. Pattern matches `routine_prefs` /
 * `nutrition_prefs` (one row per user, full state in `*_json`).
 */
export const fizrukMonthlyPlan = sqliteTable("fizruk_monthly_plan", {
  userId: text("user_id").primaryKey(),
  dataJson: text("data_json").notNull().default("{}"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * SQLite schema for `fizruk_plan_templates`.
 *
 * Singleton-per-user "Plan template" slot backing
 * `STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE` (`fizruk_plan_template_v1`).
 * The hook (`apps/mobile/src/modules/fizruk/hooks/usePlanTemplate.ts`)
 * persists either a single object `{ id, name, weekday, notes,
 * updatedAt }` or `null`. We store the JSON literal `'null'` for the
 * empty slot to keep the row present (and the LWW timestamp valid)
 * without a separate "is empty" column.
 *
 * Stage 12 / PR #070f-schema.
 */
export const fizrukPlanTemplates = sqliteTable("fizruk_plan_templates", {
  userId: text("user_id").primaryKey(),
  dataJson: text("data_json").notNull().default("null"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * SQLite schema for `fizruk_programs`.
 *
 * Singleton-per-user active-program selection backing
 * `STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM`
 * (`fizruk_active_program_id_v1`). The catalogue itself
 * (`PROGRAM_CATALOGUE` from `@sergeant/fizruk-domain`) is shipped
 * with the bundle and is **not** user state — only the active id
 * needs to round-trip through SQLite.
 *
 * Stage 12 / PR #070f-schema.
 */
export const fizrukPrograms = sqliteTable("fizruk_programs", {
  userId: text("user_id").primaryKey(),
  activeProgramId: text("active_program_id"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * SQLite schema for `fizruk_wellbeing`.
 *
 * Per-(user, date) wellbeing entries backing
 * `STORAGE_KEYS.FIZRUK_WELLBEING` (`fizruk_wellbeing_v1`). The hook
 * `apps/mobile/src/modules/fizruk/hooks/useWellbeing.ts` upserts a
 * single entry per local-day `YYYY-MM-DD`, which makes the natural
 * primary key `(user_id, date_key)` rather than a synthetic id.
 *
 * Stage 12 / PR #070f-schema. Same composite-PK shape as
 * `nutrition_water_log` (PR #070n-schema).
 */
export const fizrukWellbeing = sqliteTable(
  "fizruk_wellbeing",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    mood: integer(),
    energy: integer(),
    sleepQuality: integer("sleep_quality"),
    sleepHours: real("sleep_hours"),
    notes: text().notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.dateKey] }),
    index("fizruk_wellbeing_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for `fizruk_workout_templates`.
 *
 * Per-row workout-template entries backing
 * `STORAGE_KEYS.FIZRUK_TEMPLATES` (`fizruk_workout_templates_v1`).
 * Used by both `apps/web` and `apps/mobile`
 * `useWorkoutTemplates.ts`. Catalogue-style stable rows with their
 * own ids — same per-row shape as `fizruk_workouts` so the
 * dual-write adapter can reuse the row-by-row diff machinery.
 *
 * Stage 12 / PR #070f-schema.
 */
export const fizrukWorkoutTemplates = sqliteTable(
  "fizruk_workout_templates",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    exerciseIdsJson: text("exercise_ids_json").notNull().default("[]"),
    groupsJson: text("groups_json").notNull().default("[]"),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("fizruk_workout_templates_user_idx_lite")
      .on(table.userId, sql`${table.updatedAt} DESC`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
