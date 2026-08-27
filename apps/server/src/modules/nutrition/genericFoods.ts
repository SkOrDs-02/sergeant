/**
 * Читання і посів `generic_foods` — базова їжа без штрихкоду.
 *
 * Закриває те, що штрихкодом не вирішується в принципі. На реальній
 * полиці третина позицій має внутрішньомагазинні вагові коди (вимір
 * 2026-08-22: 35 зі 104) — огірок, кабачок, сир на вагу. Такий код
 * генерує касовий термінал конкретної мережі, тож у глобальних базах
 * його немає й ніколи не буде. Єдиний шлях — знайти базову їжу НАЗВОЮ.
 *
 * Дані — `GENERIC_FOODS` із `@sergeant/shared/data/genericFoods`: одне
 * джерело правди на сервер і клієнт. Схема — міграція 124.
 */
import type { FoodSearchProduct } from "@sergeant/shared/schemas";
import { buildProductSearchKey, normalizeProductText } from "@sergeant/shared";
// Підпаточний імпорт, не барель: корпус навмисно не реекспортується з
// `@sergeant/shared` — див. AI-DANGER у `packages/shared/src/index.ts`.
import {
  GENERIC_FOODS,
  type GenericFood,
} from "@sergeant/shared/data/genericFoods";
import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";

/** Скільки взяти понад ліміт — запас на дедуп із рештою джерел. */
const SEARCH_OVERFETCH = 5;

/** Рядків на один INSERT при посіві. */
const SEED_BATCH = 200;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

interface GenericFoodRow {
  slug: string;
  name: string;
  category: string;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
  default_grams: number;
}

function toSearchProduct(row: GenericFoodRow): FoodSearchProduct {
  return {
    // `gen_` відрізняє базову їжу від карток каталогу (`cat_`) у видачі,
    // і водночас це стабільний ключ: slug не змінюється.
    id: `gen_${row.slug}`,
    name: row.name,
    // Бренда в базової їжі немає за визначенням — «огірок» нічий.
    brand: null,
    // Контракт (`FoodSearchProductSchema.source`) знає лише off|usda.
    // Розширювати enum заради базової їжі не варто: для споживача це
    // однаково «звідки взялось число», а курований корпус ближчий до
    // довідкових даних USDA, ніж до крауд-записів OFF.
    source: "usda",
    per100: {
      kcal: row.kcal_100g,
      protein_g: row.protein_100g,
      fat_g: row.fat_100g,
      carbs_g: row.carbs_100g,
    },
    defaultGrams: row.default_grams,
  };
}

/**
 * Знайти базову їжу за назвою або синонімом.
 *
 * Три канали, усі через індекси міграції 124:
 *   * підрядок у назві — основний очікуваний матч;
 *   * синонім (`aliases @> ARRAY[запит]`) — «помідор» знаходить «Томат»;
 *   * схожість слова (`<%`) — рятує від друкарської помилки.
 *
 * Порядок видачі: точне входження → синонім → схожість. Коротша назва
 * виграє за рівних умов, бо «Огірок» релевантніший за «Огірок солоний»
 * на запит «огірок».
 */
export async function searchGenericFoods(
  rawQuery: string,
  limit: number,
): Promise<FoodSearchProduct[]> {
  const norm = normalizeProductText(rawQuery);
  if (norm.length < 2) return [];

  const { rows } = await query<GenericFoodRow>(
    `SELECT slug, name, category, kcal_100g, protein_100g, fat_100g,
            carbs_100g, default_grams
       FROM generic_foods
      WHERE name_norm LIKE $2 ESCAPE '\\'
         OR aliases @> ARRAY[$1]::text[]
         OR $1 <% name_norm
      ORDER BY (name_norm LIKE $2 ESCAPE '\\') DESC,
               (aliases @> ARRAY[$1]::text[]) DESC,
               word_similarity($1, name_norm) DESC,
               length(name_norm)
      LIMIT $3`,
    [norm, `%${escapeLike(norm)}%`, limit + SEARCH_OVERFETCH],
    { op: "generic_foods.search" },
  );

  return rows.map(toSearchProduct);
}

