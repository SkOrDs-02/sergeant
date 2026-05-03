import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  fizrukWorkouts,
  fizrukWorkoutItems,
  fizrukWorkoutSets,
  fizrukCustomExercises,
  fizrukMeasurements,
} from "../pg/fizruk.js";

/**
 * Snapshot tests for the Postgres Drizzle schemas under `pg/fizruk.ts`,
 * locking down the column ordering, types, nullability, indexes, and
 * defaults that mirror migration 029_fizruk_tables.sql.
 *
 * Stage 4 / PR #027 of `docs/planning/storage-roadmap.md`.
 */

describe("pg/fizrukWorkouts schema snapshot", () => {
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

  it("declares column types matching migration 029", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.hasDefault).toBe(true);

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    expect(columnMap["started_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["started_at"]!.notNull).toBe(true);

    expect(columnMap["ended_at"]!.notNull).toBe(false);

    expect(columnMap["groups_json"]!.columnType).toBe("PgJsonb");
    expect(columnMap["groups_json"]!.notNull).toBe(true);

    expect(columnMap["warmup_json"]!.notNull).toBe(false);
    expect(columnMap["cooldown_json"]!.notNull).toBe(false);
    expect(columnMap["wellbeing_json"]!.notNull).toBe(false);
  });

  it("declares both indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("fizruk_workouts_user_started_idx");
    expect(indexNames).toContain("fizruk_workouts_user_active_idx");
  });
});

describe("pg/fizrukWorkoutItems schema snapshot", () => {
  const config = getTableConfig(fizrukWorkoutItems);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_workout_items");
  });

  it("declares all expected columns", () => {
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

  it("declares column types matching migration 029", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["workout_id"]!.columnType).toBe("PgUUID");
    expect(columnMap["sort_order"]!.dataType).toBe("number");
    expect(columnMap["muscles_primary"]!.columnType).toBe("PgJsonb");
  });
});

describe("pg/fizrukWorkoutSets schema snapshot", () => {
  const config = getTableConfig(fizrukWorkoutSets);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_workout_sets");
  });

  it("declares all expected columns", () => {
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

  it("declares column types matching migration 029", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["weight_kg"]!.columnType).toBe("PgReal");
    expect(columnMap["reps"]!.dataType).toBe("number");
    expect(columnMap["rpe"]!.notNull).toBe(false);
  });
});

describe("pg/fizrukCustomExercises schema snapshot", () => {
  const config = getTableConfig(fizrukCustomExercises);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_custom_exercises");
  });

  it("declares all expected columns", () => {
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

  it("declares column types matching migration 029", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["data_json"]!.columnType).toBe("PgJsonb");
    expect(columnMap["data_json"]!.notNull).toBe(true);
  });
});

describe("pg/fizrukMeasurements schema snapshot", () => {
  const config = getTableConfig(fizrukMeasurements);

  it("has the canonical table name", () => {
    expect(config.name).toBe("fizruk_measurements");
  });

  it("declares all expected columns", () => {
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

  it("declares column types matching migration 029", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["measured_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["measured_at"]!.notNull).toBe(true);

    expect(columnMap["weight_kg"]!.columnType).toBe("PgReal");
    expect(columnMap["weight_kg"]!.notNull).toBe(false);

    expect(columnMap["energy_level"]!.dataType).toBe("number");
    expect(columnMap["energy_level"]!.notNull).toBe(false);
  });
});
