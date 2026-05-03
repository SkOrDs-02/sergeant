import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Postgres schema for `fizruk_workouts` table.
 * Mirrors migration 029_fizruk_tables.sql.
 *
 * Stage 4 / PR #027 of `docs/planning/storage-roadmap.md` — normalized
 * per-session workout rows. Nested display-only data (groups, warmup,
 * cooldown, wellbeing) stored as JSONB.
 */
export const fizrukWorkouts = pgTable(
  "fizruk_workouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text().notNull().default(""),
    groupsJson: jsonb("groups_json").notNull().default([]),
    warmupJson: jsonb("warmup_json"),
    cooldownJson: jsonb("cooldown_json"),
    wellbeingJson: jsonb("wellbeing_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_workouts_user_started_idx").on(
      table.userId,
      sql`${table.startedAt} DESC`,
    ),
    index("fizruk_workouts_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `fizruk_workout_items` table.
 * Mirrors migration 029_fizruk_tables.sql.
 *
 * Per-exercise entries within a workout. Denormalized exercise metadata
 * preserved so deleted exercises don't break historical display.
 */
export const fizrukWorkoutItems = pgTable(
  "fizruk_workout_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    workoutId: uuid("workout_id").notNull(),
    userId: text("user_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    nameUk: text("name_uk").notNull(),
    primaryGroup: text("primary_group").notNull().default(""),
    musclesPrimary: jsonb("muscles_primary").notNull().default([]),
    musclesSecondary: jsonb("muscles_secondary").notNull().default([]),
    type: text().notNull().default("strength"),
    durationSec: integer("duration_sec"),
    distanceM: integer("distance_m"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_workout_items_workout_idx").on(
      table.workoutId,
      table.sortOrder,
    ),
    index("fizruk_workout_items_user_idx").on(table.userId),
  ],
);

/**
 * Postgres schema for `fizruk_workout_sets` table.
 * Mirrors migration 029_fizruk_tables.sql.
 *
 * Per-set entries within a workout item. Core trackable: weight x reps.
 */
export const fizrukWorkoutSets = pgTable(
  "fizruk_workout_sets",
  {
    id: uuid().primaryKey().defaultRandom(),
    workoutItemId: uuid("workout_item_id").notNull(),
    userId: text("user_id").notNull(),
    weightKg: real("weight_kg").notNull().default(0),
    reps: integer().notNull().default(0),
    rpe: real(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_workout_sets_item_idx").on(
      table.workoutItemId,
      table.sortOrder,
    ),
  ],
);

/**
 * Postgres schema for `fizruk_custom_exercises` table.
 * Mirrors migration 029_fizruk_tables.sql.
 *
 * User-defined exercises. Full definition stored as JSONB.
 */
export const fizrukCustomExercises = pgTable(
  "fizruk_custom_exercises",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_custom_exercises_user_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `fizruk_measurements` table.
 * Mirrors migration 029_fizruk_tables.sql.
 *
 * Body measurements and wellbeing scores. One row per measurement session.
 */
export const fizrukMeasurements = pgTable(
  "fizruk_measurements",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    weightKg: real("weight_kg"),
    waistCm: real("waist_cm"),
    chestCm: real("chest_cm"),
    hipsCm: real("hips_cm"),
    bicepCm: real("bicep_cm"),
    sleepHours: real("sleep_hours"),
    energyLevel: integer("energy_level"),
    mood: integer(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_measurements_user_date_idx").on(
      table.userId,
      sql`${table.measuredAt} DESC`,
    ),
  ],
);
