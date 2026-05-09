import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  fizrukWorkouts,
  fizrukWorkoutItems,
  fizrukWorkoutSets,
  fizrukCustomExercises,
  fizrukMeasurements,
  fizrukDailyLog,
  fizrukMonthlyPlan,
  fizrukPlanTemplates,
  fizrukPrograms,
  fizrukWellbeing,
  fizrukWorkoutTemplates,
} from "../sqlite/fizruk.js";
import {
  FIZRUK_CLIENT_MIGRATIONS,
  FIZRUK_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";

/**
 * Snapshot tests for the SQLite Drizzle schemas under `sqlite/fizruk.ts`,
 * mirroring the structural lock-down that `pg-fizruk-snapshot.test.ts`
 * applies to the Postgres source-of-truth.
 *
 * Stage 4 / PR #027 of `docs/planning/storage-roadmap.md`. Same rationale
 * as the routine snapshot tests — PG↔SQLite schemas must stay aligned so
 * push/pull round-trips are symmetric.
 */

describe("sqlite/fizrukWorkouts schema snapshot", () => {
  const config = getTableConfig(fizrukWorkouts);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_workouts");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "started_at",
      "ended_at",
      "note",
      "groups_json",
      "warmup_json",
      "cooldown_json",
      "wellbeing_json",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching `001_fizruk_tables.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.notNull).toBe(true);

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    expect(columnMap["started_at"]!.dataType).toBe("string");
    expect(columnMap["started_at"]!.notNull).toBe(true);

    expect(columnMap["ended_at"]!.dataType).toBe("string");
    expect(columnMap["ended_at"]!.notNull).toBe(false);

    expect(columnMap["note"]!.dataType).toBe("string");
    expect(columnMap["note"]!.notNull).toBe(true);
    expect(columnMap["note"]!.hasDefault).toBe(true);

    expect(columnMap["groups_json"]!.dataType).toBe("string");
    expect(columnMap["groups_json"]!.notNull).toBe(true);
    expect(columnMap["groups_json"]!.hasDefault).toBe(true);

    expect(columnMap["warmup_json"]!.notNull).toBe(false);
    expect(columnMap["cooldown_json"]!.notNull).toBe(false);
    expect(columnMap["wellbeing_json"]!.notNull).toBe(false);

    expect(columnMap["created_at"]!.notNull).toBe(true);
    expect(columnMap["created_at"]!.hasDefault).toBe(true);

    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);

    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both `_lite`-suffixed indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_workouts_user_started_idx_lite");
    expect(indexNames).toContain("fizruk_workouts_user_active_idx_lite");
  });

  it("partial active index has WHERE clause on deleted_at", () => {
    const activeIdx = config.indexes.find(
      (i) => i.config.name === "fizruk_workouts_user_active_idx_lite",
    );
    expect(activeIdx).toBeDefined();
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/fizrukWorkoutItems schema snapshot", () => {
  const config = getTableConfig(fizrukWorkoutItems);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_workout_items");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "workout_id",
      "user_id",
      "exercise_id",
      "name_uk",
      "primary_group",
      "muscles_primary",
      "muscles_secondary",
      "type",
      "duration_sec",
      "distance_m",
      "sort_order",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["workout_id"]!.dataType).toBe("string");
    expect(columnMap["workout_id"]!.notNull).toBe(true);

    expect(columnMap["exercise_id"]!.dataType).toBe("string");
    expect(columnMap["exercise_id"]!.notNull).toBe(true);

    expect(columnMap["name_uk"]!.dataType).toBe("string");
    expect(columnMap["name_uk"]!.notNull).toBe(true);

    expect(columnMap["type"]!.dataType).toBe("string");
    expect(columnMap["type"]!.notNull).toBe(true);
    expect(columnMap["type"]!.hasDefault).toBe(true);

    expect(columnMap["sort_order"]!.dataType).toBe("number");
    expect(columnMap["sort_order"]!.notNull).toBe(true);
    expect(columnMap["sort_order"]!.hasDefault).toBe(true);

    expect(columnMap["duration_sec"]!.notNull).toBe(false);
    expect(columnMap["distance_m"]!.notNull).toBe(false);
  });

  it("declares both indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_workout_items_workout_idx_lite");
    expect(indexNames).toContain("fizruk_workout_items_user_idx_lite");
  });
});

describe("sqlite/fizrukWorkoutSets schema snapshot", () => {
  const config = getTableConfig(fizrukWorkoutSets);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_workout_sets");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "workout_item_id",
      "user_id",
      "weight_kg",
      "reps",
      "rpe",
      "sort_order",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["workout_item_id"]!.dataType).toBe("string");
    expect(columnMap["workout_item_id"]!.notNull).toBe(true);

    expect(columnMap["weight_kg"]!.dataType).toBe("number");
    expect(columnMap["weight_kg"]!.notNull).toBe(true);
    expect(columnMap["weight_kg"]!.hasDefault).toBe(true);

    expect(columnMap["reps"]!.dataType).toBe("number");
    expect(columnMap["reps"]!.notNull).toBe(true);
    expect(columnMap["reps"]!.hasDefault).toBe(true);

    expect(columnMap["rpe"]!.notNull).toBe(false);
  });

  it("declares the item index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_workout_sets_item_idx_lite");
  });
});

describe("sqlite/fizrukCustomExercises schema snapshot", () => {
  const config = getTableConfig(fizrukCustomExercises);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_custom_exercises");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "data_json",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["data_json"]!.dataType).toBe("string");
    expect(columnMap["data_json"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.hasDefault).toBe(true);
  });

  it("declares the partial user index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_custom_exercises_user_idx_lite");

    const userIdx = config.indexes.find(
      (i) => i.config.name === "fizruk_custom_exercises_user_idx_lite",
    );
    expect(userIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/fizrukMeasurements schema snapshot", () => {
  const config = getTableConfig(fizrukMeasurements);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_measurements");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "measured_at",
      "weight_kg",
      "waist_cm",
      "chest_cm",
      "hips_cm",
      "bicep_cm",
      "sleep_hours",
      "energy_level",
      "mood",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["measured_at"]!.dataType).toBe("string");
    expect(columnMap["measured_at"]!.notNull).toBe(true);

    expect(columnMap["weight_kg"]!.notNull).toBe(false);
    expect(columnMap["waist_cm"]!.notNull).toBe(false);
    expect(columnMap["mood"]!.notNull).toBe(false);
  });

  it("declares the user date index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_measurements_user_date_idx_lite");
  });
});

describe("sqlite/fizrukDailyLog schema snapshot", () => {
  const config = getTableConfig(fizrukDailyLog);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_daily_log");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "entry_at",
      "weight_kg",
      "sleep_hours",
      "energy_level",
      "mood",
      "note",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching `002_fizruk_full_state.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    expect(columnMap["entry_at"]!.dataType).toBe("string");
    expect(columnMap["entry_at"]!.notNull).toBe(true);

    expect(columnMap["weight_kg"]!.dataType).toBe("number");
    expect(columnMap["weight_kg"]!.notNull).toBe(false);

    expect(columnMap["sleep_hours"]!.dataType).toBe("number");
    expect(columnMap["sleep_hours"]!.notNull).toBe(false);

    expect(columnMap["mood"]!.dataType).toBe("number");
    expect(columnMap["mood"]!.notNull).toBe(false);

    expect(columnMap["note"]!.dataType).toBe("string");
    expect(columnMap["note"]!.notNull).toBe(true);
    expect(columnMap["note"]!.hasDefault).toBe(true);
  });

  it("declares both `_lite`-suffixed indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_daily_log_user_entry_idx_lite");
    expect(indexNames).toContain("fizruk_daily_log_user_active_idx_lite");
  });
});

