#!/usr/bin/env node
// scripts/check-schema-drift.mjs
//
// Drizzle schema ↔ SQL migration drift detector (PR-11 / stack-pulse H5).
//
// The Drizzle schema in packages/db-schema/src/pg/ is a typed representation
// of a *subset* of tables — the ones the app reads/writes via Drizzle ORM.
// Many SQL tables (analytics, observability, server-only) are intentionally
// NOT modelled in Drizzle. That is fine and expected.
//
// What this script checks (for tables that Drizzle has modelled):
//   1. Every Drizzle table must have a CREATE TABLE in SQL migrations.
//   2. Every column in Drizzle (using its explicit SQL name) must be in SQL.
//   3. Every SQL column (for Drizzle-tracked tables) must be in Drizzle.
//   Tables that exist only in SQL are not flagged (intentional omissions).
//
// Whitelist: covers intentional divergences — see WHITELIST array below.
//
// CLI:
//   node scripts/check-schema-drift.mjs           # report + exit code
//   node scripts/check-schema-drift.mjs --json    # machine-readable JSON

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSON_MODE = process.argv.includes("--json");

// ─── Whitelist ────────────────────────────────────────────────────────────────
// { table, column?, reason }  — omit `column` to whitelist the whole table.
const WHITELIST = [
  // Better Auth tables: library manages its own columns.
  // Drizzle models only the fields that app code queries directly.
  {
    table: "session",
    column: "token",
    reason: "Better Auth adds token; Drizzle model omits it",
  },
  {
    table: "session",
    column: "createdat",
    reason: "Better Auth camelCase column variant not in Drizzle",
  },
  {
    table: "verification",
    column: "createdat",
    reason: "Better Auth camelCase column variant not in Drizzle",
  },
  // Auth table columns stored as quoted camelCase in SQL (legacy migration style).
  {
    table: "account",
    column: "accesstoken",
    reason: "SQL uses quoted camelCase; Drizzle models it as accessToken",
  },
  {
    table: "account",
    column: "refreshtoken",
    reason: "SQL uses quoted camelCase; Drizzle models it as refreshToken",
  },
  {
    table: "account",
    column: "idtoken",
    reason: "SQL uses quoted camelCase; Drizzle models it as idToken",
  },
  {
    table: "account",
    column: "accesstokenexpiresat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "account",
    column: "refreshtokenexpiresat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "account",
    column: "scope",
    reason: "Better Auth column not queried via Drizzle",
  },
  {
    table: "account",
    column: "password",
    reason: "Better Auth column not queried via Drizzle",
  },
  {
    table: "account",
    column: "createdat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "account",
    column: "updatedat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "account",
    column: "accountid",
    reason: "SQL uses quoted camelCase; Drizzle models as accountId",
  },
  {
    table: "account",
    column: "providerid",
    reason: "SQL uses quoted camelCase; Drizzle models as providerId",
  },
  {
    table: "account",
    column: "userid",
    reason: "SQL uses quoted camelCase; Drizzle models as userId",
  },
  {
    table: "user",
    column: "emailverified",
    reason:
      "SQL uses quoted camelCase `emailVerified`; Drizzle JS key lowercases it",
  },
  {
    table: "user",
    column: "createdat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "user",
    column: "updatedat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "session",
    column: "expiresat",
    reason: "SQL uses quoted camelCase; Drizzle JS key lowercases it",
  },
  {
    table: "session",
    column: "updatedat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "session",
    column: "ipaddress",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "session",
    column: "useragent",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "session",
    column: "userid",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "verification",
    column: "expiresat",
    reason: "SQL uses quoted camelCase",
  },
  {
    table: "verification",
    column: "updatedat",
    reason: "SQL uses quoted camelCase",
  },
  // coach_memory: server-managed columns not queried via Drizzle
  {
    table: "coach_memory",
    column: "version",
    reason: "Optimistic-lock column; not in Drizzle model",
  },
  {
    table: "coach_memory",
    column: "client_updated_at",
    reason: "CloudSync column; not in Drizzle model for this path",
  },
  // push_subscriptions: soft-delete column not in Drizzle model
  {
    table: "push_subscriptions",
    column: "deleted_at",
    reason: "Soft-delete column managed by server; not queried via Drizzle",
  },
  // sync_audit_log: soft-delete column not in Drizzle model
  {
    table: "sync_audit_log",
    column: "deleted_at",
    reason: "Soft-delete column managed by server; not in Drizzle model",
  },
];

