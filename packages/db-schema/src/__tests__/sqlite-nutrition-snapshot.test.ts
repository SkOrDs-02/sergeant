import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  nutritionMeals,
  nutritionPantries,
  nutritionPantryItems,
  nutritionPrefs,
  nutritionRecipes,
  nutritionShoppingList,
  nutritionWaterLog,
} from "../sqlite/nutrition.js";
import {
  NUTRITION_CLIENT_MIGRATIONS,
  NUTRITION_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";

/**
 * Snapshot tests for the SQLite Drizzle schemas under `sqlite/nutrition.ts`,
 * mirroring the structural lock-down that `pg-nutrition-snapshot.test.ts`
 * applies to the Postgres source-of-truth.
 *
 * Stage 4 / PR #031 of `docs/planning/storage-roadmap.md`. Same rationale
 * as the routine and fizruk snapshot tests — PG↔SQLite schemas must stay
 * aligned so push/pull round-trips are symmetric.
 */

describe("sqlite/nutritionMeals schema snapshot", () => {
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

  it("declares column types matching `001_nutrition_tables.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.notNull).toBe(true);

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    expect(columnMap["eaten_at"]!.dataType).toBe("string");
    expect(columnMap["eaten_at"]!.notNull).toBe(true);

    expect(columnMap["meal_type"]!.dataType).toBe("string");
    expect(columnMap["meal_type"]!.notNull).toBe(true);
    expect(columnMap["meal_type"]!.hasDefault).toBe(true);

    expect(columnMap["name"]!.notNull).toBe(true);
    expect(columnMap["name"]!.hasDefault).toBe(true);
    expect(columnMap["label"]!.notNull).toBe(true);
    expect(columnMap["label"]!.hasDefault).toBe(true);

    expect(columnMap["kcal"]!.dataType).toBe("number");
    expect(columnMap["kcal"]!.notNull).toBe(false);

    expect(columnMap["protein_g"]!.dataType).toBe("number");
    expect(columnMap["protein_g"]!.notNull).toBe(false);
    expect(columnMap["fat_g"]!.dataType).toBe("number");
    expect(columnMap["fat_g"]!.notNull).toBe(false);
    expect(columnMap["carbs_g"]!.dataType).toBe("number");
    expect(columnMap["carbs_g"]!.notNull).toBe(false);

    expect(columnMap["source"]!.notNull).toBe(true);
    expect(columnMap["source"]!.hasDefault).toBe(true);
    expect(columnMap["macro_source"]!.notNull).toBe(true);
    expect(columnMap["macro_source"]!.hasDefault).toBe(true);

    expect(columnMap["amount_g"]!.dataType).toBe("number");
    expect(columnMap["amount_g"]!.notNull).toBe(false);

    expect(columnMap["food_id"]!.dataType).toBe("string");
    expect(columnMap["food_id"]!.notNull).toBe(false);

    expect(columnMap["is_demo"]!.dataType).toBe("number");
    expect(columnMap["is_demo"]!.notNull).toBe(true);
    expect(columnMap["is_demo"]!.hasDefault).toBe(true);

    expect(columnMap["created_at"]!.notNull).toBe(true);
    expect(columnMap["created_at"]!.hasDefault).toBe(true);

    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);

    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both `_lite`-suffixed indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_meals_user_eaten_idx_lite");
    expect(indexNames).toContain("nutrition_meals_user_active_idx_lite");
  });

  it("partial active index has WHERE clause on deleted_at", () => {
    const activeIdx = config.indexes.find(
      (i) => i.config.name === "nutrition_meals_user_active_idx_lite",
    );
    expect(activeIdx).toBeDefined();
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/nutritionPantries schema snapshot", () => {
  const config = getTableConfig(nutritionPantries);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_pantries");
  });

  it("declares all expected columns in migration order", () => {
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

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["name"]!.notNull).toBe(true);
    expect(columnMap["name"]!.hasDefault).toBe(true);
    expect(columnMap["text"]!.notNull).toBe(true);
    expect(columnMap["text"]!.hasDefault).toBe(true);
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares the partial active index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_pantries_user_active_idx_lite");

    const activeIdx = config.indexes.find(
      (i) => i.config.name === "nutrition_pantries_user_active_idx_lite",
    );
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/nutritionPantryItems schema snapshot", () => {
  const config = getTableConfig(nutritionPantryItems);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_pantry_items");
  });

  it("declares all expected columns in migration order", () => {
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

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["pantry_id"]!.dataType).toBe("string");
    expect(columnMap["pantry_id"]!.notNull).toBe(true);

    expect(columnMap["qty"]!.dataType).toBe("number");
    expect(columnMap["qty"]!.notNull).toBe(false);

    expect(columnMap["unit"]!.notNull).toBe(false);
    expect(columnMap["notes"]!.notNull).toBe(false);

    expect(columnMap["sort_order"]!.dataType).toBe("number");
    expect(columnMap["sort_order"]!.notNull).toBe(true);
    expect(columnMap["sort_order"]!.hasDefault).toBe(true);
  });

  it("declares both indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_pantry_items_pantry_idx_lite");
    expect(indexNames).toContain("nutrition_pantry_items_user_active_idx_lite");
  });
});

