import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for the `nutrition_meals` table.
 *
 * Mirrors the Postgres version from `apps/server/src/migrations/035_nutrition_tables.sql`
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
    /** Дзеркало PG-колонки з міграції 130 — див. `pg/nutrition.ts`. */
    sources: text(),
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
 * SQLite schema for the `nutrition_pantry_events` table.
 *
 * Дзеркало `086_nutrition_pantry_events.sql` / `pg/nutrition.ts`. Клієнтський
 * DDL живе у `NUTRITION_004_PANTRY_EVENTS_SQL`
 * (`sqlite/migrations/index.ts`).
 *
 * Append-only журнал руху продуктів у коморі (W1-PANTRY-APPEND, стадія 1).
 * На цій стадії у нього ніхто не пише і з нього ніхто не читає.
 *
 * Відмінності від Postgres — лише звичні для цього пакета: TIMESTAMPTZ → TEXT
 * (ISO-8601). Типи id тут ЗБІГАЮТЬСЯ з PG (обидва TEXT) — на відміну від
 * `nutritionPantryItems`, де PG-сторона помилково `uuid`, а клієнт шле
 * `<pantryId>::<idx>::<name>`. Див. AI-CONTEXT у `pg/nutrition.ts`.
 *
 * CHECK-констрейнти (`kind IN (…)`, `qty_shape`) живуть лише у сирому DDL:
 * drizzle-таблиця описує форму рядка, а не валідацію — валідація дублюється
 * у `derivePantryQty` і в серверному apply-шляху.
 */
export const nutritionPantryEvents = sqliteTable(
  "nutrition_pantry_events",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    pantryId: text("pantry_id").notNull(),
    itemId: text("item_id"),
    itemKey: text("item_key").notNull(),
    kind: text().notNull(),
    deltaQty: real("delta_qty"),
    absQty: real("abs_qty"),
    unit: text(),
    source: text().notNull().default("manual"),
    mealId: text("meal_id"),
    occurredAt: text("occurred_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    /**
     * Client timezone offset (minutes) at event time — client migration
     * `006_nutrition_events_tz_offset.sql`, mirrors PG migration 109
     * (pre-beta schema-debt audit 2026-08-04). Nullable: NULL for
     * pre-006 rows / clients not yet sending it.
     */
    tzOffsetMin: integer("tz_offset_min"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("nutrition_pantry_events_user_item_idx_lite").on(
      table.userId,
      table.pantryId,
      table.itemKey,
      table.occurredAt,
    ),
    index("nutrition_pantry_events_user_active_idx_lite")
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
 * SQLite schema for the `nutrition_goal_periods` table.
 *
 * Дзеркало `087_nutrition_goal_periods.sql` / `pg/nutrition.ts`. Клієнтський
 * DDL живе у `NUTRITION_005_GOAL_PERIODS_SQL` (`sqlite/migrations/index.ts`).
 *
 * Append-only журнал цілей КБЖВ (W1-KBJU-APPEND, стадія 1). На цій стадії у
 * нього ПИШУТЬ (дуал-райт паралельно до `prefs-upsert`), але з нього ніхто
 * НЕ ЧИТАЄ: цілі на екранах і далі беруться з `nutritionPrefs.prefsJson`.
 *
 * Відмінності від Postgres — лише звичні для цього пакета: TIMESTAMPTZ → TEXT
 * (ISO-8601). Тип `id` тут ЗБІГАЄТЬСЯ з PG (обидва TEXT) — клієнтський id
 * детермінований і не є UUID, див. AI-CONTEXT у `pg/nutrition.ts`.
 *
 * CHECK-констрейнти (`origin IN (…)`, форма `effective_from`) живуть лише в
 * сирому DDL: drizzle-таблиця описує форму рядка, а не валідацію — валідація
 * дублюється в серверному apply-шляху і в резолвері.
 */
export const nutritionGoalPeriods = sqliteTable(
  "nutrition_goal_periods",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    kcal: integer(),
    proteinG: real("protein_g"),
    fatG: real("fat_g"),
    carbsG: real("carbs_g"),
    waterMl: integer("water_ml"),
    origin: text().notNull().default("manual"),
    /**
     * Client timezone offset (minutes) at the moment the goal step was
     * recorded — client migration `006_nutrition_events_tz_offset.sql`,
     * mirrors PG migration 109 (pre-beta schema-debt audit 2026-08-04).
     */
    tzOffsetMin: integer("tz_offset_min"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("nutrition_goal_periods_user_effective_idx_lite").on(
      table.userId,
      table.effectiveFrom,
      table.createdAt,
    ),
    index("nutrition_goal_periods_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

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

// ---------------------------------------------------------------------
// Stage 11 — extend Nutrition schema to full LS coverage
// (water_log, shopping_list).
// Mirrors migration 002_nutrition_full_state.sql in
// `packages/db-schema/src/sqlite/migrations/index.ts`.
// ---------------------------------------------------------------------

/**
 * SQLite schema for the `nutrition_water_log` table.
 *
 * Один рядок на (user, date) — мілілітри води за день. Дзеркалить
 * `routine_pushups` за формою. Day key — `YYYY-MM-DD` у локальному
 * часовому поясі користувача (як уже працює `WaterLog` blob у
 * `packages/nutrition-domain/src/waterLog.ts`).
 *
 * Soft-delete не потрібен — обнулення дня = `volume_ml = 0` або
 * відсутність рядка.
 */
export const nutritionWaterLog = sqliteTable(
  "nutrition_water_log",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    volumeMl: integer("volume_ml").notNull().default(0),
    // ADR-0073 Крок 0.5а: nullable до Кроку 2 — SQLite ADD COLUMN не
    // приймає неконстантний DEFAULT, адаптери колонку ще не пишуть.
    createdAt: text("created_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dateKey] })],
);

/**
 * SQLite schema for the `nutrition_shopping_list` table.
 *
 * Один рядок на користувача — JSON blob категорій + items
 * (`ShoppingList` shape із `packages/nutrition-domain/src/shoppingList.ts`).
 * JSONB → TEXT (JSON-encoded). Цілий документ читається разом коли
 * користувач відкриває список — per-item normalisation тут не
 * потрібна.
 */
export const nutritionShoppingList = sqliteTable("nutrition_shopping_list", {
  userId: text("user_id").primaryKey(),
  dataJson: text("data_json").notNull().default('{"categories":[]}'),
  // ADR-0073 Крок 0.5а: nullable до Кроку 2 (див. nutritionWaterLog).
  createdAt: text("created_at"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
