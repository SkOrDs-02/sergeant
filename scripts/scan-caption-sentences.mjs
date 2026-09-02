#!/usr/bin/env node
// scripts/scan-caption-sentences.mjs
//
// Замір, а не гейт. Рахує, скільки місць у `apps/web/src` набирають
// РЕЧЕННЯ роллю `.text-style-caption` (12px) — тобто ставлять текст, який
// читають, у найдрібнішу роль шкали.
//
// Навіщо окремий скрипт, а не одна регулярка в чаті: число з цього заміру
// цитується в `docs/05-design/design/density-hierarchy-spec.md`, а число
// без способу його переміряти протухає мовчки. Тут зафіксовано САМЕ той
// поріг і саме той обхід дерева, якими рахували на дату специфікації.
//
// ДВІ ПОЛОВИНИ ЗАМІРУ. Перша — JSX-літерали прямо у файлі. Друга — тіла,
// що приходять зі словника `@shared/i18n/uk` (`{m.durability.localOnly.body}`
// і подібні): їх у файлі не видно взагалі, і перша редакція цього скрипта
// їх не рахувала. Виявилось це на екрані — банер «Дані лише на цьому
// пристрої» стоїть у тій самій формі, що й «Без банку?», але в перелік
// кандидатів не потрапив, бо його текст лежить у каталозі. Тому скрипт
// збирає каталог через `esbuild` і резолвить дотові шляхи, включно з
// файловими аліасами виду `const m = messages.durability.localOnly`.
//
// Свідомо НЕ гейт і не codemod. `docs/05-design/design/anti-slop-strategy.md`
// (§4, «Спроба рознести правила 1–3 далі») тричі записав ту саму помилку:
// обмежувати механічну заміну патерном ТЕКСТУ, а не місцем. Класифікація
// «речення чи підказка під контролом» — властивість відрендереного екрана,
// не файлу, тож цей скрипт лише перелічує кандидатів для ручного проходу.
//
// Використання:
//   node scripts/scan-caption-sentences.mjs            # зведення по модулях
//   node scripts/scan-caption-sentences.mjs --list     # усі місця file:line
//   node scripts/scan-caption-sentences.mjs --json     # машинний вихід
//
// Status: Active

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "apps/web/src";
/** Кириличний рядок від такої довжини вважається реченням, а не міткою. */
const SENTENCE_MIN = 45;
/** Скільки рядків після `text-style-caption` вважати тілом того ж вузла. */
const NODE_SPAN = 4;
const SKIP_DIRS = new Set(["node_modules", "__snapshots__", "__tests__"]);

/** @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}

/** Збирає `@shared/i18n/uk` у тимчасовий ESM; null, якщо esbuild недоступний. */
function bundleCatalogue() {
  const dir = mkdtempSync(join(tmpdir(), "caption-scan-"));
  const out = join(dir, "uk.mjs");
  try {
    execFileSync(
      "node_modules/.bin/esbuild",
      [
        `${ROOT}/shared/i18n/uk.ts`,
        "--bundle",
        "--format=esm",
        "--platform=node",
        `--outfile=${out}`,
        "--log-level=error",
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    return { dir, out };
  } catch {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
}

function flatten(node, prefix, into) {
  if (typeof node === "string") {
    into.set(prefix, node);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, into);
  }
}

const catalogue = new Map();
const bundled = bundleCatalogue();
if (bundled) {
  try {
    const mod = await import(pathToFileURL(bundled.out).href);
    flatten(mod.messages, "", catalogue);
  } catch {
    /* каталог не зібрався — рахуємо лише літерали; це видно в підсумку */
  }
  rmSync(bundled.dir, { recursive: true, force: true });
}

/** `const m = messages.durability.localOnly` → { m: "durability.localOnly" }. */
function aliasesIn(src) {
  const map = new Map([["messages", ""]]);
  const re =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*messages((?:\.[A-Za-z_$][\w$]*)+)\s*;/g;
  let match;
  while ((match = re.exec(src)) !== null) map.set(match[1], match[2].slice(1));
  return map;
}

const CYRILLIC_RUN = /[А-Яа-яЇїІіЄєҐґ][^<>{}"'`]{20,}/g;
const INTERPOLATED = />\s*\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\}/g;

const hits = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("text-style-caption")) continue;
  const aliases = aliasesIn(src);
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("text-style-caption")) continue;
    const chunk = lines.slice(i, i + NODE_SPAN).join(" ");
    let longest = "";
    let source = "literal";
    for (const run of chunk.match(CYRILLIC_RUN) ?? []) {
      const text = run.trim();
      if (text.length > longest.length) longest = text;
    }
    if (longest.length < SENTENCE_MIN && catalogue.size > 0) {
      INTERPOLATED.lastIndex = 0;
      let match;
      while ((match = INTERPOLATED.exec(chunk)) !== null) {
        const [head, ...rest] = match[1].split(".");
        const base = aliases.get(head);
        if (base === undefined) continue;
        const value = catalogue.get([base, ...rest].filter(Boolean).join("."));
        if (typeof value === "string" && value.length > longest.length) {
          longest = value;
          source = "catalogue";
        }
      }
    }
    if (longest.length >= SENTENCE_MIN) {
      hits.push({
        file: relative(".", file),
        line: i + 1,
        source,
        text: longest.slice(0, 110),
      });
    }
  }
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(hits, null, 1)}\n`);
  process.exit(0);
}

const byModule = new Map();
for (const hit of hits) {
  const parts = hit.file.split("/");
  const key = parts.slice(3, 5).join("/") || parts.slice(3).join("/");
  byModule.set(key, (byModule.get(key) ?? 0) + 1);
}

const fromCatalogue = hits.filter((h) => h.source === "catalogue").length;
console.log(
  `Речення в ролі caption: ${hits.length} місць ` +
    `(${hits.length - fromCatalogue} літералом у файлі, ${fromCatalogue} зі словника)\n`,
);
for (const [mod, count] of [...byModule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${mod}`);
}

if (process.argv.includes("--list")) {
  console.log("");
  for (const hit of hits)
    console.log(`${hit.file}:${hit.line} [${hit.source}]\n   ${hit.text}`);
}