// ─── SQL parser: depth-tracking for CREATE TABLE ──────────────────────────────

function normId(raw) {
  return raw.replace(/^["'`]|["'`]$/g, "").toLowerCase();
}

// Skip keywords that appear in constraint lines (not column names)
const CONSTRAINT_KEYWORDS = new Set([
  "primary",
  "unique",
  "foreign",
  "check",
  "constraint",
  "index",
  // Multi-line clauses that get parsed as separate lines
  "on",
  "references",
  "not",
  "default",
  "with",
]);

/**
 * Extract CREATE TABLE bodies from SQL using depth-tracking to handle
 * nested parentheses (e.g., REFERENCES "user"(id), PRIMARY KEY (...)).
 * Returns [ { tableName, body } ]
 */
function extractSqlTableBodies(content) {
  const results = [];
  // Match `CREATE TABLE [IF NOT EXISTS] name (` and find the body
  const headerRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?\w+[`"']?)\s*\(/gi;
  for (const hm of content.matchAll(headerRe)) {
    const tableName = normId(hm[1]);
    let start = hm.index + hm[0].length;
    let depth = 1;
    let i = start;
    while (i < content.length && depth > 0) {
      if (content[i] === "(") depth++;
      else if (content[i] === ")") depth--;
      i++;
    }
    results.push({ tableName, body: content.slice(start, i - 1) });
  }
  return results;
}

/**
 * Parse SQL file → Map<tableName, Set<columnName>>
 */
function parseSqlFile(content) {
  const tables = new Map();

  // Strip comments
  const stripped = content
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  // CREATE TABLE with depth-tracking body extraction
  for (const { tableName, body } of extractSqlTableBodies(stripped)) {
    if (!tables.has(tableName)) tables.set(tableName, new Set());
    // Each column definition is a line starting with an identifier followed
    // by a type keyword. Skip constraint lines.
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("--")) continue;
      // Capture: identifier whitespace type
      const m = trimmed.match(/^([`"']?\w+[`"']?)\s+(\w+)/);
      if (!m) continue;
      const firstWord = m[1].replace(/^["'`]|["'`]$/g, "").toLowerCase();
      if (CONSTRAINT_KEYWORDS.has(firstWord)) continue;
      tables.get(tableName).add(firstWord);
    }
  }

  // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] col type
  const addColRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"']?\w+[`"']?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?\w+[`"']?)/gi;
  for (const m of stripped.matchAll(addColRe)) {
    const tbl = normId(m[1]);
    if (!tables.has(tbl)) tables.set(tbl, new Set());
    tables.get(tbl).add(normId(m[2]));
  }

  // ALTER TABLE ... DROP COLUMN [IF EXISTS] col
  const dropColRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"']?\w+[`"']?)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([`"']?\w+[`"']?)/gi;
  for (const m of stripped.matchAll(dropColRe)) {
    const tbl = normId(m[1]);
    const col = normId(m[2]);
    if (tables.has(tbl)) tables.get(tbl).delete(col);
  }

  // ALTER TABLE ... RENAME COLUMN old TO new
  const renameColRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"']?\w+[`"']?)\s+RENAME\s+COLUMN\s+([`"']?\w+[`"']?)\s+TO\s+([`"']?\w+[`"']?)/gi;
  for (const m of stripped.matchAll(renameColRe)) {
    const tbl = normId(m[1]);
    if (tables.has(tbl)) {
      tables.get(tbl).delete(normId(m[2]));
      tables.get(tbl).add(normId(m[3]));
    }
  }

  return tables;
}

function parseSqlMigrations(dir) {
  const merged = new Map();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf8");
    for (const [tbl, cols] of parseSqlFile(content)) {
      if (!merged.has(tbl)) merged.set(tbl, new Set());
      for (const c of cols) merged.get(tbl).add(c);
    }
  }
  return merged;
}

// ─── Drizzle TS parser: depth-tracking for pgTable bodies ────────────────────

/**
 * Extract pgTable column-object bodies using brace depth-tracking.
 * Returns [ { tableName, body } ]
 */
