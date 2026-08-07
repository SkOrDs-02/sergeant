#!/usr/bin/env node
/**
 * Гейт на **eager**-частину бандла — те, що браузер тягне до першого екрана.
 *
 * AI-CONTEXT: `size-limit` рахує СУМУ всіх emit-нутих чанків (318 штук на
 * момент написання), включно з тими, які більшість людей ніколи не
 * завантажить: `vendor-zxing` вантажиться лише при скануванні штрихкоду,
 * `NutritionApp` — лише при вході в Харчування. Тобто те число росте від
 * будь-якої нової фічі й нічого не каже про швидкість застосунку. Lazy-split
 * навіть погіршує його читабельність: розбити важкий модуль на два чанки —
 * це виграш для користувача і нуль для гейта.
 *
 * Цей скрипт міряє інше й чесніше: суму рівно тих чанків, що прописані в
 * `index.html` як `<link rel="modulepreload">` або `<script src>` — тобто
 * критичний шлях. Саме його треба тримати і рухати ВНИЗ.
 *
 * Використання:
 *   node scripts/ci/check-eager-bundle.mjs [--dist <шлях>] [--limit <байти>]
 *   node scripts/ci/check-eager-bundle.mjs --json
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

/**
 * Стеля eager-бандла у байтах (SI, як у `size-limit`).
 *
 * ⚠️ **Це храповик, а не комфортна зона.** На 2026-08-02 факт був ~430 kB —
 * втричі більше за загальновживаний орієнтир «≤170 kB стисненого JS до
 * інтерактиву» для мобільного. Тримаємось лише тому, що це встановлювана PWA
 * з сервіс-воркером, і повторні візити йдуть із кешу. Число тут існує, щоб
 * ловити регресії й опускатись, а не щоб виправдовувати зростання.
 *
 * **Ратчет 2026-08-05: 450 → 470 kB.** Заміри на цю дату: `origin/main` —
 * **467.7 kB** у 111 preload-чанках, гілка pre-beta-аудиту — 464.6 kB у 109.
 * Тобто ліміт 450 kB був пробитий ще ДО цього PR: між 2026-08-02 і 2026-08-05
 * main виріс на ~38 kB, і гейт світився червоним на кожному PR незалежно від
 * його змісту. «Червоний завжди» інформаційно дорівнює «вимкнений» — той
 * самий аргумент, яким 2026-08-02 ратчетили `size-limit` (1.25 → 1.35 MB).
 * Нове число дає ~0.5% запасу над фактом main, тож наступний важкий eager-імпорт
 * знову розбудить гейт.
 *
 * **Ратчет 2026-08-07: 470 → 430 kB.** Уперше вниз. Причина — `posthog-js`
 * (224 kB сирих, ~60 kB brotli) виїхав із критичного шляху: замір показав, що
 * він там БУВ, попри те, що `core/observability/posthog.ts` тягне SDK через
 * `await import()` і лише за наявності `VITE_POSTHOG_KEY`. Винен catch-all
 * `return "vendor"` у `manualChunks` — Rollup слухає manualChunks ПЕРШИМ, і
 * пакет падав у жадібний спільний чанк, де лінивість імпорту вже нічого не
 * означала. Окреме правило `vendor-posthog` це виправило: 472.3 → **411.7 kB**.
 *
 * Тобто попередній ратчет угору лікував симптом. Число росло не тому, що
 * продукт важчав, а тому, що конфіг збірки мовчки скасовував лінивість —
 * і той самий catch-all уже двічі ловили раніше (Capacitor, sqlite), просто
 * не перевірили решту.
 *
 * **Ратчет 2026-08-07 (другий за день): 430 → 280 kB.** `vendor-sqlite`
 * ПІШОВ з критичного шляху: 411.7 → **264.6 kB**, 111 preload-чанків → 73.
 * Разом із виносом `posthog-js` того самого дня це −207.7 kB від 472.3.
 *
 * Важіль виявився не там, де його шукали три рази поспіль. Ділити
 * `db-schema` було марно (див. нижче), гасити `kvStoreBoot` окремо — теж
 * (замір давав +2.3 kB, тобто гірше). Спрацювало інше: `RootLayout.tsx`
 * статично тягнув 13 boot-хуків чотирьох модулів. Вони невидимі —
 * рендерять `null` і працюють лише під сесією — але через них eager-граф
 * діставав drizzle. `React.lazy` на чотири кластери + перенос ОДНІЄЇ
 * рядкової константи (`SYNC_OP_CURSOR_PULL_SINCE`) у вже наявний вхід
 * `@sergeant/db-schema/shared` зрізали всі мости разом.
 *
 * **Чому «зрізати частину мостів» раніше давало мінус:** `manualChunks`
 * склеює весь `drizzle-orm` в один чанк, тож поки лишається бодай одне
 * eager-ребро, ті самі 69 kB лишаються на критичному шляху — а нові
 * динамічні межі додають чанків. Виграш дає лише зняття ОСТАННЬОГО ребра.
 *
 * **Що було всередині `vendor-sqlite`** — бо на ньому двічі поспіль ставили
 * хибний діагноз, і замір сорсмапи (2026-08-07) спростував обидва. У чанку
 * рівно 53 модулі: 52 з `drizzle-orm` і один tree-shaken стаб
 * `@sqlite.org/sqlite-wasm`. Модулів `@sergeant/db-schema` там **нуль** — усі
 * `sqliteTable()`-визначення разом важать ~6.5 kB і лежать окремо.
 *
 * Тобто вагу давав РАНТАЙМ drizzle, а табличні визначення були лише мостом:
 * вони імпортують `drizzle-orm/sqlite-core`. Ділити `db-schema` заради
 * розміру defs сенсу не мало — треба було прибрати ребра, що ведуть до
 * барелю з boot-шляху, і саме це зробив ратчет вище.
 *
 * **Борг, що лишається:** ціль ≤170 kB (орієнтир для мобільного) ще не взята
 * — 264.6 проти 170. Наступні кандидати вже не в drizzle, а в тому, що
 * лишилось у списку: `vendor-react`, `vendor-router`, спільний `vendor`.
 *
 * Актуальний розбір і напрямки — `docs/90-work/tech-debt/frontend.md`.
 */
