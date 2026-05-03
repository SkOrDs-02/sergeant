import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