function extractPgTableBodies(content) {
  const results = [];
  const headerRe = /pgTable\(\s*['"`](\w+)['"`]\s*,\s*\{/g;
  for (const hm of content.matchAll(headerRe)) {
    const tableName = hm[1].toLowerCase();
    let start = hm.index + hm[0].length;
    let depth = 1;
    let i = start;
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") depth--;
      i++;
    }
    results.push({ tableName, body: content.slice(start, i - 1) });
  }
  return results;
}

/**
 * Parse Drizzle TS file → Map<tableName, Set<sqlColumnName>>
 *
 * Drizzle column definitions:
 *   colKey: type("sql_col_name", opts)  →  SQL name = "sql_col_name"
 *   colKey: type(opts)                  →  SQL name = colKey (lowercased)
 *   colKey: type()                      →  SQL name = colKey (lowercased)
 */
function parseDrizzleFile(content) {
  const tables = new Map();
  for (const { tableName, body } of extractPgTableBodies(content)) {
    if (!tables.has(tableName)) tables.set(tableName, new Set());
    // Match: colKey: typeName( optionally "sql_col_name"
    const colRe = /^\s*(\w+)\s*:\s*\w+\(\s*(?:['"`](\w+)['"`])?/gm;
    for (const cm of body.matchAll(colRe)) {
      const jsKey = cm[1];
      if (
        ["primaryKey", "index", "uniqueIndex", "foreignKey", "check"].includes(
          jsKey,
        )
      )
        continue;
      const sqlCol = cm[2] ? cm[2].toLowerCase() : jsKey.toLowerCase();
      tables.get(tableName).add(sqlCol);
    }
  }
  return tables;
}

function parseDrizzleSchemas(dir) {
  const merged = new Map();
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  } catch {
    return merged;
  }
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf8");
    for (const [tbl, cols] of parseDrizzleFile(content)) {
      if (!merged.has(tbl)) merged.set(tbl, new Set());
      for (const c of cols) merged.get(tbl).add(c);
    }
  }
  return merged;
}

// ─── Whitelist lookup ─────────────────────────────────────────────────────────

function isWhitelisted(table, column) {
  return WHITELIST.some(
    (e) => e.table === table && (e.column === undefined || e.column === column),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SQL_DIR = resolve(ROOT, "apps/server/src/migrations");
const DRIZZLE_DIR = resolve(ROOT, "packages/db-schema/src/pg");

const sqlSchema = parseSqlMigrations(SQL_DIR);
const drizzleSchema = parseDrizzleSchemas(DRIZZLE_DIR);

const issues = [];

for (const [tbl, drizzleCols] of drizzleSchema) {
  if (isWhitelisted(tbl)) continue;

  if (!sqlSchema.has(tbl)) {
    issues.push({
      kind: "table-drizzle-only",
      table: tbl,
      message: `Table "${tbl}" defined in Drizzle schema but has no CREATE TABLE in SQL migrations`,
    });
    continue;
  }

  const sqlCols = sqlSchema.get(tbl);

  for (const col of drizzleCols) {
    if (isWhitelisted(tbl, col)) continue;
    if (!sqlCols.has(col)) {
      issues.push({
        kind: "col-drizzle-only",
        table: tbl,
        column: col,
        message: `Column "${tbl}.${col}" is in Drizzle schema but not in SQL migrations`,
      });
    }
  }

  for (const col of sqlCols) {
    if (isWhitelisted(tbl, col)) continue;
    if (!drizzleCols.has(col)) {
      issues.push({
        kind: "col-sql-only",
        table: tbl,
        column: col,
        message: `Column "${tbl}.${col}" is in SQL migrations but not in Drizzle schema`,
      });
    }
  }
}

if (JSON_MODE) {
  process.stdout.write(
    JSON.stringify({ ok: issues.length === 0, issues }, null, 2) + "\n",
  );
} else {
  if (issues.length === 0) {
    console.log("✓ Drizzle schema ↔ SQL migrations: no drift detected");
  } else {
    console.error(`✗ Schema drift — ${issues.length} issue(s):\n`);
    for (const iss of issues) {
      console.error(`  [${iss.kind}] ${iss.message}`);
    }
    console.error(
      "\nFix: after adding a SQL migration, update packages/db-schema/src/pg/*.ts\n" +
        "     to mirror the same tables/columns. See docs/playbooks/add-sql-migration.md\n" +
        "Whitelist: add an entry to WHITELIST in scripts/check-schema-drift.mjs " +
        "for intentional divergences.",
    );
  }
}

process.exit(issues.length > 0 ? 1 : 0);
