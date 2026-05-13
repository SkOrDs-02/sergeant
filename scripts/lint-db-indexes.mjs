#!/usr/bin/env node
// scripts/lint-db-indexes.mjs
//
// Heuristic static linter — сканує **нові** `*.up.sql` migrations (PR
// touches `apps/server/src/migrations/**`) і попереджає про FK / lookup
// columns, які НЕ покриті індексом ні всередині самої migration, ні
// через `PRIMARY KEY` / `UNIQUE` constraint.
//
// **Це WARN-only лінтер у звичайному режимі**: heuristic не може на 100%
// довести «треба index» (column може бути used лише як FK для cascading
// deletes без lookup load), тому fail-stop стає `lint:db-indexes:strict`
// для майбутнього opt-in (наступний крок after baseline review).
//
// Що вважається "covered":
//
//   1. Column є PK (`column_name TYPE PRIMARY KEY ...`) або частина
//      composite PK.
//   2. Column є частиною UNIQUE constraint (inline `UNIQUE` або
//      `UNIQUE (...)` clause).
//   3. У тому самому файлі є `CREATE INDEX ... ON <table> (<column>...)`
//      де column — перший у списку. (Postgres-планер використовує
//      leading-column для lookup-ів.)
//   4. У тому самому файлі є `CREATE UNIQUE INDEX ... ON <table>
//      (<column>...)` зі column першим.
//
// Що вважається "FK / lookup column":
//
//   - `... REFERENCES <other_table>(<col>) ...` — FK по визначенню.
//   - Column-name матчиться `*_id` (e.g. `user_id`, `mono_account_id`,
//      `workflow_id`) і у тій самій таблиці є вже інший рядок з FK на
//      `_id` — heuristic «логічний FK without enforcement».
//
// Не зачіпаються:
//
//   - `*.down.sql` (rollback-files — там DROP-only allowed).
//   - Pre-existing migrations не у diff PR-а. CLI без `--baseline-only`
//      сканує тільки `git diff --name-only --merge-base origin/main HEAD
//      -- 'apps/server/src/migrations/*.sql'`. У standalone-режимі без
//      git, falls back на ALL migrations і друкує summary.
//
// Usage:
//   node scripts/lint-db-indexes.mjs                  # diff-mode
//   node scripts/lint-db-indexes.mjs --all            # all migrations
//   node scripts/lint-db-indexes.mjs --strict         # fail on warnings
//
// Runbook: `docs/runbooks/operations-runbook.md § 9` (index hygiene).

import { execSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "apps", "server", "src", "migrations");

const UP_MIGRATION_RE = /^(\d{3})_.+\.sql$/;
const DOWN_FILE_RE = /\.down\.sql$/;

// --- Parsing helpers --------------------------------------------------------

/**
 * Strip block comments and line comments without confusing identifier
 * parsing. Не повноцінний SQL parser — досить для column-extraction.
 */
export function stripSqlComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Find `CREATE TABLE [IF NOT EXISTS] <name> ( ... )` blocks. Returns an
 * array of `{ tableName, body }` where `body` is the comma-separated
 * column / constraint list between matched parens.
 */
