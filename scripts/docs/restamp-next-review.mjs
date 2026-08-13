#!/usr/bin/env node
// scripts/docs/restamp-next-review.mjs
//
// Перераховує `**Next review:**` у заголовку свіжості за поточною
// політикою каденції (`freshness-config.json` + `nextReviewFor`).
//
// Навіщо окремий скрипт, а не бампер. Бампер спрацьовує на КОМІТ і
// разом із датою перегляду переставляє `Last touched` — тобто твердить,
// що документ щойно чіпали. Тут потрібне протилежне: змінилась ПОЛІТИКА,
// а не документи, тож `Last touched` і автор лишаються недоторканими, а
// перераховується лише похідна дата.
//
// Це і є межа чесності цього скрипта: він ніколи не пише «переглянуто».
// Він пише «за новим правилом цей документ треба переглянути тоді-то».
//
// Ідемпотентний: `nextReviewFor` — чиста функція від шляху й дати
// останнього дотику, тож повторний запуск нічого не змінює.
//
// Usage:
//   node scripts/docs/restamp-next-review.mjs --dry-run
//   node scripts/docs/restamp-next-review.mjs
//   node scripts/docs/restamp-next-review.mjs --check   # CI-гейт

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasFreshnessHeader,
  isOffCalendar,
  listTrackedMarkdown,
  matchesAnyGlob,
  nextReviewFor,
  readConfigFile,
} from "./freshness-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const HEADER_LINE_LIMIT = 15;

// Той самий рядок, що його читають гейт і бампер. Група 6 — дата
// перегляду; переписуємо ЛИШЕ її.
const RE_HEADER =
  /^(>\s*\*\*Last (?:validated|touched):\*\*\s*)(\d{4}-\d{2}-\d{2})(.*?\*\*Next review:\*\*\s*)(\d{4}-\d{2}-\d{2})/m;

/**
 * Повертає `{ content, changed, from, to }`. Чиста — тестується без fs.
 */
export function restampHeader(
  content,
  path,
  config,
  lineLimit = HEADER_LINE_LIMIT,
) {
  const lines = content.split("\n");
  const headIdx = lines.slice(0, lineLimit).findIndex((l) => RE_HEADER.test(l));
  if (headIdx < 0) return { content, changed: false };

  const line = lines[headIdx];
  const m = RE_HEADER.exec(line);
  if (!m) return { content, changed: false };

  const lastTouched = m[2];
  const current = m[4];
  const next = nextReviewFor(path, lastTouched, config);
  if (next === current) return { content, changed: false };

  lines[headIdx] = line.replace(RE_HEADER, `$1$2$3${next}`);
  return {
    content: lines.join("\n"),
    changed: true,
    from: current,
    to: next,
  };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const checkMode = process.argv.includes("--check");
  const config = readConfigFile();
  const candidates = listTrackedMarkdown(REPO_ROOT);

  const changes = [];
  for (const rel of candidates) {
    if (matchesAnyGlob(rel, config.excludeGlobs)) continue;
    if (config.explicitExclude.includes(rel)) continue;
    const full = resolve(REPO_ROOT, rel);
    // Свідомо БЕЗ `existsSync` перед читанням: перевірка й використання —
    // дві різні операції, між якими файл може зникнути (CodeQL
    // js/file-system-race). Список шляхів приходить із `git ls-files`, тож
    // відсутній файл тут — нормальна ситуація (видалений, але ще не
    // закомічений), а не помилка. Ловимо її з самої спроби читання.
    let content;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (!hasFreshnessHeader(content)) continue;
    if (isOffCalendar(content)) continue;
    // Згенеровані файли володіють власним заголовком — його пише
    // генератор, і переписування розійшлось би з тим, що очікує --check.
    if (content.includes("<!-- AUTO-GENERATED FILE")) continue;

    const res = restampHeader(content, rel, config);
    if (!res.changed) continue;
    changes.push({ path: rel, from: res.from, to: res.to });
    if (!dryRun && !checkMode) writeFileSync(full, res.content);
  }

  if (checkMode) {
    if (changes.length === 0) {
      console.log("[restamp] дати перегляду відповідають політиці каденції.");
      process.exit(0);
    }
    console.error(
      `[restamp] ${changes.length} док(ів) розійшлись із політикою каденції:`,
    );
    for (const c of changes.slice(0, 20)) {
      console.error(`  ${c.path}: ${c.from} → має бути ${c.to}`);
    }
    if (changes.length > 20) {
      console.error(`  … ще ${changes.length - 20}`);
    }
    console.error("\nЗапусти: node scripts/docs/restamp-next-review.mjs");
    process.exit(1);
  }

  console.log(
    `[restamp] ${dryRun ? "показано" : "оновлено"} ${changes.length} док(ів).`,
  );
  for (const c of changes.slice(0, 12)) {
    console.log(`  ${c.path}: ${c.from} → ${c.to}`);
  }
  if (changes.length > 12) console.log(`  … ще ${changes.length - 12}`);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