describe("sqlite/fizrukMonthlyPlan schema snapshot", () => {
  const config = getTableConfig(fizrukMonthlyPlan);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_monthly_plan");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "data_json",
      "updated_at",
    ]);
  });

  it("declares user_id as primary key and data_json with empty default", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["data_json"]!.dataType).toBe("string");
    expect(columnMap["data_json"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.hasDefault).toBe(true);
  });
});

describe("sqlite/fizrukPlanTemplates schema snapshot", () => {
  const config = getTableConfig(fizrukPlanTemplates);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_plan_templates");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "data_json",
      "updated_at",
    ]);
  });

  it("declares user_id as primary key and data_json with `null` default", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["data_json"]!.dataType).toBe("string");
    expect(columnMap["data_json"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.hasDefault).toBe(true);
  });
});

describe("sqlite/fizrukPrograms schema snapshot", () => {
  const config = getTableConfig(fizrukPrograms);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_programs");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "active_program_id",
      "updated_at",
    ]);
  });

  it("declares user_id as primary key and active_program_id nullable", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["active_program_id"]!.dataType).toBe("string");
    expect(columnMap["active_program_id"]!.notNull).toBe(false);
  });
});

describe("sqlite/fizrukWellbeing schema snapshot", () => {
  const config = getTableConfig(fizrukWellbeing);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_wellbeing");
  });

  it("declares all expected columns in migration order", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "date_key",
      "mood",
      "energy",
      "sleep_quality",
      "sleep_hours",
      "notes",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching `002_fizruk_full_state.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    expect(columnMap["date_key"]!.dataType).toBe("string");
    expect(columnMap["date_key"]!.notNull).toBe(true);

    expect(columnMap["mood"]!.dataType).toBe("number");
    expect(columnMap["mood"]!.notNull).toBe(false);

    expect(columnMap["sleep_hours"]!.dataType).toBe("number");
    expect(columnMap["sleep_hours"]!.notNull).toBe(false);

    expect(columnMap["notes"]!.dataType).toBe("string");
    expect(columnMap["notes"]!.notNull).toBe(true);
    expect(columnMap["notes"]!.hasDefault).toBe(true);

    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares the composite (user_id, date_key) primary key", () => {
    const pkColumns = config.primaryKeys
      .flatMap((pk) => pk.columns.map((c) => c.name))
      .sort();
    expect(pkColumns).toEqual(["date_key", "user_id"]);
  });

  it("declares the partial active index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_wellbeing_user_active_idx_lite");

    const activeIdx = config.indexes.find(
      (i) => i.config.name === "fizruk_wellbeing_user_active_idx_lite",
    );
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/fizrukWorkoutTemplates schema snapshot", () => {
  const config = getTableConfig(fizrukWorkoutTemplates);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_workout_templates");
  });

  it("declares all expected columns in migration order", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "id",
      "user_id",
      "name",
      "exercise_ids_json",
      "groups_json",
      "last_used_at",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching `002_fizruk_full_state.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["name"]!.dataType).toBe("string");
    expect(columnMap["name"]!.notNull).toBe(true);

    expect(columnMap["exercise_ids_json"]!.dataType).toBe("string");
    expect(columnMap["exercise_ids_json"]!.notNull).toBe(true);
    expect(columnMap["exercise_ids_json"]!.hasDefault).toBe(true);

    expect(columnMap["groups_json"]!.dataType).toBe("string");
    expect(columnMap["groups_json"]!.notNull).toBe(true);
    expect(columnMap["groups_json"]!.hasDefault).toBe(true);

    expect(columnMap["last_used_at"]!.dataType).toBe("string");
    expect(columnMap["last_used_at"]!.notNull).toBe(false);

    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares the partial user index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_workout_templates_user_idx_lite");

    const userIdx = config.indexes.find(
      (i) => i.config.name === "fizruk_workout_templates_user_idx_lite",
    );
    expect(userIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/fizruk migrations exports", () => {
  it("exports the 001 baseline + 002 full-state migration", () => {
    expect(FIZRUK_CLIENT_MIGRATIONS).toHaveLength(2);
    expect(FIZRUK_CLIENT_MIGRATIONS[0]!.name).toBe("001_fizruk_tables.sql");
    expect(FIZRUK_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_workouts/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_workout_items/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_workout_sets/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_custom_exercises/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_measurements/,
    );

    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.name).toBe("002_fizruk_full_state.sql");
    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_daily_log/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_monthly_plan/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_plan_templates/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_programs/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_wellbeing/,
    );
    expect(FIZRUK_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS fizruk_workout_templates/,
    );
  });

  it("uses a separate `__fizruk_migrations` ledger table", () => {
    expect(FIZRUK_MIGRATIONS_TABLE).toBe("__fizruk_migrations");
  });
});
