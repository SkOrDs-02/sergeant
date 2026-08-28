import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  nutritionMeals,
  nutritionPantries,
  nutritionGoalPeriods,
  nutritionPantryEvents,
  nutritionPantryItems,
  nutritionPrefs,
  nutritionRecipes,
  nutritionShoppingList,
  nutritionWaterLog,
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

  it("declares column types matching migrations 035 + 095", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.columnType).toBe("PgText");
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

  it("declares column types matching migrations 035 + 095", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgText");
    // `id` більше НЕ самостійний PK — див. наступний кейс.
    expect(columnMap["id"]!.primary).toBe(false);

    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["name"]!.notNull).toBe(true);
    expect(columnMap["text"]!.notNull).toBe(true);
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  // Регресія SERGEANT-WEB-T (міграція 128). Клієнт віддає КОЖНОМУ юзеру
  // комору з id `home` (`makeDefaultPantry()`), тож глобальний PK на `id`
  // означав, що першу синхронізовану комору «займає» перший користувач, а
  // решта назавжди отримує `fk_violation` і лишається без синку — мовчки.
  it("keys the pantry per user, not globally", () => {
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "id",
    ]);
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

  it("declares column types matching migrations 035 + 095", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgText");
    expect(columnMap["pantry_id"]!.columnType).toBe("PgText");
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

  // Та сама регресія, що й у комори (міграція 128), але тут колізія навіть
  // імовірніша: id позиції — `<pantryId>::<index>::<name>`, тож у двох
  // користувачів із коморою `home` і однаковим продуктом на тій самій позиції
  // id збігаються посимвольно.
  it("keys the item per user, not globally", () => {
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "id",
    ]);
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

  it("declares column types matching migrations 035 + 095", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.primary).toBe(true);

    expect(columnMap["prefs_json"]!.columnType).toBe("PgJsonb");
    expect(columnMap["prefs_json"]!.notNull).toBe(true);
    expect(columnMap["prefs_json"]!.hasDefault).toBe(true);

    expect(columnMap["active_pantry_id"]!.columnType).toBe("PgText");
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

  it("declares column types matching migrations 035 + 095", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["id"]!.columnType).toBe("PgText");
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

describe("pg/nutritionWaterLog schema snapshot", () => {
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
      "created_at",
      "updated_at",
    ]);
  });

  it("declares column types matching migration 051", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["user_id"]!.columnType).toBe("PgText");
    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["date_key"]!.columnType).toBe("PgText");
    expect(columnMap["date_key"]!.notNull).toBe(true);
    expect(columnMap["volume_ml"]!.columnType).toBe("PgInteger");
    expect(columnMap["volume_ml"]!.notNull).toBe(true);
    expect(columnMap["volume_ml"]!.hasDefault).toBe(true);
    // ADR-0073 Крок 0.5а: nullable без default до Кроку 2 — паритет із
    // SQLite-діалектом (міграція 079).
    expect(columnMap["created_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["created_at"]!.notNull).toBe(false);
    expect(columnMap["created_at"]!.hasDefault).toBe(false);
    expect(columnMap["updated_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });

  it("is keyed on (user_id, date_key)", () => {
    expect(config.primaryKeys).toHaveLength(1);
    const pk = config.primaryKeys[0]!;
    expect(pk.columns.map((c) => c.name)).toEqual(["user_id", "date_key"]);
  });
});

describe("pg/nutritionShoppingList schema snapshot", () => {
  const config = getTableConfig(nutritionShoppingList);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_shopping_list");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "user_id",
      "data",
      "created_at",
      "updated_at",
    ]);
  });

  it("declares column types matching migration 051", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["user_id"]!.columnType).toBe("PgText");
    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["data"]!.columnType).toBe("PgJsonb");
    expect(columnMap["data"]!.notNull).toBe(true);
    expect(columnMap["data"]!.hasDefault).toBe(true);
    // ADR-0073 Крок 0.5а: nullable без default до Кроку 2 (див. water_log).
    expect(columnMap["created_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["created_at"]!.notNull).toBe(false);
    expect(columnMap["created_at"]!.hasDefault).toBe(false);
    expect(columnMap["updated_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });
});

/**
 * `nutrition_pantry_events` — append-only журнал руху продуктів комори
 * (міграція 086, W1-PANTRY-APPEND стадія 1).
 */
describe("pg/nutritionPantryEvents schema snapshot", () => {
  const config = getTableConfig(nutritionPantryEvents);

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_pantry_events");
  });

  it("declares all expected columns in migration order", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "id",
      "user_id",
      "pantry_id",
      "item_id",
      "item_key",
      "kind",
      "delta_qty",
      "abs_qty",
      "unit",
      "source",
      "meal_id",
      "occurred_at",
      "tz_offset_min",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("carries tz_offset_min nullable (migration 109, ADR-0078 device-local day boundary)", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["tz_offset_min"]!.columnType).toBe("PgInteger");
    expect(columnMap["tz_offset_min"]!.notNull).toBe(false);
  });

  it("keeps id/pantry_id/item_id as PgText, NOT PgUUID", () => {
    // AI-DANGER: не «вирівнюй» ці типи під nutrition_pantry_items.id (UUID).
    // Клієнт генерує НЕ-UUID id (`home`, `p_<ms>_<idx>`,
    // `<pantryId>::<idx>::<name>`), тож UUID тут дав би 22P02 на кожному
    // реальному push-і — той самий баг, що в
    // docs/90-work/tech-debt/backend.md § «Routine: PK-тип».
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    for (const name of ["id", "pantry_id", "item_id", "item_key", "meal_id"]) {
      expect(columnMap[name]!.columnType).toBe("PgText");
    }
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.hasDefault).toBe(false);
    expect(columnMap["user_id"]!.notNull).toBe(true);
    expect(columnMap["pantry_id"]!.notNull).toBe(true);
    expect(columnMap["item_key"]!.notNull).toBe(true);
    // `item_id` навмисно nullable: подія переживає зникнення рядка позиції.
    expect(columnMap["item_id"]!.notNull).toBe(false);
  });

  it("declares delta/abs as nullable reals and timestamps as timestamptz", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["delta_qty"]!.columnType).toBe("PgReal");
    expect(columnMap["delta_qty"]!.notNull).toBe(false);
    expect(columnMap["abs_qty"]!.columnType).toBe("PgReal");
    expect(columnMap["abs_qty"]!.notNull).toBe(false);
    expect(columnMap["kind"]!.notNull).toBe(true);
    expect(columnMap["source"]!.notNull).toBe(true);
    expect(columnMap["source"]!.hasDefault).toBe(true);
    expect(columnMap["occurred_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["occurred_at"]!.notNull).toBe(true);
    // Ретракція події, а не перезапис історії.
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both indexes from migration 086", () => {
    expect(config.indexes.map((i) => i.config.name).sort()).toEqual([
      "nutrition_pantry_events_user_active_idx",
      "nutrition_pantry_events_user_item_idx",
    ]);
  });
});

