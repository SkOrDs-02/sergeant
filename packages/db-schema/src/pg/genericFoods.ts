import {
  check,
  index,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Postgres schema for `generic_foods`.
 * Mirrors migration `124_generic_foods.sql`.
 *
 * AI-CONTEXT: це курований корпус базової їжі БЕЗ штрихкоду — те, що ним
 * не вирішується в принципі: овочі й фрукти на вагу, сир із прилавка,
 * домашні страви. На реальній полиці це третина позицій (вимір
 * 2026-08-22: 35 зі 104 мали внутрішньомагазинні вагові коди).
 *
 * Чому окремо від `product_catalog`, а не рядки з порожнім штрихкодом:
 * там штрихкод у первинному ключі й під CHECK-ом, життєвий цикл інший
 * (пакетний імпорт із зовнішніх джерел проти ручного курування), і
 * нутрієнти там nullable, а тут NOT NULL — позиція без КБЖВ у
 * курованому корпусі не має сенсу.
 *
 * Дані живуть у `@sergeant/shared` → `GENERIC_FOODS`, звідки їх беруть
 * і серверний посів, і клієнтський офлайн-кеш.
 */
export const genericFoods = pgTable(
  "generic_foods",
  {
    /**
     * AI-DANGER: стабільний ключ, що лягає в `nutrition_meals.food_id`.
     * Перейменування осиротить історію прийомів їжі. Українську назву
     * міняти вільно, slug — ні.
     */
    slug: text().primaryKey(),

    name: text().notNull(),
    /** Рахує застосунок (`buildProductSearchKey`), не `lower()` — див. 123. */
    nameNorm: text("name_norm").notNull(),
    /** Нормалізовані синоніми: «помідор» має знаходити «Томат». */
    aliases: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    category: text().notNull(),

    kcal100g: real("kcal_100g").notNull(),
    protein100g: real("protein_100g").notNull(),
    fat100g: real("fat_100g").notNull(),
    carbs100g: real("carbs_100g").notNull(),

    fiber100g: real("fiber_100g"),
    /** Спирт, г/100 г. Без нього ворота Атвотера бракують кожен напій. */
    alcoholG: real("alcohol_g"),

    defaultGrams: real("default_grams").notNull().default(100),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Обчислювана БД. Тут страхує від друкарської помилки куратора. */
    atwaterDeltaKcal: real("atwater_delta_kcal").generatedAlwaysAs(
      sql`kcal_100g::double precision
    - (4 * protein_100g::double precision
       + 9 * fat_100g::double precision
       + 4 * carbs_100g::double precision
       + 7 * COALESCE(alcohol_g, 0)::double precision)`,
    ),
  },
  (table) => [
    index("generic_foods_name_trgm_idx").using(
      "gin",
      sql`${table.nameNorm} gin_trgm_ops`,
    ),
    index("generic_foods_aliases_idx").using("gin", table.aliases),
    index("generic_foods_category_idx").on(table.category, table.name),
    check(
      "generic_foods_slug_check",
      sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,63}$'`,
    ),
    check("generic_foods_name_check", sql`length(btrim(${table.name})) > 0`),
    check(
      "generic_foods_name_norm_check",
      sql`length(btrim(${table.nameNorm})) > 0`,
    ),
  ],
);
