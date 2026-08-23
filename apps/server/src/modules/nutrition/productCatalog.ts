/**
 * Читання і запис `product_catalog` — Tier-1 у каскаді штрихкодів.
 *
 * Каталог стоїть ПЕРЕД зовнішніми джерелами: спершу дивимось у себе, і
 * лише на miss ідемо назовні. Це не оптимізація латентності (хоча вона
 * теж є — 0.03 мс проти 4 с таймауту), а перетворення квот upstream-ів
 * із «ліміт на кожен скан» на «ліміт на кожен НОВИЙ товар». USDA на
 * `DEMO_KEY` дає 40 запитів/год НА ВЕСЬ ПРОДУКТ, UPCitemdb trial —
 * 100/добу; без постійного сховища сканер вимикається на десятку
 * користувачів.
 *
 * Схема і обґрунтування колонок — `apps/server/src/migrations/123_product_catalog.sql`.
 */
import type { BarcodeProduct } from "@sergeant/shared/schemas";
import { buildProductSearchKey } from "@sergeant/shared";
import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";

/**
 * Пріоритет джерел при читанні.
 *
 * Дзеркалить порядок зовнішнього каскаду (OFF → USDA → UPCitemdb), щоб
 * відповідь із каталогу збігалася з тим, що віддав би живий каскад для
 * того самого штрихкоду. Один штрихкод може мати рядок від кожного
 * джерела (PK — `(barcode, source)`), бо джерела реально не згодні між
 * собою; обирати між ними — робота саме цього місця, а не запису.
 */
const SOURCE_PRIORITY: readonly BarcodeProduct["source"][] = [
  "off",
  "usda",
  "upcitemdb",
];

/**
 * Порядок їде в запит ПАРАМЕТРОМ (`array_position($4, source)`), а не
 * склеєним `CASE`. Так порядок лишається заданим рівно в одному місці —
 * масиві вище — і при цьому в SQL не потрапляє жодного інтерпольованого
 * рядка. Джерело поза списком дає `NULL` → `COALESCE` кидає його в
 * кінець, тобто нове джерело в БД не зникне з видачі, а просто стане
 * найнижчим за пріоритетом, поки його свідомо не поставлять у список.
 */
const UNKNOWN_SOURCE_RANK = 99;

/**
 * Наскільки далеко заявлена калорійність може розійтися з макросами,
 * перш ніж рядок вважається непридатним до видачі.
 *
 * `max(30 ккал, 25%)` — те саме число, що в шапці міграції. Абсолютний
 * поріг потрібен для низькокалорійних продуктів, де 25% — це одиниці
 * ккал і будь-яке округлення джерела виглядало б розбіжністю.
 */
const ATWATER_ABS_TOLERANCE_KCAL = 30;
const ATWATER_REL_TOLERANCE = 0.25;

interface CatalogRow {
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  serving_size: string | null;
  serving_grams: number | null;
  source: string;
}

/**
 * Знайти товар у каталозі.
 *
 * Повертає `null` і на «нема рядка», і на «є, але рядок не пройшов
 * ворота якості» — обидва випадки для викликача однакові: треба йти в
 * зовнішній каскад.
 *
 * AI-CONTEXT: рядки, де калорійність не сходиться з макросами, СВІДОМО
 * не віддаються. Вони лишаються в таблиці (аудит, майбутнє оновлення),
 * але видати їх означало б покласти завідомо хибне число в денний план
 * людини. Реальні приклади з посіву: «Пепсі Кола 0,33» з 606 ккал/100 мл,
 * «Happy flakes» з 0 ккал при 447 за макросами. Наслідок — такий товар
 * щоразу йде в upstream; це свідома ціна (2.4% рядків із макросами) за
 * те, щоб каталог не був джерелом брехні.
 */
