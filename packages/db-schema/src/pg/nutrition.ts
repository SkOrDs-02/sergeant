import {
  boolean,
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
 * Postgres schema for `nutrition_meals` table.
 * Mirrors migration 031_nutrition_tables.sql.
 *
 * Stage 4 / PR #031 of `docs/planning/storage-roadmap.md` — normalized
 * per-meal rows. Macros are split into columns so cheap aggregates
 * (`SUM(kcal) GROUP BY DATE(eaten_at)`) don't have to JSON-decode.
 * Denormalized `foodId` (TEXT, not FK) preserved so historical meals
 * stay readable if the food entry is later removed.
 */
export const nutritionMeals = pgTable(
  "nutrition_meals",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull(),
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
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("nutrition_meals_user_eaten_idx").on(
      table.userId,
      sql`${table.eatenAt} DESC`,
    ),
    index("nutrition_meals_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `nutrition_pantries` table.
 * Mirrors migration 031_nutrition_tables.sql.
 *
 * Per-user pantry definitions. Active-pantry selection is hoisted onto
 * `nutrition_prefs.active_pantry_id` so multi-device LWW on pantry
 * switching doesn't have to merge the JSONB prefs blob.
 */
export const nutritionPantries = pgTable(
  "nutrition_pantries",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text().notNull().default(""),
    text: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("nutrition_pantries_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `nutrition_pantry_items` table.
 * Mirrors migration 031_nutrition_tables.sql.
 *
 * Items within a pantry. Mirrors the existing PantryItem shape
 * (`name + qty + unit + notes`). `qty` is REAL because the parser
 * accepts decimal quantities.
 */
export const nutritionPantryItems = pgTable(
  "nutrition_pantry_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    pantryId: uuid("pantry_id").notNull(),
    userId: text("user_id").notNull(),
    name: text().notNull().default(""),
    qty: real(),
    unit: text(),
    notes: text(),
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
    index("nutrition_pantry_items_pantry_idx").on(
      table.pantryId,
      table.sortOrder,
    ),
    index("nutrition_pantry_items_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `nutrition_prefs` table.
 * Mirrors migration 031_nutrition_tables.sql.
 *
 * Per-user singleton row of dietary preferences (kcal/macros targets,
 * meal templates, water goal, reminder settings). The full open-ended
 * `NutritionPrefs` shape is stored as JSONB. `user_id` is the primary
 * key (no separate `id`) — there is exactly one row per user, so the
 * natural key works without a surrogate.
 */
export const nutritionPrefs = pgTable("nutrition_prefs", {
  userId: text("user_id").primaryKey(),
  prefsJson: jsonb("prefs_json").notNull().default({}),
  activePantryId: uuid("active_pantry_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `nutrition_recipes` table.
 * Mirrors migration 031_nutrition_tables.sql.
 *
 * Saved recipes. Web currently stores recipes in IndexedDB
 * (`hub_nutrition_recipe_book`); mobile stores them in MMKV under
 * `NUTRITION_SAVED_RECIPES`. PR #032 (dual-write) will start mirroring
 * writes from both surfaces; PR #033 (cut-over) reads from this table.
 *
 * The full `SavedRecipe` shape is stored as JSONB (`data_json`) — the
 * whole document is read together when the user opens a recipe and
 * there are no per-field aggregates worth column-splitting.
 */
export const nutritionRecipes = pgTable(
  "nutrition_recipes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text().notNull().default(""),
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
    index("nutrition_recipes_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
