#!/usr/bin/env node
/**
 * Посів `product_catalog` українським зрізом Open Food Facts.
 *
 * Джерело — офіційний CSV-експорт OFF під ODbL 1.0, який публікується
 * саме для перевикористання. Рядки лягають із `source = 'off'`, тобто
 * лишаються відокремлюваними одним `WHERE` — цього вимагає share-alike
 * (див. шапку міграції 123 і docs/90-work/planning/barcode-database-research.md).
 *
 * Чому дамп, а не search API: OFF віддає HTTP 401 на глибокій пагінації
 * (перевірено 2026-08-22 — 25 сторінок із 36 обірвались) і сам радить
 * bulk-експорт. Дамп ~1–2 ГБ у gzip; на диск не зберігається — читаємо
 * потоком і лишаємо тільки українські рядки.
 *
 * Usage:
 *
 *   DATABASE_URL=postgresql://hub:hub@127.0.0.1:5432/hub \
 *     node scripts/seed-product-catalog.mjs
 *
 *   # без запису — лише звіт про те, що пройшло б ворота якості
 *   node scripts/seed-product-catalog.mjs --dry-run
 *
 *   # з уже відфільтрованого JSONL (швидка ітерація без 12 ГБ трафіку)
 *   node scripts/seed-product-catalog.mjs --input=/tmp/off-ua.jsonl
 *
 * Безпечний для повторного запуску: upsert по `(barcode, source)`.
 */

import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import pg from "pg";

const DUMP_URL =
  "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";
const USER_AGENT =
  "SergeantNutrition/0.1 (UA catalogue seed; github.com/SkOrDs-02/sergeant)";
const SOURCE = "off";
const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INPUT = args
  .find((a) => a.startsWith("--input="))
  ?.slice("--input=".length);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 0);

// ── Нормалізація ────────────────────────────────────────────────────────────

/**
 * AI-DANGER: мусить давати ПОБАЙТОВО той самий результат, що
 * `buildProductSearchKey` з `packages/shared/src/utils/productSearchKey.ts`
 * — саме він тепер канон, і ним рахує ключ серверний write-through.
 *
 * Чому копія, а не імпорт: `@sergeant/shared` віддається як TypeScript
 * (`main: "./src/index.ts"`), а цей скрипт — простий node-ESM без збірки,
 * тож імпортувати нема що. Розбіжність між цими двома реалізаціями не
 * впаде і не залогується — вона просто зробить так, що посіяний товар не
 * знайдеться за тим самим запитом, за яким знаходиться дописаний
 * сканером. Правиш одне — правиш обидва.
 */
function normText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[’'ʼ`]/g, "'")
    .replace(/\s+/g, " ");
}

/**
 * Розкодувати HTML-сутності в тексті від джерела.
 *
 * OFF заповнюють люди через веб-форму, і частина назв приїжджає вже
 * екранованою: у дампі трапляється `Конфета &quot;Ромашка&quot; Рошен`.
 * Без цього кроку сирі `&quot;` потрапили б і в картку продукту, яку
 * бачить користувач, і в пошуковий ключ — де вони ще й зіпсували б
 * триграми навколо лапок.
 *
 * Свідомо вузький набір: п'ять сутностей, які реально трапляються в
 * назвах товарів, плюс числові. Повний HTML-парсер тут зайвий — це
 * назви продуктів, не розмітка.
 */