export async function lookupInCatalog(
  barcode: string,
): Promise<BarcodeProduct | null> {
  const { rows } = await query<CatalogRow>(
    `SELECT name, brand, kcal_100g, protein_100g, fat_100g, carbs_100g,
            serving_size, serving_grams, source
       FROM product_catalog
      WHERE barcode = $1
        AND (
          atwater_delta_kcal IS NULL
          OR abs(atwater_delta_kcal) <= GREATEST(
               $2::double precision,
               $3::double precision * abs(kcal_100g - atwater_delta_kcal)
             )
        )
      ORDER BY COALESCE(array_position($4::text[], source), $5), source
      LIMIT 1`,
    [
      barcode,
      ATWATER_ABS_TOLERANCE_KCAL,
      ATWATER_REL_TOLERANCE,
      [...SOURCE_PRIORITY],
      UNKNOWN_SOURCE_RANK,
    ],
    { op: "product_catalog.lookup" },
  );

  const row = rows[0];
  if (!row) return null;

  return {
    name: row.name,
    brand: row.brand,
    kcal_100g: row.kcal_100g,
    protein_100g: row.protein_100g,
    fat_100g: row.fat_100g,
    carbs_100g: row.carbs_100g,
    servingSize: row.serving_size,
    servingGrams: row.serving_grams,
    // Джерело віддаємо ОРИГІНАЛЬНЕ, не «catalog»: клієнтський контракт
    // (`BarcodeProductSchema.source`) описує походження ДАНИХ, а не шлях
    // їх доставки. Те, що відповідь прийшла з нашого сховища, — факт
    // інфраструктури; він живе в метриці `barcode_lookups_total`, а не
    // у відповіді API. Інакше довелося б розширювати enum і рухати
    // контрактну трійцю (Hard Rule #3) заради нічого.
    source: row.source as BarcodeProduct["source"],
  };
}

/** Значення поза фізичними межами БД відкидаємо ПОЛЕМ, не рядком. */
function inRange(v: number | null, max: number): number | null {
  if (v == null || !Number.isFinite(v) || v < 0 || v > max) return null;
  return v;
}

/**
 * Записати в каталог те, що щойно віддав upstream (write-through).
 *
 * Best-effort: помилка запису НЕ псує відповідь користувачу. Він уже має
 * свій продукт; те, що ми не змогли його запам'ятати, — наша проблема,
 * не його. Тому все загорнуто в try/catch і лише логується.
 *
 * `ON CONFLICT` оновлює рядок і зсуває `fetched_at` — за ним потім
 * шукатиметься застаріле (рецептури змінюються, а джерела про це не
 * повідомляють).
 */
export async function upsertIntoCatalog(
  barcode: string,
  product: BarcodeProduct,
): Promise<void> {
  // Внутрішньомагазинні вагові коди (префікс 2) у глобальний довідник не
  // потрапляють: їх генерує касовий термінал конкретної мережі, і той
  // самий код означає різні товари в різних магазинах. CHECK у БД їх не
  // ловить (це валідний GTIN за формою), тож відсіюємо тут.
  if (!/^[0-9]{8,14}$/.test(barcode) || barcode.startsWith("2")) return;

  const name = product.name.trim();
  if (!name) return;

  const nameNorm = buildProductSearchKey(name, product.brand);
  if (!nameNorm) return;

  try {
    await query(
      `INSERT INTO product_catalog
         (barcode, source, name, name_norm, brand,
          kcal_100g, protein_100g, fat_100g, carbs_100g,
          serving_size, serving_grams, source_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (barcode, source) DO UPDATE
         SET name = EXCLUDED.name,
             name_norm = EXCLUDED.name_norm,
             brand = EXCLUDED.brand,
             kcal_100g = EXCLUDED.kcal_100g,
             protein_100g = EXCLUDED.protein_100g,
             fat_100g = EXCLUDED.fat_100g,
             carbs_100g = EXCLUDED.carbs_100g,
             serving_size = EXCLUDED.serving_size,
             serving_grams = EXCLUDED.serving_grams,
             source_ref = EXCLUDED.source_ref,
             fetched_at = NOW(),
             updated_at = NOW()`,
      [
        barcode,
        product.source,
        name.slice(0, 400),
        nameNorm.slice(0, 400),
        product.brand?.trim().slice(0, 200) || null,
        inRange(product.kcal_100g, 1000),
        inRange(product.protein_100g, 100),
        inRange(product.fat_100g, 100),
        inRange(product.carbs_100g, 100),
        product.servingSize?.trim().slice(0, 200) || null,
        inRange(product.servingGrams, 10000),
        `barcode-lookup:${product.source}`,
      ],
      { op: "product_catalog.upsert" },
    );
  } catch (e) {
    // Свідомо не піднімаємо: користувач уже отримав продукт від upstream.
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), barcode },
      "product_catalog write-through failed",
    );
  }
}