const DEFAULT_LIMIT_BYTES = 280_000;

const DEFAULT_DIST = "apps/server/dist";

function parseArgs(argv) {
  const out = { dist: DEFAULT_DIST, limit: DEFAULT_LIMIT_BYTES, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--dist") out.dist = argv[++i] ?? out.dist;
    else if (a === "--limit") out.limit = Number(argv[++i] ?? out.limit);
  }
  return out;
}

function brotli(buf) {
  return brotliCompressSync(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}

function main() {
  const { dist, limit, json } = parseArgs(process.argv.slice(2));
  const root = resolve(process.cwd(), dist);
  const html = join(root, "index.html");
  const assets = join(root, "assets");

  if (!existsSync(html) || !existsSync(assets)) {
    console.error(
      `[eager-bundle] немає збірки у ${dist} — спершу \`pnpm --filter @sergeant/web build\`.`,
    );
    process.exit(2);
  }

  const markup = readFileSync(html, "utf8");
  // Ловимо і `href` (modulepreload), і `src` (класичний script) — Vite
  // використовує обидва, і пропустити один означає занизити число.
  const referenced = new Set(
    [...markup.matchAll(/(?:href|src)="([^"]+\.js)"/g)].map((m) =>
      basename(m[1]),
    ),
  );

  const present = new Set(readdirSync(assets).filter((f) => f.endsWith(".js")));
  const eager = [...referenced].filter((f) => present.has(f));
  const missing = [...referenced].filter((f) => !present.has(f));

  let total = 0;
  const rows = [];
  for (const f of eager) {
    const size = brotli(readFileSync(join(assets, f)));
    total += size;
    rows.push({ file: f, brotli: size });
  }
  rows.sort((a, b) => b.brotli - a.brotli);

  if (json) {
    console.log(JSON.stringify({ total, limit, chunks: rows }, null, 2));
  } else {
    const kb = (n) => (n / 1000).toFixed(1);
    console.log(
      `[eager-bundle] ${kb(total)} kB brotli у ${rows.length} preload-чанках (ліміт ${kb(limit)} kB)`,
    );
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${kb(r.brotli).padStart(7)} kB  ${r.file}`);
    }
    if (missing.length > 0) {
      // Не мовчимо: розбіжність index.html ↔ assets означає, що ми могли
      // порахувати НЕ весь критичний шлях, і зелений результат тут брехливий.
      console.warn(
        `[eager-bundle] ⚠️ ${missing.length} посилань з index.html не знайдено в assets/: ${missing.join(", ")}`,
      );
    }
  }

  if (total > limit) {
    console.error(
      `[eager-bundle] ❌ критичний шлях виріс на ${((total - limit) / 1000).toFixed(1)} kB понад ліміт.\n` +
        `  Це те, що людина чекає до першого екрана — підіймати число можна лише свідомо й з обґрунтуванням у PR.`,
    );
    process.exit(1);
  }
  console.log("[eager-bundle] ✅ у межах бюджету.");
}

main();
