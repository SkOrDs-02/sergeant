import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  nutritionMeals,
  nutritionPantries,
  nutritionPantryItems,
  nutritionPrefs,
  nutritionRecipes,
} from "../pg/nutrition.js";

/**
 * Snapshot tests for the Postgres Drizzle schemas under `pg/nutrition.ts`,
 * locking down the column ordering, types, nullability, indexes, and
 * defaults that mirror migration 035_nutrition_tables.sql.
 *
 * Stage 4 / PR #031 of `docs/planning/storage-roadmap.md`.
 */

describe("pg/nutritionMeals schema snapshot", () => {
  const config = getTableConfig(nutritionMeals);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_meals");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "eaten_at",
      "meal_type",
      "name",
      "label",
      "kcal",
      "protein_g",
      "fat_g",
      "carbs_g",
      "source",
      "macro_source",
      "amount_g",
      "food_id",
      "is_demo",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching migration 035", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.hasDefault).toBe(true);

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    expect(columnMap["eaten_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["eaten_at"]!.notNull).toBe(true);

    expect(columnMap["meal_type"]!.dataType).toBe("string");
    expect(columnMap["meal_type"]!.notNull).toBe(true);
    expect(columnMap["meal_type"]!.hasDefault).toBe(true);

    expect(columnMap["kcal"]!.dataType).toBe("number");
    expect(columnMap["kcal"]!.notNull).toBe(false);

    expect(columnMap["protein_g"]!.columnType).toBe("PgReal");
    expect(columnMap["protein_g"]!.notNull).toBe(false);
    expect(columnMap["fat_g"]!.columnType).toBe("PgReal");
    expect(columnMap["carbs_g"]!.columnType).toBe("PgReal");

    expect(columnMap["amount_g"]!.columnType).toBe("PgReal");
    expect(columnMap["amount_g"]!.notNull).toBe(false);

    expect(columnMap["food_id"]!.dataType).toBe("string");
    expect(columnMap["food_id"]!.notNull).toBe(false);

    expect(columnMap["is_demo"]!.columnType).toBe("PgBoolean");
    expect(columnMap["is_demo"]!.notNull).toBe(true);
    expect(columnMap["is_demo"]!.hasDefault).toBe(true);

    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_meals_user_eaten_idx");
    expect(indexNames).toContain("nutrition_meals_user_active_idx");
  });
});

describe("pg/nutritionPantries schema snapshot", () => {
  const config = getTableConfig(nutritionPantries);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_pantries");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "text",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching migration 035", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["name"]!.notNull).toBe(true);
    expect(columnMap["text"]!.notNull).toBe(true);
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares the soft-delete partial index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_pantries_user_active_idx");
  });
});

describe("pg/nutritionPantryItems schema snapshot", () => {
  const config = getTableConfig(nutritionPantryItems);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_pantry_items");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "pantry_id",
      "user_id",
      "name",
      "qty",
      "unit",
      "notes",
      "sort_order",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching migration 035", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["pantry_id"]!.columnType).toBe("PgUUID");
    expect(columnMap["pantry_id"]!.notNull).toBe(true);

    expect(columnMap["qty"]!.columnType).toBe("PgReal");
    expect(columnMap["qty"]!.notNull).toBe(false);

    expect(columnMap["sort_order"]!.dataType).toBe("number");
    expect(columnMap["sort_order"]!.notNull).toBe(true);
    expect(columnMap["sort_order"]!.hasDefault).toBe(true);

    expect(columnMap["unit"]!.notNull).toBe(false);
    expect(columnMap["notes"]!.notNull).toBe(false);
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_pantry_items_pantry_idx");
    expect(indexNames).toContain("nutrition_pantry_items_user_active_idx");
  });
});

describe("pg/nutritionPrefs schema snapshot", () => {
  const config = getTableConfig(nutritionPrefs);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_prefs");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "user_id",
      "prefs_json",
      "active_pantry_id",
      "created_at",
      "updated_at",
    ]);
  });

  it("declares column types matching migration 035", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.primary).toBe(true);

    expect(columnMap["prefs_json"]!.columnType).toBe("PgJsonb");
    expect(columnMap["prefs_json"]!.notNull).toBe(true);
    expect(columnMap["prefs_json"]!.hasDefault).toBe(true);

    expect(columnMap["active_pantry_id"]!.columnType).toBe("PgUUID");
    expect(columnMap["active_pantry_id"]!.notNull).toBe(false);
  });

  it("has no extra indexes (PK is enough for per-user singleton)", () => {
    expect(config.indexes).toHaveLength(0);
  });
});

describe("pg/nutritionRecipes schema snapshot", () => {
  const config = getTableConfig(nutritionRecipes);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_recipes");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "data_json",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching migration 035", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgUUID");
    expect(columnMap["data_json"]!.columnType).toBe("PgJsonb");
    expect(columnMap["data_json"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.hasDefault).toBe(true);
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares the soft-delete partial index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_recipes_user_active_idx");
  });
});