describe("sqlite/nutritionPrefs schema snapshot", () => {
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

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.primary).toBe(true);

    expect(columnMap["prefs_json"]!.dataType).toBe("string");
    expect(columnMap["prefs_json"]!.notNull).toBe(true);
    expect(columnMap["prefs_json"]!.hasDefault).toBe(true);

    expect(columnMap["active_pantry_id"]!.dataType).toBe("string");
    expect(columnMap["active_pantry_id"]!.notNull).toBe(false);
  });

  it("has no extra indexes (PK is enough for per-user singleton)", () => {
    expect(config.indexes).toHaveLength(0);
  });
});

describe("sqlite/nutritionRecipes schema snapshot", () => {
  const config = getTableConfig(nutritionRecipes);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_recipes");
  });

  it("declares all expected columns in migration order", () => {
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

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.primary).toBe(true);

    expect(columnMap["data_json"]!.dataType).toBe("string");
    expect(columnMap["data_json"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.hasDefault).toBe(true);

    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares the partial active index", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("nutrition_recipes_user_active_idx_lite");

    const activeIdx = config.indexes.find(
      (i) => i.config.name === "nutrition_recipes_user_active_idx_lite",
    );
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/nutritionWaterLog schema snapshot", () => {
  const config = getTableConfig(nutritionWaterLog);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_water_log");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "user_id",
      "date_key",
      "volume_ml",
      "updated_at",
    ]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["date_key"]!.dataType).toBe("string");
    expect(columnMap["date_key"]!.notNull).toBe(true);
    expect(columnMap["volume_ml"]!.dataType).toBe("number");
    expect(columnMap["volume_ml"]!.notNull).toBe(true);
    expect(columnMap["volume_ml"]!.hasDefault).toBe(true);
    expect(columnMap["updated_at"]!.dataType).toBe("string");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });

  it("is keyed on (user_id, date_key)", () => {
    expect(config.primaryKeys).toHaveLength(1);
    const pk = config.primaryKeys[0]!;
    expect(pk.columns.map((c) => c.name)).toEqual(["user_id", "date_key"]);
  });
});

describe("sqlite/nutritionShoppingList schema snapshot", () => {
  const config = getTableConfig(nutritionShoppingList);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_shopping_list");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual(["user_id", "data_json", "updated_at"]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.dataType).toBe("string");
    expect(columnMap["data_json"]!.notNull).toBe(true);
    expect(columnMap["data_json"]!.hasDefault).toBe(true);
    expect(columnMap["updated_at"]!.dataType).toBe("string");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });
});

describe("sqlite/nutrition migrations exports", () => {
  it("ships the 001_nutrition_tables.sql baseline", () => {
    expect(NUTRITION_CLIENT_MIGRATIONS[0]!.name).toBe(
      "001_nutrition_tables.sql",
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_meals/,
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_pantries/,
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_pantry_items/,
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_prefs/,
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_recipes/,
    );
  });

  it("ships the Stage 11 002_nutrition_full_state.sql delta", () => {
    // Append-only — `001_*` first, then `002_*` for the Stage 11 delta.
    expect(NUTRITION_CLIENT_MIGRATIONS).toHaveLength(2);
    expect(NUTRITION_CLIENT_MIGRATIONS[1]!.name).toBe(
      "002_nutrition_full_state.sql",
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_water_log/,
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS nutrition_shopping_list/,
    );
    expect(NUTRITION_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /PRIMARY KEY \(user_id, date_key\)/,
    );
  });

  it("uses a separate `__nutrition_migrations` ledger table", () => {
    expect(NUTRITION_MIGRATIONS_TABLE).toBe("__nutrition_migrations");
  });
});
