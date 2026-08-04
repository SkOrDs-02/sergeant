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
 * ⚠️ **Це храповик, а не комфортна зона.** На 2026-08-02 факт — ~430 kB,
 * тобто втричі більше за загальновживаний орієнтир «≤170 kB стисненого JS до
 * інтерактиву» для мобільного. Тримаємось лише тому, що це встановлювана PWA
 * з сервіс-воркером, і повторні візити йдуть із кешу. Число тут існує, щоб
 * ловити регресії й опускатись, а не щоб виправдовувати зростання: перший
 * кандидат на винесення в lazy — `vendor-sqlite` (~68 kB).
 */
const DEFAULT_LIMIT_BYTES = 450_000;

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
