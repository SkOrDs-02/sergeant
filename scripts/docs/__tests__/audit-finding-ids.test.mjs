// scripts/docs/__tests__/audit-finding-ids.test.mjs
//
// Пін на УНІКАЛЬНІСТЬ ID знахідок усередині одного аудиту.
//
// **Навіщо.** Аудит `2026-09-13-product-full-review.md` деякий час ніс ДВА
// різні `PR-X4`: «Тач-таргети» і «Мобайл повторює веб». Другий завели
// пізніше, взявши номер, який виглядав вільним, — і дублікат доїхав у
// `main`, бо ніщо його не перевіряло.
//
// Ціна дубліката не косметична: на ID знахідки посилаються коміти, тіла
// PR-ів, `rationale` у `.tech-debt/*.json` і перехресні посилання між
// самими знахідками. Коли їх два, будь-яке таке посилання стає
// двозначним, а «виправлено PR-X4» — нечитабельним.
//
// Пін навмисно дешевий: жодного парсера Markdown, лише заголовки третього
// рівня виду `### PR-<ID>.` у кожному файлі аудиту окремо. Номери МОЖУТЬ
// повторюватись між різними аудитами — це різні документи.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const AUDITS = join(ROOT, "docs/work/specs/audits");

/** `### PR-A7.` / `### PR-X12.` — ID до першої крапки. */
const FINDING = /^###\s+(PR-[A-Z]+\d+)\./gm;

function mdFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      mdFiles(full, out);
      continue;
    }
    if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

test("ID знахідок унікальні в межах кожного аудиту", () => {
  const problems = [];
  for (const file of mdFiles(AUDITS)) {
    const src = readFileSync(file, "utf8");
    const seen = new Map();
    FINDING.lastIndex = 0;
    let m;
    while ((m = FINDING.exec(src)) !== null) {
      const line = src.slice(0, m.index).split("\n").length;
      seen.set(m[1], [...(seen.get(m[1]) ?? []), line]);
    }
    for (const [id, lines] of seen) {
      if (lines.length > 1) {
        problems.push(
          `${relative(ROOT, file)}: ${id} × ${lines.length} (рядки ${lines.join(", ")})`,
        );
      }
    }
  }
  assert.deepEqual(
    problems,
    [],
    "на ID знахідки посилаються коміти, PR-и і rationale — дублікат робить посилання двозначним",
  );
});

test("сканер щось бачить — інакше пін порожній", () => {
  // Нижня межа проти зламаного патерна: якщо знахідок нуль, попередній тест
  // зелений завжди й нічого не означає.
  let total = 0;
  for (const file of mdFiles(AUDITS)) {
    const src = readFileSync(file, "utf8");
    FINDING.lastIndex = 0;
    while (FINDING.exec(src) !== null) total += 1;
  }
  assert.ok(total > 50, `знайдено лише ${total} знахідок — патерн зламано?`);
});
