import {
  check,
  index,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Postgres schema for the `product_catalog` table.
 * Mirrors migration `123_product_catalog.sql`.
 *
 * AI-CONTEXT: це ГЛОБАЛЬНИЙ довідник «штрихкод → продукт з КБЖВ», а не
 * дані користувача — тут навмисно немає `user_id`. Наслідки, які легко
 * зламати необережним рефактором:
 *
 *   * Рядки походженням `off` мусять лишатись відокремлюваними одним
 *     `WHERE source = 'off'` — цього вимагає share-alike ODbL 1.0
 *     (патерн Yuka з `docs/90-work/planning/barcode-database-research.md`).
 *     Не «зливай» джерела в один рядок на штрихкод.
 *   * PK композитний `(barcode, source)`: один штрихкод має по рядку на
 *     кожне джерело, бо джерела реально не згодні між собою. Пріоритет
 *     обирає шар читання, не запис.
 *   * Сурогатного `id` немає навмисно — він втягнув би Hard Rule #1
 *     (bigint → number у серіалізаторі) ні за що.
 *
 * Повне обґрунтування кожного рішення — у шапці SQL-міграції.
 */
export const productCatalog = pgTable(
  "product_catalog",
  {
    barcode: text().notNull(),
    source: text().notNull(),

    name: text().notNull(),

    /**
     * AI-DANGER: пошуковий ключ рахує ЗАСТОСУНОК, не БД. Нормалізація
     * мусить збігатися з `normText`
     * (apps/web/src/modules/nutrition/lib/foodDb/foodDb.ts): trim →
     * toLowerCase → апострофи → стиснення пробілів; у ключ входить
     * назва РАЗОМ із брендом.
     *
     * Не замінюй це на `lower(name)` в SQL: `lower()` згортає регістр
     * за колацією бази, і в локалі C кирилиця лишається незгорнутою
     * (`lower('Яготинське')` → `'Яготинське'`), тобто пошук мовчки не
     * знаходив би більшість українського каталогу. З тієї ж причини
     * запит має шукати вже нормалізованим рядком — без `ILIKE`.
     */
    nameNorm: text("name_norm").notNull(),

    brand: text(),
    quantity: text(),

    kcal100g: real("kcal_100g"),
    protein100g: real("protein_100g"),
    fat100g: real("fat_100g"),
    carbs100g: real("carbs_100g"),

    fiber100g: real("fiber_100g"),
    sugars100g: real("sugars_100g"),
    saturatedFat100g: real("saturated_fat_100g"),
    salt100g: real("salt_100g"),

    /**
     * Спирт, г/100 г. Існує заради воріт якості нижче, а не заради
     * показу: етанол дає ~7 ккал/г і не є ні білком, ні жиром, ні
     * вуглеводом, тож без нього формула Атвотера оголошує битим КОЖЕН
     * алкогольний напій.
     */
    alcohol100g: real("alcohol_100g"),

    servingSize: text("serving_size"),
    servingGrams: real("serving_grams"),

    ingredients: text(),
    country: text(),
    producer: text(),
    imageUrl: text("image_url"),

    sourceRef: text("source_ref"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * AI-DANGER: обчислювана колонка — БД пише її сама, застосунок
     * НІКОЛИ не передає значення в INSERT/UPDATE (Postgres відхилить).
     * Це ворота якості проти битих нутрієнтів у джерелах: різниця між
     * заявленою калорійністю і сумою за Атвотером (4/9/4). Реальний
     * випадок, заради якого вона існує — картка Listex, де в полі
     * «ккал» лежали кілоджоулі (1102 замість 260).
     *
     * Зберігається РІЗНИЦЯ, не булеве «підозрілий»: поріг — політика
     * коду (орієнтир `|delta| > max(30, 0.25 * atwater)`), різниця —
     * факт. Вираз мусить точно збігатися з SQL-міграцією, інакше
     * `node scripts/check-schema-drift.mjs` червоніє.
     *
     * NULL-и не потребують явного `CASE`: арифметика з NULL у SQL уже
     * дає NULL, тож бракує бодай одного макроса — і delta сама стає
     * NULL.
     */
    atwaterDeltaKcal: real("atwater_delta_kcal").generatedAlwaysAs(
      sql`kcal_100g::double precision
    - (4 * protein_100g::double precision
       + 9 * fat_100g::double precision
       + 4 * carbs_100g::double precision
       + 7 * COALESCE(alcohol_100g, 0)::double precision)`,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "product_catalog_pkey",
      columns: [table.barcode, table.source],
    }),
    index("product_catalog_name_trgm_idx").using(
      "gin",
      sql`${table.nameNorm} gin_trgm_ops`,
    ),
    index("product_catalog_atwater_suspect_idx")
      .on(table.source, table.barcode)
      .where(
        sql`${table.atwaterDeltaKcal} IS NOT NULL AND abs(${table.atwaterDeltaKcal}) > 30`,
      ),
    index("product_catalog_source_fetched_idx").on(
      table.source,
      table.fetchedAt,
    ),
    check(
      "product_catalog_source_check",
      sql`${table.source} IN ('off', 'usda', 'upcitemdb')`,
    ),
    check(
      "product_catalog_barcode_check",
      sql`${table.barcode} ~ '^[0-9]{8,14}$'`,
    ),
    check("product_catalog_name_check", sql`length(btrim(${table.name})) > 0`),
    check(
      "product_catalog_name_norm_check",
      sql`length(btrim(${table.nameNorm})) > 0`,
    ),
  ],
);
