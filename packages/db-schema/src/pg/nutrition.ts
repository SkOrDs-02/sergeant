import {
  boolean,
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
 * Postgres schema for `nutrition_meals` table.
 * Mirrors migration 035_nutrition_tables.sql.
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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
 * Mirrors migration 035_nutrition_tables.sql.
 *
 * Per-user pantry definitions. Active-pantry selection is hoisted onto
 * `nutrition_prefs.active_pantry_id` so multi-device LWW on pantry
 * switching doesn't have to merge the JSONB prefs blob.
 */
export const nutritionPantries = pgTable(
  "nutrition_pantries",
  {
    // `.notNull()` тут ОБОВʼЯЗКОВИЙ і не дублює PK. Drizzle виводить
    // not-null-ність із `.primaryKey()` НА КОЛОНЦІ; композитний
    // `primaryKey({ columns })` нижче типів не звужує, тож без цього
    // `$inferSelect["id"]` стає `string | null` — хоча в базі колонка під
    // композитним PK усе одно NOT NULL. Тобто типи почали б брехати
    // споживачам. Знайдено ревʼю-ботом на PR #915.
    id: text()
      .notNull()
      .default(sql`gen_random_uuid()::text`),
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
    // AI-DANGER: PK композитний — `id` унікальний У МЕЖАХ КОРИСТУВАЧА, не
    // глобально (міграція 129). Клієнт віддає кожному юзеру комору з id
    // `home` (`makeDefaultPantry()`), тож глобальний PK означав, що першу
    // синхронізовану комору «займає» перший користувач, а решта назавжди
    // отримує `fk_violation` і синхронізується лише локально.
    // НЕ повертай `.primaryKey()` на `id`.
    primaryKey({ columns: [table.userId, table.id] }),
    index("nutrition_pantries_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `nutrition_pantry_items` table.
 * Mirrors migration 035_nutrition_tables.sql.
 *
 * Items within a pantry. Mirrors the existing PantryItem shape
 * (`name + qty + unit + notes`). `qty` is REAL because the parser
 * accepts decimal quantities.
 */
export const nutritionPantryItems = pgTable(
  "nutrition_pantry_items",
  {
    // `.notNull()` обовʼязковий — див. пояснення в `nutritionPantries`.
    id: text()
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    pantryId: text("pantry_id").notNull(),
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
    // AI-DANGER: PK композитний із тієї ж причини, що й у `nutritionPantries`
    // (міграція 129), і тут колізія навіть імовірніша: id позиції — це
    // `<pantryId>::<index>::<name>`, тож у двох користувачів із коморою `home`
    // і однаковим продуктом на тій самій позиції id збігаються посимвольно.
    // НЕ повертай `.primaryKey()` на `id`.
    primaryKey({ columns: [table.userId, table.id] }),
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
 * Postgres schema for `nutrition_pantry_events` table.
 * Mirrors migration 086_nutrition_pantry_events.sql.
 *
 * Append-only журнал руху продуктів у коморі (W1-PANTRY-APPEND, стадія 1).
 * НЕ пишеться і НЕ читається на цій стадії — `nutritionPantryItems.qty`
 * лишається єдиним джерелом залишку.
 *
 * AI-CONTEXT: `id` / `pantryId` / `itemId` / `mealId` — TEXT, а НЕ `uuid()`,
 * на відміну від сусідньої `nutritionPantryItems`. Це свідомо: клієнт
 * генерує НЕ-UUID id (`home`, `p_<ms>_<idx>`, `<pantryId>::<idx>::<name>`),
 * тож `uuid` тут дав би `22P02` на реальному push-і — той самий баг, що
 * задокументований у `docs/90-work/tech-debt/backend.md` § «Routine: PK-тип».
 * НЕ «вирівнюй» тип під pantryItems.
 *
 * `deletedAt` — ретракція помилкової події (згортка її пропускає), а не
 * редагування історії: `op='update'` apply-шлях відхиляє.
 */
export const nutritionPantryEvents = pgTable(
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
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Client timezone offset (minutes) at event time (migration 109,
     * pre-beta schema-debt audit 2026-08-04) — closes the gap between
     * ADR-0078 §3.2 (claims every Wave-1 journal already carries this)
     * and reality. Nullable: NULL for pre-109 rows / clients not yet
     * sending it. See ADR-0078 (device-local day boundary).
     */
    tzOffsetMin: integer("tz_offset_min"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("nutrition_pantry_events_user_item_idx").on(
      table.userId,
      table.pantryId,
      table.itemKey,
      table.occurredAt,
    ),
    index("nutrition_pantry_events_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `nutrition_prefs` table.
 * Mirrors migration 035_nutrition_tables.sql.
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
  activePantryId: text("active_pantry_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `nutrition_goal_periods` table.
 * Mirrors migration 087_nutrition_goal_periods.sql.
 *
 * Append-only журнал цілей КБЖВ (W1-KBJU-APPEND, стадія 1). Кожен рядок —
 * СХОДИНКА: «з цього Kyiv-локального дня і далі юзер хотів ось такі цілі».
 *
 * AI-CONTEXT: на стадії 1 таблиця ПИШЕТЬСЯ (дуал-райт із web, паралельно до
 * `prefs-upsert`), але НЕ ЧИТАЄТЬСЯ — `nutritionPrefs.prefsJson`
 * -> `dailyTarget*` лишається єдиним джерелом цілі для кожного екрана на
 * web і mobile. Cutover ретроспективних консюмерів — стадія 3.
 *
 * `id` — TEXT, а НЕ `uuid()`, і це НЕ неузгодженість із сусідніми таблицями:
 * писар — клієнт, і його id ДЕТЕРМІНОВАНИЙ
 * (`gp::<effective_from>::<values>::<deviceId>`), щоб повторна доставка
 * push-а лягла в `ON CONFLICT DO NOTHING`, а не другим періодом з тими
 * самими числами. `crypto.randomUUID()` дав би дубль на кожному ретраї.
 *
 * `effectiveFrom` — TEXT 'YYYY-MM-DD', device-local day key (ADR-0078:
 * personal day boundary is device-local, not Kyiv — corrected 2026-08-04,
 * migration 109; 087's original comment said "Kyiv-local", ADR-0078 §3.1
 * says otherwise for personal data), як `nutritionWaterLog.dateKey`, а не
 * `date()`/`timestamp()`.
 *
 * Цілі NULLABLE: `dailyTargetKcal = null` — валідний дефолт, і «цілі немає»
 * не можна плутати з нулем. `deletedAt` — ретракція помилкового періоду
 * (резолвер його пропускає), а не редагування історії: `op='update'`
 * apply-шлях відхиляє.
 */
export const nutritionGoalPeriods = pgTable(
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
     * recorded (migration 109, pre-beta schema-debt audit 2026-08-04).
     * Nullable: NULL for pre-109 rows / clients not yet sending it.
     */
    tzOffsetMin: integer("tz_offset_min"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("nutrition_goal_periods_user_effective_idx").on(
      table.userId,
      table.effectiveFrom,
      table.createdAt,
    ),
    index("nutrition_goal_periods_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `nutrition_recipes` table.
 * Mirrors migration 035_nutrition_tables.sql.
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
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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

// ---------------------------------------------------------------------
// Stage 11 — extend Nutrition schema to full LS coverage
// (water_log, shopping_list).
// Mirrors migration 051_nutrition_full_state.sql.
// ---------------------------------------------------------------------

/**
 * Postgres schema for `nutrition_water_log` table.
 *
 * Один рядок на (user, date) — мілілітри води за день. Дзеркалить
 * `routine_pushups` за формою (per-(user, date) лічильник). Day key —
 * `YYYY-MM-DD` у локальному часовому поясі користувача (як уже працює
 * `WaterLog` blob у `packages/nutrition-domain/src/waterLog.ts`).
 *
 * Soft-delete не потрібен — обнулення дня = `volume_ml = 0` або просто
 * відсутність рядка для цієї дати.
 */
export const nutritionWaterLog = pgTable(
  "nutrition_water_log",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    volumeMl: integer("volume_ml").notNull().default(0),
    // ADR-0073 Крок 0.5а: nullable до Кроку 2 — паритет із SQLite-діалектом
    // (там ADD COLUMN не приймає неконстантний DEFAULT); NOT NULL затягнемо
    // окремою міграцією, коли адаптери гарантовано пишуть колонку.
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dateKey] })],
);

/**
 * Postgres schema for `nutrition_shopping_list` table.
 *
 * Один рядок на користувача — JSON blob категорій + items
 * (`ShoppingList` shape із `packages/nutrition-domain/src/shoppingList.ts`).
 * Цілий документ читається разом коли користувач відкриває список —
 * per-item normalisation тут не потрібна.
 */
export const nutritionShoppingList = pgTable("nutrition_shopping_list", {
  userId: text("user_id").primaryKey(),
  data: jsonb().notNull().default({ categories: [] }),
  // ADR-0073 Крок 0.5а: nullable до Кроку 2 (див. nutritionWaterLog).
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