export function parseCreateTableBlocks(content) {
  const stripped = stripSqlComments(content);
  const re =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[a-z_][a-z0-9_]*"?)\s*\(/gi;
  const blocks = [];
  let match;
  while ((match = re.exec(stripped)) !== null) {
    const tableName = match[1].replace(/"/g, "");
    const startIdx = re.lastIndex;
    let depth = 1;
    let i = startIdx;
    while (i < stripped.length && depth > 0) {
      const ch = stripped[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      i += 1;
    }
    if (depth === 0) {
      blocks.push({
        tableName,
        body: stripped.slice(startIdx, i - 1),
      });
    }
  }
  return blocks;
}

/**
 * Split a CREATE TABLE body by top-level commas (ignoring commas inside
 * nested parens, e.g. `CHECK (col IN ('a','b'))`).
 */
export function splitTopLevelCommas(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail.length) parts.push(tail);
  return parts;
}

/**
 * Extract columns from a `CREATE TABLE` block, separating column definitions
 * from table-level constraints (PRIMARY KEY (...), UNIQUE (...), etc).
 */
export function parseColumnsAndConstraints(body) {
  const parts = splitTopLevelCommas(body);
  const columns = [];
  const constraints = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const constraintKeyword = lower.match(
      /^(constraint\s+\S+\s+)?(primary\s+key|unique|foreign\s+key|check|exclude)\b/,
    );
    if (constraintKeyword) {
      constraints.push(part);
      continue;
    }
    const nameMatch = part.match(/^("?[a-z_][a-z0-9_]*"?)\s+(.+)$/i);
    if (!nameMatch) continue;
    const colName = nameMatch[1].replace(/"/g, "");
    const def = nameMatch[2];
    columns.push({ name: colName, def });
  }
  return { columns, constraints };
}

function leadingColumnFromList(list) {
  const cleaned = list
    .replace(/[()]/g, "")
    .split(",")
    .map((s) => s.trim().replace(/"/g, "").split(/\s+/)[0])
    .filter(Boolean);
  return cleaned[0] ?? null;
}

/**
 * Parse table-level constraints to determine which columns are PK / UNIQUE
 * (leading-column basis).
 */
export function extractConstraintColumns(constraints) {
  const result = {
    primaryKeyLeading: new Set(),
    uniqueLeading: new Set(),
  };
  for (const c of constraints) {
    const lower = c.toLowerCase();
    const pkMatch = lower.match(/primary\s+key\s*\(([^)]*)\)/);
    if (pkMatch) {
      const col = leadingColumnFromList(pkMatch[1]);
      if (col) result.primaryKeyLeading.add(col);
      continue;
    }
    const uqMatch = lower.match(/unique\s*\(([^)]*)\)/);
    if (uqMatch) {
      const col = leadingColumnFromList(uqMatch[1]);
      if (col) result.uniqueLeading.add(col);
    }
  }
  return result;
}

/**
 * Find `CREATE [UNIQUE] INDEX ... ON <table> (<col1>, <col2>, ...)`
 * occurrences in the file. Returns leading-column per index.
 */
export function findIndexLeadingColumns(content) {
  const stripped = stripSqlComments(content);
  const re =
    /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[^\s(]+\s+on\s+(?:only\s+)?("?[a-z_][a-z0-9_]*"?)\s*(?:using\s+\S+\s*)?\(([^)]+)\)/gi;
  const out = [];
  let match;
  while ((match = re.exec(stripped)) !== null) {
    const tableName = match[2].replace(/"/g, "");
    const colList = match[3];
    const leading = leadingColumnFromList(colList);
    if (leading) {
      out.push({ tableName, leadingColumn: leading });
    }
  }
  return out;
}

/**
 * Decide whether a column is "covered" by either an inline `PRIMARY KEY`
 * / `UNIQUE` modifier in its column-definition, by a table-level
 * constraint, or by a `CREATE INDEX` leading-column.
 */
export function isColumnCovered(col, ctx) {
  const def = col.def.toLowerCase();
  if (/\bprimary\s+key\b/.test(def)) return true;
  if (/\bunique\b/.test(def)) return true;
  if (ctx.constraintLeading.primaryKeyLeading.has(col.name)) return true;
  if (ctx.constraintLeading.uniqueLeading.has(col.name)) return true;
  for (const idx of ctx.indexes) {
    if (idx.tableName === ctx.tableName && idx.leadingColumn === col.name) {
      return true;
    }
  }
  return false;
}

/**
 * Find columns that look like a lookup target (FK or `*_id` heuristic)
 * but aren't covered by any index.
 *
 * Returns an array of `{ file, table, column, reason }` warnings.
 */
export function analyzeMigration({ file, content }) {
  const warnings = [];
  const blocks = parseCreateTableBlocks(content);
  const indexes = findIndexLeadingColumns(content);

  for (const block of blocks) {
    const { columns, constraints } = parseColumnsAndConstraints(block.body);
    const constraintLeading = extractConstraintColumns(constraints);

    const ctx = {
      tableName: block.tableName,
      constraintLeading,
      indexes,
    };

    for (const col of columns) {
      const defLower = col.def.toLowerCase();
      const hasReferences = /\breferences\s+\S+/.test(defLower);
      const looksLikeIdLookup =
        /_id$/.test(col.name) && col.name !== "id" && col.name !== "uuid";

      if (!hasReferences && !looksLikeIdLookup) continue;

      if (isColumnCovered(col, ctx)) continue;

      const reason = hasReferences
        ? "FK column has no covering index"
        : "lookup-style `*_id` column has no covering index";

      warnings.push({
        file,
        table: block.tableName,
        column: col.name,
        reason,
      });
    }
  }
  return warnings;
}

// --- Driver -----------------------------------------------------------------

async function listAllUpMigrations() {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => UP_MIGRATION_RE.test(f) && !DOWN_FILE_RE.test(f))
    .sort();
}

function listChangedUpMigrations() {
  try {
    const out = execSync(
      "git diff --name-only --merge-base origin/main HEAD -- 'apps/server/src/migrations/*.sql'",
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length && UP_MIGRATION_RE.test(s.split("/").pop() ?? ""))
      .filter((s) => !DOWN_FILE_RE.test(s))
      .map((s) => s.split("/").pop());
  } catch {
    return null;
  }
}

export async function run({
  argv = [],
  log = console.log,
  errLog = console.error,
} = {}) {
  const all = argv.includes("--all");
  const strict = argv.includes("--strict");

  let targets;
  if (all) {
    targets = await listAllUpMigrations();
  } else {
    const changed = listChangedUpMigrations();
    if (changed && changed.length > 0) {
      targets = changed;
    } else {
      log("ℹ️ lint:db-indexes — no changed migrations in diff; skipping.");
      log(
        "   Run with --all to audit every migration on the branch (baseline).",
      );
      return 0;
    }
  }

  const warnings = [];
  for (const file of targets) {
    let content;
    try {
      content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    } catch (err) {
      errLog(`❌ Could not read ${file}: ${err.message ?? err}`);
      return 2;
    }
    warnings.push(...analyzeMigration({ file, content }));
  }

  if (warnings.length === 0) {
    log(
      `✅ lint:db-indexes — no uncovered FK / lookup columns in ${targets.length} migration(s).`,
    );
    return 0;
  }

  log("⚠️  lint:db-indexes — uncovered FK / lookup columns:");
  log("");
  for (const w of warnings) {
    log(`  ${w.file}: \`${w.table}.${w.column}\` — ${w.reason}`);
  }
  log("");
  log(
    "Hard Rule #4 не зачіпається — це index hygiene, не numbering. " +
      "Розв'язки:",
  );
  log(
    "  1. Якщо column дійсно треба index — додай `CREATE INDEX …` у тій самій migration.",
  );
  log("  2. Якщо FK тільки для cascading-delete без lookup — додай коментар:");
  log(
    "       -- INDEX_NOT_NEEDED: <reason>  (e.g. cascade-only, no point-lookup queries)",
  );
  log(
    "     над column-line (NOT IMPLEMENTED YET — TODO marker for next iteration).",
  );
  log("  3. Runbook: docs/runbooks/operations-runbook.md § 9 (index hygiene).");

  return strict ? 1 : 0;
}

const isDirectInvocation = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  run({ argv: process.argv.slice(2) }).then((code) => process.exit(code));
}
