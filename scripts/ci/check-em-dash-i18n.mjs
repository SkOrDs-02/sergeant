#!/usr/bin/env node
// scripts/ci/check-em-dash-i18n.mjs
//
// Нуль довгих тире «—» у message-каталозі `apps/web/src/shared/i18n`.
//
// ЧОМУ ЦЕЙ ГЕЙТ ІСНУЄ ОКРЕМО ВІД ESLINT-ПРАВИЛА
//
// `sergeant-design/ukrainian-copy` уже гейтить §1.9 канону
// (`docs/01-product/copy/style-guide.uk.md`), але ходить по AST, і через це
// має три сліпі плями рівно там, де живе цей каталог:
//
//   1. Коментарі. ESLint не віддає їх вузлами взагалі. Аудит 2026-08-29
//      знайшов 224 довгих тире в цих файлах, і ВСІ до одного сиділи в
//      докблоках і `//`-коментарях, тобто гейт про них не знав нічого.
//   2. Англійська копія. Правило заходить лише в рядки з кирилицею, тож
//      рядок `en.ts` про тижневі звіти асистента лишався для нього
//      невидимим.
//   3. Файловий `eslint-disable`. `uk.dataExport.ts` вимикає правило цілком
//      заради винятку на «ми» (§2), і разом із ним мовчки знімає перевірку
//      тире.
//
// ЧОМУ ЛИШЕ КАТАЛОГ, А НЕ ВЕСЬ `apps/web`
//
// Сирий скан по всьому `apps/web/src` дає ~1500 влучань, майже всі в
// коментарях. Такий гейт був би червоним від народження, а «червоний
// завжди» інформаційно дорівнює «вимкнений» (той самий урок, що в
// AGENTS.md § Performance budgets). Каталог же приведено до нуля цілком,
// тож поріг тут абсолютний і тримається без allowlist-а.
//
// Продуктову копію ПОЗА каталогом далі стереже ESLint-правило.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..", "..");

const SCAN_DIR = "apps/web/src/shared/i18n";
const SOURCE_EXT_RE = /\.(?:ts|tsx)$/;
const EM_DASH = "—";

// Єдиний легітимний «—» у каталозі: самотній символ як плейсхолдер
// порожнього значення в клітинці (§1.9 канону: там це символ, а не
// текст). Гасимо його пробілом тієї ж довжини, щоб позиції решти
// влучань лишились точними.
const PLACEHOLDER_RE = /(["'`])—\1/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      yield* walk(full);
    } else if (st.isFile() && SOURCE_EXT_RE.test(full)) {
      yield full;
    }
  }
}

/** Позиції довгих тире в тексті, окрім самотнього плейсхолдера. */
export function findEmDashes(source) {
  const masked = source.replace(
    PLACEHOLDER_RE,
    (_m, quote) => `${quote} ${quote}`,
  );
  const hits = [];
  const lines = masked.split("\n");
  const rawLines = source.split("\n");
  lines.forEach((line, i) => {
    let from = 0;
    for (;;) {
      const at = line.indexOf(EM_DASH, from);
      if (at === -1) break;
      hits.push({
        line: i + 1,
        column: at + 1,
        text: (rawLines[i] ?? line).trim(),
      });
      from = at + 1;
    }
  });
  return hits;
}

export function scan(root = DEFAULT_ROOT) {
  const failures = [];
  for (const file of walk(resolve(root, SCAN_DIR))) {
    const source = readFileSync(file, "utf8");
    if (!source.includes(EM_DASH)) continue;
    for (const hit of findEmDashes(source)) {
      failures.push({ file: relative(root, file), ...hit });
    }
  }
  return failures;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = rootArg
    ? resolve(rootArg.slice("--root=".length))
    : DEFAULT_ROOT;
  const failures = scan(root);

  if (failures.length > 0) {
    console.error(
      `[check-em-dash-i18n] ${failures.length} long dash(es) in the i18n catalog:`,
    );
    for (const f of failures) {
      console.error(`  x ${f.file}:${f.line}:${f.column}  ${f.text}`);
    }
    console.error(
      "\nКанон docs/01-product/copy/style-guide.uk.md §1.9: перебудуй фразу " +
        "(кома, двокрапка, дужки, окреме речення). Якщо тире несе граматику, " +
        "а не риторику, став коротке «–» (§9а).",
    );
    process.exit(1);
  }

  console.log("[check-em-dash-i18n] OK - no long dashes in the i18n catalog.");
}
