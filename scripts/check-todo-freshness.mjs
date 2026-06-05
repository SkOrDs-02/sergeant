#!/usr/bin/env node

/**
 * TODO Freshness Gate
 *
 * Перевіряє, що всі TODO/FIXME/HACK/XXX коментарі мають дедлайн у форматі
 * TODO(NNNN-…): YYYY-MM-DD і що дедлайн ще не минув.
 *
 * Формат:
 *   TODO(T5-auth-refactor): 2026-07-15 — опис задачі
 *   FIXME(#123): 2026-06-30 — тимчасовий workaround
 *
 * Exit codes:
 *   0 — всі TODO свіжі (дедлайн не минув)
 *   1 — знайдено прострочені TODO або TODO без дедлайну
 *
 * Usage:
 *   node scripts/check-todo-freshness.mjs
 *   node scripts/check-todo-freshness.mjs --fix  (поки що не реалізовано)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// Патерн для TODO з дедлайном: TODO(…): YYYY-MM-DD
const TODO_WITH_DEADLINE =
  /(?:TODO|FIXME|HACK|XXX)\([^)]+\):\s*(\d{4}-\d{2}-\d{2})/;

// Патерн для TODO без дедлайну (просто TODO або TODO: опис)
const TODO_WITHOUT_DEADLINE =
  /(?:TODO|FIXME|HACK|XXX)(?:\s*:|\s+(?!\())(?![^)]+\):\s*\d{4}-\d{2}-\d{2})/;

// Директорії та файли для виключення
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  "dist-server",
  "build",
  "coverage",
  ".next",
  ".vercel",
  ".cache",
  "patches",
  "mockups",
]);

const IGNORE_FILES = new Set([
  "check-todo-freshness.mjs", // цей скрипт
  "eslint.baseline.js", // baseline violations не потребують дедлайнів
  "knip.json", // конфігурація
  "CHANGELOG.md", // історія релізів
]);

const IGNORE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
]);

/**
 * Рекурсивно обходить директорії та повертає список файлів для перевірки.
 */
function walkDir(dir, baseDir = dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...walkDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      // Пропускаємо ігноровані файли
      if (IGNORE_FILES.has(entry.name)) continue;

      // Пропускаємо бінарні файли
      const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
      if (IGNORE_EXTENSIONS.has(ext)) continue;

      // Перевіряємо тільки текстові файли (TS, TSX, JS, JSX, MD, MJS, CJS)
      if (
        /\.(ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml|css|scss|html)$/.test(
          entry.name,
        )
      ) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Перевіряє один файл на наявність TODO з простроченими дедлайнами.
 */
function checkFile(filePath) {
  const issues = [];
  let content;

  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    // Файл може бути бінарним або недоступним
    return issues;
  }

  const lines = content.split("\n");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Перевіряємо TODO з дедлайном
    const deadlineMatch = line.match(TODO_WITH_DEADLINE);
    if (deadlineMatch) {
      const deadlineStr = deadlineMatch[1];
      const deadline = new Date(deadlineStr + "T00:00:00");

      if (deadline < today) {
        issues.push({
          file: relative(ROOT, filePath),
          line: lineNum,
          type: "expired",
          deadline: deadlineStr,
          content: line.trim(),
        });
      }
      continue;
    }

    // Перевіряємо TODO без дедлайну (тільки в коді, не в docs)
    const noDeadlineMatch = line.match(TODO_WITHOUT_DEADLINE);
    if (noDeadlineMatch && !filePath.endsWith(".md")) {
      // Пропускаємо TODO в коментарях до коду, які є частиною документації
      // або пояснень (наприклад, "// TODO: це буде рефакторитись")
      // Але вимагаємо дедлайн для TODO, які є технічним боргом
      if (
        /(?:TODO|FIXME|HACK|XXX)\s*:\s*(?:refactor|remove|delete|cleanup|tech-debt|temporary|workaround)/i.test(
          line,
        )
      ) {
        issues.push({
          file: relative(ROOT, filePath),
          line: lineNum,
          type: "missing-deadline",
          content: line.trim(),
        });
      }
    }
  }

  return issues;
}

/**
 * Головна функція.
 */
function main() {
  console.log("🔍 Checking TODO freshness…\n");

  const files = walkDir(ROOT);
  console.log(`Scanning ${files.length} files…\n`);

  const allIssues = [];

  for (const file of files) {
    const issues = checkFile(file);
    allIssues.push(...issues);
  }

  if (allIssues.length === 0) {
    console.log("✅ All TODOs are fresh (no expired deadlines found).\n");
    process.exit(0);
  }

  // Групуємо issues за типом
  const expired = allIssues.filter((i) => i.type === "expired");
  const missingDeadline = allIssues.filter(
    (i) => i.type === "missing-deadline",
  );

  console.log(`❌ Found ${allIssues.length} TODO issue(s):\n`);

  if (expired.length > 0) {
    console.log(`📅 Expired deadlines (${expired.length}):\n`);
    for (const issue of expired) {
      console.log(`  ${issue.file}:${issue.line}`);
      console.log(`    Deadline: ${issue.deadline}`);
      console.log(`    ${issue.content}\n`);
    }
  }

  if (missingDeadline.length > 0) {
    console.log(
      `⚠️  TODOs without deadline (${missingDeadline.length}) — add deadline in format TODO(…): YYYY-MM-DD:\n`,
    );
    for (const issue of missingDeadline) {
      console.log(`  ${issue.file}:${issue.line}`);
      console.log(`    ${issue.content}\n`);
    }
  }

  console.log(
    "\n💡 Fix: update the deadline or remove the TODO if the work is done.",
  );
  console.log(
    "   Format: TODO(T5-feature-name): 2026-07-15 — description of work\n",
  );

  process.exit(1);
}

main();
