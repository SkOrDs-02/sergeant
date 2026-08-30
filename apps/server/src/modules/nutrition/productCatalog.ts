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
import type {
  BarcodeProduct,
  FoodSearchProduct,
} from "@sergeant/shared/schemas";
import { buildProductSearchKey, normalizeProductText } from "@sergeant/shared";
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
 *
 * AI-DANGER: другі ворота — рядок БЕЗ ЖОДНОГО макроса теж не віддається,
 * і це не косметика. Ворота Атвотера його пропускають (`delta` при NULL-ах
 * сама NULL), тож без цієї умови картка «назва + бренд, нутрієнтів нема»
 * ставала б Tier-1 відповіддю НАЗАВЖДИ: каскад коротшає на ній, OFF/USDA
 * більше не питаються, а джоби оновлення `fetched_at` тут нема. Людина
 * діставала б картку, яку неможливо залогувати, і жодна її дія цього не
 * виправила б. До цієї зміни кожен скан питав OFF першим, тож продукт,
 * доданий в OFF пізніше, починав віддавати макроси — саме цю властивість
 * умова й зберігає. Джерел таких рядків два: `upcitemdb` (віддає лише
 * назву й бренд) і масовий посів OFF, де повні КБЖВ мали 2 054 рядки з
 * 7 576. Прибереш умову — тихо зламаєш обидва випадки.
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
          kcal_100g IS NOT NULL
          OR protein_100g IS NOT NULL
          OR fat_100g IS NOT NULL
          OR carbs_100g IS NOT NULL
        )
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

// ── Пошук їжі текстом ───────────────────────────────────────────────────────

/**
 * Джерела, придатні для текстового пошуку.
 *
 * `upcitemdb` свідомо відсутній, і це не обмеження контракту, а суть
 * джерела: воно віддає назву й бренд без нутрієнтів (`partial: true`).
 * У видачі пошуку така картка марна — людина обирає їжу, щоб її
 * залогувати, а без КБЖВ логувати нема чого. Заразом це рівно ті два
 * значення, які приймає `FoodSearchProductSchema.source`, тож розширювати
 * контракт не доводиться.
 */
const SEARCHABLE_SOURCES: readonly FoodSearchProduct["source"][] = [
  "off",
  "usda",
];

/** Скільки взяти з каталогу понад запитаний ліміт — запас на дедуп із upstream. */
const CATALOG_SEARCH_OVERFETCH = 5;

/**
 * Екранувати спецсимволи `LIKE` у користувацькому вводі.
 *
 * Без цього запит «100%» перетворював би `%` на вайлдкард і повертав
 * половину каталогу, а `_` матчив би будь-який символ. `ESCAPE '\'` у
 * самому запиті замикає домовленість.
 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

interface CatalogSearchRow {
  barcode: string;
  source: string;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
  serving_grams: number | null;
}

/**
 * Знайти товари в каталозі за текстом.
 *
 * Двоканальний матч, обидва канали йдуть через той самий GIN-trigram
 * індекс на `name_norm`:
 *
 *   * підрядок (`LIKE '%…%'`) — те, чого людина очікує від пошукового
 *     поля: «молоко» має знайти «Молоко 2,6% Яготинське»;
 *   * схожість слова (`<%`) — рятує від друкарських помилок, які підрядок
 *     не пробачає.
 *
 * Точні входження ранжуються вище за схожі — інакше «молоко» віддавало б
 * спершу «молочний коктейль» із високою схожістю, а сам продукт нижче.
 *
 * AI-CONTEXT: саме `<%` (`word_similarity`), а не `%` (`similarity`).
 * `similarity` рахує схожість по ЦІЛОМУ рядку, тож короткий запит тоне у
 * довгій назві товару. Заміряно на живих даних:
 *
 *     similarity('малоко', 'молоко 2.5% ультрапастеризоване бурьонка') = 0.093
 *     word_similarity(те саме)                                        = 0.429
 *
 * `word_similarity` шукає найкращий збіг серед СЛІВ рядка — рівно та
 * семантика, яка потрібна пошуковому полю.
 *
 * Поріг лишається дефолтним (0.6) НАВМИСНО. Знизити його можна лише через
 * `SET pg_trgm.word_similarity_threshold`, а це сесійна змінна: під
 * пулером у transaction-режимі вона протекла б на чужі запити тієї самої
 * фізичної конекції. Практичний наслідок: легкі помилки каталог ловить
 * («яготінське» → «Яготинський», «сметанна» → «Сметана»), а сильно
 * покручений запит дає мало результатів і природно провалюється в
 * upstream — тобто в задуманий запобіжник, а не в порожній екран.
 *
 * Повертає лише рядки з ПОВНИМИ макросами: картка без КБЖВ у видачі
 * пошуку не має сенсу, бо її нема чим залогувати. Той самий Atwater-гейт,
 * що й у `lookupInCatalog` — биту картку не показуємо й тут.
 */