const HTML_ENTITIES = {
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decodeEntities(s) {
  return String(s || "")
    .replace(/&(?:quot|apos|amp|lt|gt|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

/**
 * GTIN → канонічний штрихкод каталогу.
 *
 * Повертає `null` для того, що не має права лежати в глобальному
 * довіднику, і це не те саме, що «биті дані»:
 *
 *   * префікс 2 — внутрішньомагазинний ваговий код, який генерує касовий
 *     термінал конкретної мережі. Він не ідентифікує товар глобально:
 *     `2853532000000` — це «огірок тепличний» у Novus і будь-що інше в
 *     сусідньому магазині. Вимір 2026-08-22 показав, що такі коди — 35
 *     зі 104 позицій реальної полиці, тобто третина сканів, і жоден
 *     вендор їх не закриє;
 *   * довжина поза 8..14 — не GTIN.
 */
function normalizeBarcode(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  // GTIN-14 з провідними нулями — це EAN-13/UPC-12 у широкому полі.
  while (d.length > 13 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 13 && d.startsWith("0")) d = d.slice(1);
  if (d.length < 8 || d.length > 14) return null;
  if (d.startsWith("2")) return null;
  return d;
}

const num = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Сума за коефіцієнтами Атвотера — 4/9/4 ккал на грам. */
const atwaterOf = (p, f, c) =>
  p == null || f == null || c == null ? null : 4 * p + 9 * f + 4 * c;

/**
 * Полагодити калорійність, у полі якої лежать кілоджоулі.
 *
 * Реальна вада джерел, не гіпотетична: у картці Listex для батона
 * 4820062051613 стоїть `ккал = 1102` при `кДж = 260`, хоча за макросами
 * тієї ж картки виходить 260 ккал. Ознака підміни — заявлене значення
 * приблизно вчетверо більше за суму Атвотера (1 ккал = 4.184 кДж).
 *
 * Чому лагодимо, а не відкидаємо товар: назва, штрихкод і макроси в тій
 * самій картці справні. Викидати весь продукт через одне зіпсоване поле
 * означало б втратити більше, ніж виправити. А не полагодити — означало б
 * впертись у CHECK `kcal <= 1000` і втратити рядок узагалі.
 */
function repairKcal(kcal, atwater) {
  if (kcal == null || atwater == null || atwater <= 0)
    return { kcal, repaired: false };
  const ratio = kcal / atwater;
  if (ratio > 3.6 && ratio < 4.8) {
    return { kcal: Math.round((kcal / 4.184) * 10) / 10, repaired: true };
  }
  return { kcal, repaired: false };
}

/** Значення поза фізичними межами БД відкидаємо ПОЛЕМ, не рядком. */
const inRange = (v, max) => (v == null || v < 0 || v > max ? null : v);

function toRow(r) {
  const barcode = normalizeBarcode(r.code);
  if (!barcode) return { skip: "barcode" };

  const name = decodeEntities(r.product_name).trim();
  if (!name) return { skip: "name" };

  const brand = decodeEntities(r.brands).trim() || null;
  const nameNorm = normText([name, brand].filter(Boolean).join(" "));
  if (!nameNorm) return { skip: "name_norm" };

  const protein = inRange(num(r.proteins_100g), 100);
  const fat = inRange(num(r.fat_100g), 100);
  const carbs = inRange(num(r.carbohydrates_100g), 100);

  // OFF тримає кілоджоулі в `energy_100g`; беремо їх, коли ккал не дали.
  let kcal = num(r["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(r.energy_100g);
    if (kj != null) kcal = Math.round((kj / 4.184) * 10) / 10;
  }

  const atwater = atwaterOf(protein, fat, carbs);
  const fixed = repairKcal(kcal, atwater);
  kcal = inRange(fixed.kcal, 1000);

  return {
    repaired: fixed.repaired,
    row: [
      barcode,
      SOURCE,
      name.slice(0, 400),
      nameNorm.slice(0, 400),
      brand?.slice(0, 200) ?? null,
      String(r.quantity || "").trim() || null,
      kcal,
      protein,
      fat,
      carbs,
      inRange(num(r.fiber_100g), 100),
      inRange(num(r.sugars_100g), 100),
      inRange(num(r["saturated-fat_100g"]), 100),
      inRange(num(r.salt_100g), 100),
      inRange(num(r.alcohol_100g), 100),
      String(r.serving_size || "").trim() || null,
      (() => {
        const g = num(r.serving_quantity);
        return g != null && g > 0 && g <= 10000 ? g : null;
      })(),
      decodeEntities(r.ingredients_text).trim() || null,
      String(r.countries_en || "")
        .split(",")[0]
        ?.trim() || null,
      String(r.image_url || "").trim() || null,
      `https://world.openfoodfacts.org/product/${barcode}`,
      num(r.last_modified_t) ? new Date(num(r.last_modified_t) * 1000) : null,
    ],
  };
}

// ── Запис ───────────────────────────────────────────────────────────────────

const COLUMNS = [
  "barcode",
  "source",
  "name",
  "name_norm",
  "brand",
  "quantity",
  "kcal_100g",
  "protein_100g",
  "fat_100g",
  "carbs_100g",
  "fiber_100g",
  "sugars_100g",
  "saturated_fat_100g",
  "salt_100g",
  "alcohol_100g",
  "serving_size",
  "serving_grams",
  "ingredients",
  "country",
  "image_url",
  "source_ref",
  "source_updated_at",
];

/**
 * Пакетний upsert. Один запит на BATCH_SIZE рядків замість рядок-за-рядком:
 * sergeant-data-and-migrations/references/data-batch-inserts.md.
 * `fetched_at`/`updated_at` оновлюються на кожному прогоні — саме за ними
 * потім шукатиметься застаріле.
 */
async function flush(client, rows) {
  if (!rows.length) return 0;
  const values = [];
  const params = [];
  rows.forEach((row, i) => {
    const base = i * COLUMNS.length;
    values.push(`(${COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    params.push(...row);
  });
  const updates = COLUMNS.filter((c) => c !== "barcode" && c !== "source")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await client.query(
    `INSERT INTO product_catalog (${COLUMNS.join(",")})
     VALUES ${values.join(",")}
     ON CONFLICT (barcode, source) DO UPDATE
       SET ${updates}, fetched_at = NOW(), updated_at = NOW()`,
    params,
  );
  return rows.length;
}

// ── Джерело рядків ──────────────────────────────────────────────────────────

function openStream() {
  if (INPUT) {
    return {
      stream: createReadStream(INPUT, "utf8"),
      jsonl: true,
      child: null,
    };
  }
  const curl = spawn("curl", [
    "-sS",
    "-L",
    "--max-time",
    "3600",
    "-A",
    USER_AGENT,
    DUMP_URL,
  ]);
  curl.stderr.on("data", (d) => process.stderr.write(`curl: ${d}`));
  const gunzip = createGunzip();
  curl.stdout.pipe(gunzip);
  return { stream: gunzip, jsonl: false, child: curl };
}

function isUkrainian(rec, barcodeRaw) {
  const c =
    `${rec.countries_en ?? ""} ${rec.countries_tags ?? ""} ${rec.countries ?? ""}`.toLowerCase();
  return (
    c.includes("ukrain") ||
    c.includes("україн") ||
    String(barcodeRaw ?? "")
      .replace(/\D/g, "")
      .replace(/^0+/, "")
      .startsWith("482")
  );
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl && !DRY_RUN) {
    console.error(
      "DATABASE_URL не заданий. Або задай його, або запусти з --dry-run.",
    );
    process.exit(1);
  }

  const client = DRY_RUN ? null : new pg.Client({ connectionString: dbUrl });
  if (client) await client.connect();

  const stats = {
    scanned: 0,
    ukrainian: 0,
    written: 0,
    repairedKcal: 0,
    skipBarcode: 0,
    skipName: 0,
    skipNameNorm: 0,
    withFullMacros: 0,
  };

  const { stream, jsonl, child } = openStream();
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let header = null;
  let batch = [];

  try {
    for await (const line of rl) {
      let rec;
      if (jsonl) {
        if (!line.trim()) continue;
        rec = JSON.parse(line);
      } else {
        if (header === null) {
          header = line.split("\t");
          continue;
        }
        const f = line.split("\t");
        if (f.length < header.length - 5) continue;
        rec = {};
        header.forEach((h, i) => {
          rec[h] = f[i];
        });
      }

      stats.scanned++;
      if (stats.scanned % 500_000 === 0)
        console.error(
          `  ${(stats.scanned / 1000).toFixed(0)}k рядків · ${stats.written} записано`,
        );

      if (!isUkrainian(rec, rec.code)) continue;
      stats.ukrainian++;

      const out = toRow(rec);
      if (out.skip === "barcode") {
        stats.skipBarcode++;
        continue;
      }
      if (out.skip === "name") {
        stats.skipName++;
        continue;
      }
      if (out.skip === "name_norm") {
        stats.skipNameNorm++;
        continue;
      }
      if (out.repaired) stats.repairedKcal++;
      if (
        out.row[6] != null &&
        out.row[7] != null &&
        out.row[8] != null &&
        out.row[9] != null
      )
        stats.withFullMacros++;

      batch.push(out.row);
      if (batch.length >= BATCH_SIZE) {
        stats.written += client ? await flush(client, batch) : batch.length;
        batch = [];
      }
      if (LIMIT && stats.ukrainian >= LIMIT) break;
    }
    stats.written += client ? await flush(client, batch) : batch.length;
  } finally {
    rl.close();
    child?.kill();
    if (client) await client.end();
  }

  const pct = (n) =>
    stats.ukrainian ? `${((n / stats.ukrainian) * 100).toFixed(1)}%` : "—";
  console.log("");
  console.log(`Просканованo рядків дампу : ${stats.scanned}`);
  console.log(`Українських               : ${stats.ukrainian}`);
  console.log(
    `  відсіяно за штрихкодом  : ${stats.skipBarcode} (${pct(stats.skipBarcode)})  — не GTIN або внутрішньомагазинний ваговий код`,
  );
  console.log(
    `  відсіяно без назви      : ${stats.skipName} (${pct(stats.skipName)})`,
  );
  console.log(`  відсіяно без ключа      : ${stats.skipNameNorm}`);
  console.log(`Полагоджено кДж→ккал      : ${stats.repairedKcal}`);
  console.log(
    `З повними КБЖВ            : ${stats.withFullMacros} (${pct(stats.withFullMacros)})`,
  );
  console.log(
    DRY_RUN
      ? `Придатних до запису       : ${stats.written} (dry-run, нічого не записано)`
      : `Записано в product_catalog: ${stats.written}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
