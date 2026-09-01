import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text().notNull().default(""),
    groupsJson: jsonb("groups_json").notNull().default([]),
    warmupJson: jsonb("warmup_json"),
    cooldownJson: jsonb("cooldown_json"),
    wellbeingJson: jsonb("wellbeing_json"),
    /**
     * Оцінка витрачених калорій (міграція 132). Nullable навмисно: без ваги
     * в профілі оцінювати нічим, і нуль тут означав би «спалено нічого».
     */
    kcalBurned: integer("kcal_burned"),
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    workoutId: text("workout_id").notNull(),
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    workoutItemId: text("workout_item_id").notNull(),
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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
 * Postgres schema for `fizruk_custom_activities` table.
 * Mirrors migration 132_fizruk_kcal_and_custom_activities.sql.
 *
 * Свої заняття для короткого запису - дзеркало `fizruk_custom_exercises`:
 * увесь вміст у `data_json`, бо форма запису належить домену
 * (`ActivityDef` у `@sergeant/fizruk-domain`), а не схемі.
 */
export const fizrukCustomActivities = pgTable(
  "fizruk_custom_activities",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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
    index("fizruk_custom_activities_user_idx")
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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

/**
 * Postgres schema for `fizruk_daily_log`.
 *
 * Mirrors `apps/server/src/migrations/052_fizruk_full_state.sql` and
 * the SQLite client schema in `packages/db-schema/src/sqlite/fizruk.ts`.
 *
 * Stage 12 / PR #070f-schema of `docs/planning/storage-roadmap.md`.
 * Per-row diary entries (weight, sleep, energy, mood, note); the
 * SQLite mirror omits the FK to `"user"(id)` because the client has
 * no auth schema.
 */
export const fizrukDailyLog = pgTable(
  "fizruk_daily_log",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    entryAt: timestamp("entry_at", { withTimezone: true }).notNull(),
    weightKg: real("weight_kg"),
    sleepHours: real("sleep_hours"),
    energyLevel: integer("energy_level"),
    mood: integer(),
    note: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_daily_log_user_entry_idx").on(
      table.userId,
      sql`${table.entryAt} DESC`,
    ),
    index("fizruk_daily_log_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `fizruk_monthly_plan`.
 *
 * Singleton-per-user JSONB blob backing
 * `STORAGE_KEYS.FIZRUK_MONTHLY_PLAN`. Stage 12 / PR #070f-schema.
 */
export const fizrukMonthlyPlan = pgTable("fizruk_monthly_plan", {
  userId: text("user_id").primaryKey(),
  data: jsonb().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `fizruk_plan_templates`.
 *
 * Singleton-per-user "Plan template" slot backing
 * `STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE`. Stage 12 / PR #070f-schema.
 *
 * The slot can be empty (`null` JSON literal) so the column is
 * nullable rather than carrying a `'null'` string default — JSONB
 * supports a real null value, unlike the SQLite TEXT mirror.
 */
export const fizrukPlanTemplates = pgTable("fizruk_plan_templates", {
  userId: text("user_id").primaryKey(),
  data: jsonb(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `fizruk_programs`.
 *
 * Singleton-per-user active-program selection. The catalogue itself
 * is shipped with the bundle (`PROGRAM_CATALOGUE`) and is **not**
 * user state — only the active id needs to round-trip.
 *
 * Stage 12 / PR #070f-schema.
 */
export const fizrukPrograms = pgTable("fizruk_programs", {
  userId: text("user_id").primaryKey(),
  activeProgramId: text("active_program_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `fizruk_wellbeing`.
 *
 * Per-(user, date) wellbeing entries. Composite PK keyed on
 * `(user_id, date_key)` — one row per local-day. Stage 12 / PR
 * #070f-schema.
 */
export const fizrukWellbeing = pgTable(
  "fizruk_wellbeing",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    mood: integer(),
    energy: integer(),
    sleepQuality: integer("sleep_quality"),
    sleepHours: real("sleep_hours"),
    notes: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.dateKey] }),
    index("fizruk_wellbeing_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `fizruk_workout_templates`.
 *
 * Per-row workout templates backing `STORAGE_KEYS.FIZRUK_TEMPLATES`.
 * Stage 12 / PR #070f-schema.
 */
export const fizrukWorkoutTemplates = pgTable(
  "fizruk_workout_templates",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    exerciseIds: jsonb("exercise_ids").notNull().default([]),
    groups: jsonb().notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_workout_templates_user_idx")
      .on(table.userId, sql`${table.updatedAt} DESC`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `fizruk_injuries`.
 *
 * Mirrors migration `097_fizruk_injuries.sql`. Backs the "не можна" model —
 * a user-placed mark on an injured body zone that removes matching exercises
 * from recovery advice until the mark is cleared (ADR-0083, канон fizruk §5).
 *
 * `site` spans a keyspace WIDER than the 18 atlas muscle groups: it also
 * carries joints and spinal segments (`knee`, `elbow`, `shoulder`, …), because
 * a muscle-only model cannot name the injuries lifters actually get and would
 * report "враховано" while still recommending the movement (audit E-4).
 * Canonical list: `packages/fizruk-domain/src/data/injurySites.ts`.
 */
export const fizrukInjuries = pgTable(
  "fizruk_injuries",
  {
    // TEXT, not uuid — the client mints `inj_<uuid>`. A uuid column would
    // fail every push with 22P02, the exact bug migrations 094/095 fixed.
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    site: text().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    // NULL = the mark is still active. Clearing is a manual user action only.
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    note: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("fizruk_injuries_user_active_idx")
      .on(table.userId, table.site)
      .where(sql`${table.deletedAt} IS NULL AND ${table.clearedAt} IS NULL`),
    index("fizruk_injuries_user_started_at_idx")
      .on(table.userId, sql`${table.startedAt} DESC`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `fizruk_pushups`.
 *
 * Перенос власності pushup-даних routine → fizruk (канон `routine.md` §10,
 * рішення founder-а 2026-08-30: «фізактивність належить fizruk»). Форма
 * 1:1 успадкована від `routine_pushups` (`pg/routine.ts`): один рядок на
 * (user, day) з лічильником повторів; day key — device-local `YYYY-MM-DD`
 * (ADR-0078). Дані копіюються серверною міграцією `131_fizruk_pushups.sql`
 * зі збереженням `updated_at`, тож LWW-конфлікти девайсів вирішуються так
 * само, як і до переносу.
 */
export const fizrukPushups = pgTable(
  "fizruk_pushups",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    reps: integer().notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dateKey] })],
);