/**
 * `nutrition_goal_periods` — append-only журнал цілей КБЖВ
 * (міграція 087, W1-KBJU-APPEND стадія 1).
 */
describe("pg/nutritionGoalPeriods schema snapshot", () => {
  const config = getTableConfig(nutritionGoalPeriods);
  const columnMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it("has the canonical table name", () => {
    expect(config.name).toBe("nutrition_goal_periods");
  });

  it("declares all expected columns in migration order", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "id",
      "user_id",
      "effective_from",
      "kcal",
      "protein_g",
      "fat_g",
      "carbs_g",
      "water_ml",
      "origin",
      "tz_offset_min",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("carries tz_offset_min nullable (migration 109, ADR-0078 device-local day boundary)", () => {
    expect(columnMap["tz_offset_min"]!.columnType).toBe("PgInteger");
    expect(columnMap["tz_offset_min"]!.notNull).toBe(false);
  });

  it("keeps id as PgText without a default — client mints it deterministically", () => {
    // AI-DANGER: не «вирівнюй» під `nutrition_pantries.id` (UUID). Писар —
    // клієнт, і його id детермінований, щоб повторна доставка push-а була
    // no-op, а не другим періодом з тими самими числами.
    expect(columnMap["id"]!.columnType).toBe("PgText");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.hasDefault).toBe(false);
    expect(columnMap["user_id"]!.notNull).toBe(true);
  });

  it("keeps effective_from as PgText day key, NOT a date/timestamp", () => {
    // Device-local 'YYYY-MM-DD' (ADR-0078), як `nutrition_water_log.date_key`.
    // Corrected 2026-08-04 (migration 109) from an earlier "Kyiv-local" claim.
    expect(columnMap["effective_from"]!.columnType).toBe("PgText");
    expect(columnMap["effective_from"]!.notNull).toBe(true);
  });

  it("keeps every goal value NULLABLE — «цілі немає» це не нуль", () => {
    for (const name of ["kcal", "protein_g", "fat_g", "carbs_g", "water_ml"]) {
      expect(columnMap[name]!.notNull).toBe(false);
      expect(columnMap[name]!.hasDefault).toBe(false);
    }
    // INTEGER/REAL, а не BIGINT/NUMERIC: драйвер `pg` віддає їх як `number`
    // без ручної коерсії (Hard Rule #1).
    expect(columnMap["kcal"]!.columnType).toBe("PgInteger");
    expect(columnMap["water_ml"]!.columnType).toBe("PgInteger");
    expect(columnMap["protein_g"]!.columnType).toBe("PgReal");
  });

  it("declares origin NOT NULL with a default and deleted_at nullable", () => {
    expect(columnMap["origin"]!.notNull).toBe(true);
    expect(columnMap["origin"]!.hasDefault).toBe(true);
    // Ретракція періоду, а не перезапис історії.
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both indexes from migration 087", () => {
    expect(config.indexes.map((i) => i.config.name).sort()).toEqual([
      "nutrition_goal_periods_user_active_idx",
      "nutrition_goal_periods_user_effective_idx",
    ]);
  });
});