interface SeedRow {
  slug: string;
  name: string;
  name_norm: string;
  aliases: string[];
  category: string;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
  alcohol_g: number | null;
  default_grams: number;
}

function seedRow(food: GenericFood): SeedRow {
  return {
    slug: food.slug,
    name: food.name,
    name_norm: buildProductSearchKey(food.name),
    aliases: (food.aliases ?? [])
      .map((a) => normalizeProductText(a))
      .filter(Boolean),
    category: food.category,
    kcal_100g: food.per100.kcal,
    protein_100g: food.per100.protein_g,
    fat_100g: food.per100.fat_g,
    carbs_100g: food.per100.carbs_g,
    alcohol_g: food.alcohol_g ?? null,
    default_grams: food.defaultGrams ?? 100,
  };
}

/**
 * Увесь пакет їде ОДНИМ jsonb-параметром через `jsonb_to_recordset`.
 *
 * Очевидна альтернатива — зібрати `VALUES ($1,$2,…),($12,$13,…)` рядком
 * під потрібну кількість рядків. Значення там теж були б параметрами, але
 * сам запит доводилось би склеювати, і кожен такий рядок у кодовій базі
 * потім хтось перечитує очима на предмет інʼєкції. Тут склеювати нема
 * чого взагалі: запит статичний, параметр рівно один, а розмір пакета
 * ніяк не впливає на текст SQL.
 *
 * Побічна вигода: `aliases` як `text[]` переживає дорогу без окремої
 * серіалізації — jsonb-масив рядків Postgres кастить у `text[]` сам.
 */
const SEED_SQL = `
  INSERT INTO generic_foods (
    slug, name, name_norm, aliases, category,
    kcal_100g, protein_100g, fat_100g, carbs_100g, alcohol_g, default_grams
  )
  SELECT slug, name, name_norm, aliases, category,
         kcal_100g, protein_100g, fat_100g, carbs_100g, alcohol_g, default_grams
    FROM jsonb_to_recordset($1::jsonb) AS x(
      slug          text,
      name          text,
      name_norm     text,
      aliases       text[],
      category      text,
      kcal_100g     real,
      protein_100g  real,
      fat_100g      real,
      carbs_100g    real,
      alcohol_g     real,
      default_grams real
    )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        name_norm = EXCLUDED.name_norm,
        aliases = EXCLUDED.aliases,
        category = EXCLUDED.category,
        kcal_100g = EXCLUDED.kcal_100g,
        protein_100g = EXCLUDED.protein_100g,
        fat_100g = EXCLUDED.fat_100g,
        carbs_100g = EXCLUDED.carbs_100g,
        alcohol_g = EXCLUDED.alcohol_g,
        default_grams = EXCLUDED.default_grams,
        updated_at = NOW()`;

/**
 * Засіяти корпус у БД. Ідемпотентно.
 *
 * Викликається на старті сервера, а не окремим скриптом: це довідкові
 * дані, які мусять бути в КОЖНОМУ середовищі (прод, стейдж, локальна
 * машина розробника, CI з Testcontainers). Скрипт, який треба не забути
 * запустити, рано чи пізно не запустять — і різниця виявиться як
 * «на моїй машині пошук знаходить, а на стейджі ні».
 *
 * `ON CONFLICT DO UPDATE` робить прогін дешевим при незмінних даних і
 * автоматично розкочує правку корпусу наступним деплоєм.
 *
 * Помилку не піднімає: непосіяна базова їжа — це гірший пошук, а не
 * зламаний сервер. Падати на старті через довідник було б непропорційно.
 */
export async function seedGenericFoods(): Promise<number> {
  let written = 0;
  try {
    for (let i = 0; i < GENERIC_FOODS.length; i += SEED_BATCH) {
      const batch = GENERIC_FOODS.slice(i, i + SEED_BATCH).map(seedRow);
      await query(SEED_SQL, [JSON.stringify(batch)], {
        op: "generic_foods.seed",
      });
      written += batch.length;
    }
    logger.info({ count: written }, "generic_foods seeded");
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), written },
      "generic_foods seed failed — базова їжа буде недоступна в пошуку",
    );
  }
  return written;
}
