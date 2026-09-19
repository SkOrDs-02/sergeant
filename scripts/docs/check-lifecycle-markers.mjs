#!/usr/bin/env node
// scripts/docs/check-lifecycle-markers.mjs
//
// Theme 4 (consolidated audit 2026-05-13) — lifecycle marker coverage gate.
//
// Hard Rule #10: every file/doc declares its status via a `@status` JSDoc tag
// or a `> **Last validated:**` / `> **Status:**` markdown header.
//
// Що цей скрипт МІРЯЄ і чого він НЕ вимагає (звірка 2026-09-19).
//
// Скрипт рахує, скільки файлів `apps/web/src/**/*.{ts,tsx}` несуть ЯВНИЙ
// lifecycle-маркер. Це інформаційний показник, не список порушень — і ось
// чому. Канонічне тіло правила
// (`docs/governance/governance/rules/10-lifecycle-markers.md`) каже прямо:
//
//   «Якщо файл/док не має маркера, вважай його `Active` (дефолт)»,
//
// а таблиця тегів має окремий рядок «_(no tag)_ → Active. Default for
// everything else». Тобто відсутність маркера — це ДОЗВОЛЕНИЙ стан, а не
// порушення: маркер обов'язковий лише для НЕ-Active статусів
// (`@scaffolded`, `@experimental`, `@deprecated`), бо саме вони змінюють
// поведінку knip і dead-code-прибирання.
//
// Доти цей файл друкував «Missing markers: 805», «Coverage: 40.9%» і
// «Burn-down target: 2026-Q3». Жоден канонічний документ тієї дати не ніс:
// ні правило, ні `hard-rules.json` — вона жила лише в коментарях тут і в
// кроці CI. Тобто гейт звітував про недосягнення дедлайну, якого правило не
// ставило, за вимогою, якої правило не висуває. Розбір — PR-3 спеки
// `docs/work/specs/docs-code-drift-2026-09-19.md`.
//
// Чому скрипт лишається. Число все одно корисне як сигнал: різке падіння
// покриття означає, що велика партія файлів приїхала без жодних роздумів
// про статус. Але це спостереження, не борг.
//
// `--fail-on-violations` лишається ВИМКНЕНИМ. Вмикати його можна лише ПІСЛЯ
// того, як правило #10 змінять так, щоб явний маркер став обов'язковим для
// всіх файлів — інакше гейт валитиме код, який правилу відповідає.
//
// Marker formats accepted:
//   TS/TSX (JSDoc):
//     /** @status Active */     → single-line
//     * @status Deprecated      → multi-line JSDoc body
//     * Status: Active          → legacy inline comment
//     * Last validated: YYYY-MM-DD
//   Markdown (handled by check-freshness.mjs --check-coverage):
//     > **Last validated:** YYYY-MM-DD ...
//     > **Status:** Active
//
// Usage:
//   node scripts/docs/check-lifecycle-markers.mjs              # report-only
//   node scripts/docs/check-lifecycle-markers.mjs --fail-on-violations  # CI gate
//   node scripts/docs/check-lifecycle-markers.mjs --json       # machine-readable
//
// Канон правила: docs/governance/governance/rules/10-lifecycle-markers.md.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const FAIL_ON_VIOLATIONS = process.argv.includes("--fail-on-violations");
const JSON_OUTPUT = process.argv.includes("--json");

// Regexes that indicate a lifecycle marker is present.
const MARKER_PATTERNS = [
  // JSDoc @status tag: /** @status Active */ or * @status Deprecated
  /@status\s+\S+/,
  // Legacy inline: * Status: Active  or  // Status: Active
  /\*\s+Status:\s+\S+|\/\/\s+Status:\s+\S+/,
  // Last validated in JSDoc/comment: * Last validated: YYYY-MM-DD
  /Last (?:validated|touched):\s+\d{4}-\d{2}-\d{2}/,
  // Markdown-style inside TS file (rare but valid):
  /\*\*Last (?:validated|touched):\*\*/,
  /\*\*Status:\*\*/,
];

const SCAN_ROOT = join(REPO_ROOT, "apps/web/src");

// Directories/patterns to skip.
const SKIP_PATTERNS = [
  "__tests__",
  ".test.",
  ".spec.",
  ".stories.",
  "generated",
  "assets/illustrations",
  "i18n",
];

function shouldSkip(filePath) {
  const rel = filePath.replace(/\\/g, "/");
  return SKIP_PATTERNS.some((p) => rel.includes(p));
}

function hasLifecycleMarker(content) {
  // Only scan the first 20 lines (file header area).
  const header = content.split("\n").slice(0, 20).join("\n");
  return MARKER_PATTERNS.some((re) => re.test(header));
}

function walkDir(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, results);
    } else if (st.isFile()) {
      const ext = extname(entry);
      if (ext === ".ts" || ext === ".tsx") {
        results.push(full);
      }
    }
  }
  return results;
}

const allFiles = walkDir(SCAN_ROOT);
const violations = [];

for (const file of allFiles) {
  if (shouldSkip(file)) continue;
  const content = readFileSync(file, "utf8");
  if (!hasLifecycleMarker(content)) {
    violations.push(relative(REPO_ROOT, file).replace(/\\/g, "/"));
  }
}

const total = allFiles.filter((f) => !shouldSkip(f)).length;
const violationCount = violations.length;
const coveragePercent =
  total > 0 ? (((total - violationCount) / total) * 100).toFixed(1) : "100.0";

if (JSON_OUTPUT) {
  process.stdout.write(
    JSON.stringify(
      {
        total,
        violations: violationCount,
        coverage: `${coveragePercent}%`,
        files: violations,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  process.stdout.write(
    `\nLifecycle marker coverage (Hard Rule #10 — apps/web/src/**/*.{ts,tsx})\n`,
  );
  process.stdout.write(`  Total files scanned : ${total}\n`);
  process.stdout.write(`  Files with markers  : ${total - violationCount}\n`);
  process.stdout.write(`  Без явного маркера  : ${violationCount}\n`);
  process.stdout.write(`  Покриття маркерами  : ${coveragePercent}%\n`);
  if (violationCount > 0) {
    process.stdout.write(
      `\n  Це СПОСТЕРЕЖЕННЯ, не список порушень. Правило #10 каже: файл без\n` +
        `  маркера вважається Active — тобто це дозволений стан. Маркер\n` +
        `  обов'язковий лише для НЕ-Active статусів (@scaffolded /\n` +
        `  @experimental / @deprecated), бо саме вони міняють поведінку knip.\n` +
        `  Канон: docs/governance/governance/rules/10-lifecycle-markers.md.\n\n`,
    );
  } else {
    process.stdout.write(`  Усі файли мають явний маркер.\n\n`);
  }
}

if (FAIL_ON_VIOLATIONS && violationCount > 0) {
  process.stderr.write(
    `\ncheck-lifecycle-markers: ${violationCount} файл(ів) без явного маркера.\n` +
      `УВАГА: правило #10 такого не вимагає (без маркера = Active). Вмикати\n` +
      `--fail-on-violations можна лише після того, як правило змінять.\n`,
  );
  process.exit(1);
}

// Вихід 0 завжди: число інформаційне, порушенням правила воно не є.
process.exit(0);