export async function searchCatalog(
  rawQuery: string,
  limit: number,
): Promise<FoodSearchProduct[]> {
  const norm = normalizeProductText(rawQuery);
  if (norm.length < 2) return [];

  const { rows } = await query<CatalogSearchRow>(
    `SELECT barcode, source, name, brand,
            kcal_100g, protein_100g, fat_100g, carbs_100g, serving_grams
       FROM product_catalog
      WHERE source = ANY($2::text[])
        AND kcal_100g IS NOT NULL
        AND protein_100g IS NOT NULL
        AND fat_100g IS NOT NULL
        AND carbs_100g IS NOT NULL
        AND abs(atwater_delta_kcal) <= GREATEST(
              $3::double precision,
              $4::double precision * abs(kcal_100g - atwater_delta_kcal)
            )
        AND (name_norm LIKE $5 ESCAPE '\\' OR $1 <% name_norm)
      ORDER BY (name_norm LIKE $5 ESCAPE '\\') DESC,
               word_similarity($1, name_norm) DESC,
               length(name_norm)
      LIMIT $6`,
    [
      norm,
      [...SEARCHABLE_SOURCES],
      ATWATER_ABS_TOLERANCE_KCAL,
      ATWATER_REL_TOLERANCE,
      `%${escapeLike(norm)}%`,
      limit + CATALOG_SEARCH_OVERFETCH,
    ],
    { op: "product_catalog.search" },
  );

  return rows.map((row) => ({
    // Стабільний id: та сама картка дає той самий ключ між запитами, тож
    // React не перебудовує список і клієнтський дедуп працює.
    id: `cat_${row.source}_${row.barcode}`,
    name: row.name,
    brand: row.brand,
    source: row.source as FoodSearchProduct["source"],
    per100: {
      kcal: row.kcal_100g,
      protein_g: row.protein_100g,
      fat_g: row.fat_100g,
      carbs_g: row.carbs_100g,
    },
    // 100 г — той самий дефолт, що й у нормалізаторів upstream-ів:
    // макроси зберігаються на 100 г, тож без явної порції це нейтральний
    // вибір, який не спотворює перерахунок.
    defaultGrams: row.serving_grams ?? 100,
  }));
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
 * свій продукт; те, що ми не змогли його запамʼятати, — наша проблема,
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

  // Пара до воріт у `lookupInCatalog`: рядок без жодного макроса читач
  // однаково не віддасть, тож писати його — це лише засмічувати таблицю
  // й видачу `searchCatalog` картками, які не можна залогувати. Типовий
  // постачальник таких карток — `upcitemdb`: він знає назву й бренд, але
  // нутрієнтів не має взагалі.
  const hasAnyMacro =
    inRange(product.kcal_100g, 1000) != null ||
    inRange(product.protein_100g, 100) != null ||
    inRange(product.fat_100g, 100) != null ||
    inRange(product.carbs_100g, 100) != null;
  if (!hasAnyMacro) return;

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
