import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for the `nutrition_meals` table.
 *
 * Mirrors the Postgres version from `apps/server/src/migrations/031_nutrition_tables.sql`
 * and `packages/db-schema/src/pg/nutrition.ts`. Hosts the Nutrition meal log
 * on SQLite for both surfaces — web (sqlite-wasm via OPFS-SAH) and mobile
 * (`expo-sqlite`).
 *
 * Stage 4 / PR #031 of `docs/planning/storage-roadmap.md`.
 *
 * Differences from Postgres:
 * - `id` is TEXT (UUID stored as a string — SQLite has no native UUID).
 *   Generation is the client's responsibility (`crypto.randomUUID()`).
 * - All TIMESTAMPTZ columns are TEXT (ISO-8601 with offset).
 * - JSONB → TEXT (JSON stored as string in SQLite).
 * - BOOLEAN → INTEGER (`0` / `1`) — SQLite has no native boolean.
 * - No FK to `"user"(id)` — the client SQLite database has no auth tables.
 * - Index names are `_lite`-suffixed to spot drift between server and client.
 */
export const nutritionMeals = sqliteTable(
  "nutrition_meals",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    eatenAt: text("eaten_at").notNull(),
    mealType: text("meal_type").notNull().default("snack"),
    name: text().notNull().default(""),
    label: text().notNull().default(""),
    kcal: integer(),
    proteinG: real("protein_g"),
    fatG: real("fat_g"),
    carbsG: real("carbs_g"),
    source: text().notNull().default("manual"),
    macroSource: text("macro_source").notNull().default("manual"),
    amountG: real("amount_g"),
    foodId: text("food_id"),
    isDemo: integer("is_demo").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("nutrition_meals_user_eaten_idx_lite").on(
      table.userId,
      sql`${table.eatenAt} DESC`,
    ),
    index("nutrition_meals_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `nutrition_pantries` table.
 *
 * Per-user pantry definitions. Active-pantry selection is hoisted onto
 * `nutrition_prefs.active_pantry_id` so multi-device LWW on pantry
 * switching doesn't have to merge the JSONB prefs blob.
 */
export const nutritionPantries = sqliteTable(
  "nutrition_pantries",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull().default(""),
    text: text().notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("nutrition_pantries_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `nutrition_pantry_items` table.
 *
 * Items within a pantry. Mirrors the existing PantryItem shape
 * (`name + qty + unit + notes`). `qty` is REAL because the parser
 * accepts decimal quantities.
 */
export const nutritionPantryItems = sqliteTable(
  "nutrition_pantry_items",
  {
    id: text().primaryKey(),
    pantryId: text("pantry_id").notNull(),
    userId: text("user_id").notNull(),
    name: text().notNull().default(""),
    qty: real(),
    unit: text(),
    notes: text(),
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
    index("nutrition_pantry_items_pantry_idx_lite").on(
      table.pantryId,
      table.sortOrder,
    ),
    index("nutrition_pantry_items_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `nutrition_prefs` table.
 *
 * Per-user singleton row. JSONB → TEXT; the open-ended `NutritionPrefs`
 * shape is stored as JSON-encoded text. `user_id` is the primary key
 * (no separate `id`) — there is exactly one row per user.
 */
export const nutritionPrefs = sqliteTable("nutrition_prefs", {
  userId: text("user_id").primaryKey(),
  prefsJson: text("prefs_json").notNull().default("{}"),
  activePantryId: text("active_pantry_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * SQLite schema for the `nutrition_recipes` table.
 *
 * Saved recipes. Full `SavedRecipe` document stored as JSON text in
 * `data_json` — the whole document is read together when the user opens
 * a recipe and there are no per-field aggregates worth column-splitting.
 */
export const nutritionRecipes = sqliteTable(
  "nutrition_recipes",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull().default(""),
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
    index("nutrition_recipes_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
