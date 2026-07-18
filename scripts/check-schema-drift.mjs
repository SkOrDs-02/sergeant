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
//   4. Every SQL table that Drizzle does NOT model must be explicitly listed
//      in SQL_ONLY_TABLES (or whitelisted) — інакше нова SQL-only таблиця
//      пройшла б повз drift-чекер (сліпа зона). DROP/RENAME TABLE у міграціях
//      враховуються (напр. 046 дропнув module_data, 042 перейменувала
//      module_data_partitioned → module_data), тож видалені таблиці не рахуються.
//
// Whitelist: covers intentional divergences — see WHITELIST array below.
// SQL_ONLY_TABLES: server-only таблиці без Drizzle-моделі (analytics, billing,
// integration-стейт тощо) — див. масив нижче.
//
// CLI:
//   node scripts/check-schema-drift.mjs                 # report + exit code
//   node scripts/check-schema-drift.mjs --json          # machine-readable JSON
//   node scripts/check-schema-drift.mjs --list-sql-only # dump SQL-only tables
//                                                       #   (для аудиту allowlist-у)

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

// Прибирає `-- …` та `/* … */` коментарі, щоб DDL у коментарях (напр.
// приклади `DROP TABLE …` у шапці міграції) не парсились як реальні statement-и.
// Обмеження (свідоме): regex не знає про string-літерали — `--` усередині
// `DEFAULT 'foo--bar'` обріже хвіст рядка. Для drift-tooling це прийнятно:
// у наших міграціях таких літералів нема; якщо з'являться — перейти на
// quote-aware сканер.
function stripSqlComments(content) {
  return content.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Parse SQL file → Map<tableName, Set<columnName>>
 */
function parseSqlFile(content) {
  const tables = new Map();

  // Strip comments
  const stripped = stripSqlComments(content);

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

/**
 * Extract `ALTER TABLE x RENAME TO y` statements, in textual order.
 * Returns [ { from, to } ].  Used to follow table renames across migrations
 * (напр. 042 робить `module_data → module_data_legacy` + `module_data_partitioned
 * → module_data`), інакше стара назва лишалась би «SQL-only» привидом.
 */
function extractTableRenames(stripped) {
  const renames = [];
  const re =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([`"']?\w+[`"']?)\s+RENAME\s+TO\s+([`"']?\w+[`"']?)/gi;
  for (const m of stripped.matchAll(re)) {
    renames.push({ from: normId(m[1]), to: normId(m[2]) });
  }
  return renames;
}

/**
 * Extract `DROP TABLE [IF EXISTS] name [CASCADE]` statements, in textual order.
 * Returns [ tableName ].  Дозволяє «забути» таблиці, видалені міграціями
 * (напр. 046 дропає `module_data` та `module_data_legacy`), щоб вони не
 * рахувались як існуючі SQL-таблиці.
 */
function extractDroppedTables(stripped) {
  const dropped = [];
  const re = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"']?\w+[`"']?)/gi;
  for (const m of stripped.matchAll(re)) {
    dropped.push(normId(m[1]));
  }
  return dropped;
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
    // Post-CREATE: apply table renames and drops in the file's textual order
    // so the merged view tracks the *current* set of live SQL tables.
    const stripped = stripSqlComments(content);
    for (const { from, to } of extractTableRenames(stripped)) {
      if (!merged.has(from)) continue;
      const cols = merged.get(from);
      const target = merged.get(to) ?? new Set();
      for (const c of cols) target.add(c);
      merged.set(to, target);
      merged.delete(from);
    }
    for (const tbl of extractDroppedTables(stripped)) {
      merged.delete(tbl);
    }
  }
  return merged;
}

// ─── Drizzle TS parser: depth-tracking for pgTable / sqliteTable bodies ──────

/**
 * Generic depth-tracking extractor for `fnName('tableName', { ... })` patterns.
 * Used for both pgTable and sqliteTable bodies.
 */
function extractDrizzleTableBodies(content, fnName) {
  const results = [];
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(
    `${escaped}\\(\\s*['"\`](\\w+)['"\`]\\s*,\\s*\\{`,
    "g",
  );
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
 * Extract pgTable column-object bodies using brace depth-tracking.
 * Returns [ { tableName, body } ]
 */
function extractPgTableBodies(content) {
  return extractDrizzleTableBodies(content, "pgTable");
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

/**
 * Parse a Drizzle SQLite TS file → Map<tableName, Set<sqlColumnName>>
 * Same column-extraction logic as parseDrizzleFile, but targets sqliteTable.
 */
function parseSqliteDrizzleFile(content) {
  const tables = new Map();
  for (const { tableName, body } of extractDrizzleTableBodies(
    content,
    "sqliteTable",
  )) {
    if (!tables.has(tableName)) tables.set(tableName, new Set());
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

function parseSqliteDrizzleSchemas(dir) {
  const merged = new Map();
  let files;
  try {
    files = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.startsWith("index"),
    );
  } catch {
    return merged;
  }
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf8");
    for (const [tbl, cols] of parseSqliteDrizzleFile(content)) {
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

// ─── PG ↔ SQLite cross-whitelist ─────────────────────────────────────────────
//
// Known intentional column differences between the PG and SQLite Drizzle
// schemas for tables that appear in BOTH dialects.  Omit `column` to skip
// the entire table from the cross-check (e.g. tables only in one dialect
// are already skipped automatically because the check only runs on tables
// present in both schemas).
//
// Note: tables that exist ONLY in PG (auth, coach_memory, sync_op_log) or
// ONLY in SQLite (kv_store, sync_op_outbox*, finyk_mono_*) are fine — the
// cross-check only iterates tables present in BOTH schemas, so purely
// dialect-specific tables are never flagged here.
// Intentional JSONB→TEXT column-rename pattern:
// PG stores these as native JSONB with short SQL names (e.g. `excluded_stat_tx_ids`).
// SQLite stores the same value as a TEXT blob, with a `_json` suffix so readers know
// the value is a JSON string (e.g. `excluded_stat_tx_ids_json`).
// The cross-check sees these as two different columns because the SQL names differ.
// This is a documented design choice — sync ops know the name mapping; no sync bug.
// Review: whenever a new JSONB column lands in a PG schema that also has a SQLite
// mirror, ensure the SQLite counterpart uses the same `<name>_json` convention and
// add both sides here.
const PG_SQLITE_CROSS_WHITELIST = [
  // finyk_prefs — JSONB array columns renamed to *_json in SQLite
  {
    table: "finyk_prefs",
    column: "excluded_stat_tx_ids",
    reason: "PG JSONB name; SQLite counterpart is excluded_stat_tx_ids_json",
  },
  {
    table: "finyk_prefs",
    column: "excluded_stat_tx_ids_json",
    reason: "SQLite TEXT name; PG counterpart is excluded_stat_tx_ids (JSONB)",
  },
  {
    table: "finyk_prefs",
    column: "dismissed_recurring",
    reason: "PG JSONB name; SQLite counterpart is dismissed_recurring_json",
  },
  {
    table: "finyk_prefs",
    column: "dismissed_recurring_json",
    reason: "SQLite TEXT name; PG counterpart is dismissed_recurring (JSONB)",
  },
  // fizruk tables — `data` JSONB in PG → `data_json` TEXT in SQLite
  {
    table: "fizruk_monthly_plan",
    column: "data",
    reason: "PG JSONB name; SQLite counterpart is data_json",
  },
  {
    table: "fizruk_monthly_plan",
    column: "data_json",
    reason: "SQLite TEXT name; PG counterpart is data (JSONB)",
  },
  {
    table: "fizruk_plan_templates",
    column: "data",
    reason: "PG JSONB name; SQLite counterpart is data_json",
  },
  {
    table: "fizruk_plan_templates",
    column: "data_json",
    reason: "SQLite TEXT name; PG counterpart is data (JSONB)",
  },
  {
    table: "fizruk_workout_templates",
    column: "exercise_ids",
    reason: "PG JSONB/text[] name; SQLite counterpart is exercise_ids_json",
  },
  {
    table: "fizruk_workout_templates",
    column: "exercise_ids_json",
    reason: "SQLite TEXT name; PG counterpart is exercise_ids",
  },
  {
    table: "fizruk_workout_templates",
    column: "groups",
    reason: "PG JSONB name; SQLite counterpart is groups_json",
  },
  {
    table: "fizruk_workout_templates",
    column: "groups_json",
    reason: "SQLite TEXT name; PG counterpart is groups (JSONB)",
  },
  // nutrition_shopping_list — `data` JSONB in PG → `data_json` TEXT in SQLite
  {
    table: "nutrition_shopping_list",
    column: "data",
    reason: "PG JSONB name; SQLite counterpart is data_json",
  },
  {
    table: "nutrition_shopping_list",
    column: "data_json",
    reason: "SQLite TEXT name; PG counterpart is data (JSONB)",
  },
  // routine tables — JSONB array columns renamed to *_json in SQLite
  {
    table: "routine_habits",
    column: "tag_ids",
    reason: "PG JSONB/text[] name; SQLite counterpart is tag_ids_json",
  },
  {
    table: "routine_habits",
    column: "tag_ids_json",
    reason: "SQLite TEXT name; PG counterpart is tag_ids",
  },
  {
    table: "routine_habits",
    column: "reminder_times",
    reason: "PG JSONB/text[] name; SQLite counterpart is reminder_times_json",
  },
  {
    table: "routine_habits",
    column: "reminder_times_json",
    reason: "SQLite TEXT name; PG counterpart is reminder_times",
  },
  {
    table: "routine_habits",
    column: "weekdays",
    reason: "PG JSONB/integer[] name; SQLite counterpart is weekdays_json",
  },
  {
    table: "routine_habits",
    column: "weekdays_json",
    reason: "SQLite TEXT name; PG counterpart is weekdays",
  },
  {
    table: "routine_prefs",
    column: "data",
    reason: "PG JSONB name; SQLite counterpart is data_json",
  },
  {
    table: "routine_prefs",
    column: "data_json",
    reason: "SQLite TEXT name; PG counterpart is data (JSONB)",
  },
  {
    table: "routine_habit_order",
    column: "order",
    reason: "PG JSONB/text[] name; SQLite counterpart is order_json",
  },
  {
    table: "routine_habit_order",
    column: "order_json",
    reason: "SQLite TEXT name; PG counterpart is order",
  },
];

function isCrossWhitelisted(table, column) {
  return PG_SQLITE_CROSS_WHITELIST.some(
    (e) => e.table === table && (e.column === undefined || e.column === column),
  );
}

// ─── SQL-only tables allowlist ───────────────────────────────────────────────
//
// Таблиці, які СТВОРЮЮТЬСЯ SQL-міграціями, але НАВМИСНО не мають Drizzle-моделі
// у packages/db-schema/src/pg/. Це server-only домени: analytics/observability,
// billing/subscriptions, integration-стейт (Mono/OpenClaw/n8n/Telegram), черги,
// webhook-журнали, rate-limit, push-audit тощо. Клієнт не читає їх через Drizzle
// ORM — доступ лише з сервера (raw SQL / pg-драйвер), тож Drizzle-типізація не
// потрібна. Список згенеровано з ФАКТИЧНОГО стану міграцій (див. режим
// `--list-sql-only`), з урахуванням DROP/RENAME (напр. 046 дропнув module_data).
//
// Гейт: НОВА SQL-таблиця, якої тут немає і яка не змодельована в Drizzle,
// впаде як `table-sql-only`. Щоб полагодити — або додай Drizzle-модель у
// packages/db-schema/src/pg/, або внеси таблицю сюди з обґрунтуванням, чому
// вона лишається server-only.
const SQL_ONLY_TABLES = [
  // AI usage / memory (analytics + server-side episodic store, pgvector).
  // Клієнт бачить агреговані числа через API, не через Drizzle.
  "ai_memories",
  "ai_memory_backfill_state",
  "ai_memory_ingest_failed",
  "ai_usage_daily",
  // Billing / subscriptions / revenue — керуються серверними billing-воркерами
  // та webhook-хендлерами (Stripe / Apple IAP / LiqPay), клієнт читає через API.
  "apple_iap_receipts",
  "billing_subscriptions",
  "billing_webhook_events",
  // Plata recurring-payment credential: encrypted secret consumed only by
  // the server scheduler/raw-pg billing layer; never exposed through Drizzle.
  "plata_card_token",
  "revenue_daily",
  "stripe_webhook_events",
  "subscriptions",
  // Mono integration state — токени/акаунти/транзакції та черга AI-збагачення;
  // читаються лише серверним sync-шаром.
  "mono_account",
  "mono_ai_enrichment_queue",
  "mono_connection",
  "mono_transaction",
  // Integration webhooks / failure journals (n8n + generic) — server-only журнали.
  "n8n_failure_events",
  "n8n_webhook_events",
  "webhook_events",
  // OpenClaw gateway — рішення/виклики/аудит записів/mute/нагадування/approval-nonce; server-only.
  "openclaw_approval_nonce",
  "openclaw_decisions",
  "openclaw_invocations",
  "openclaw_mute_state",
  "openclaw_reminders",
  "openclaw_write_audit",
  // Push delivery — реєстр девайсів і аудит відправок; пише лише сервер.
  "push_devices",
  "push_send_audit",
  // Telegram alerting — ack-и алертів та архів топіків; server-only.
  "tg_alert_acks",
  "tg_topic_archive",
  // Growth / product analytics — агреговані daily/weekly таблиці, наповнюються
  // серверними job-ами; клієнт не читає їх через Drizzle.
  "app_store_reviews",
  "brand_mentions",
  "feature_adoption_weekly",
  "growth_acquisition_daily",
  "growth_cohorts",
  "growth_funnel_daily",
  // SEO analytics — зовнішні дані (GSC / PageSpeed / competitors); server-only.
  "seo_backlinks",
  "seo_competitor_snapshots",
  "seo_competitors",
  "seo_gsc_daily",
  "seo_keyword_ranks",
  "seo_keywords",
  "seo_pagespeed_daily",
  "seo_sitemap_health",
  // Social analytics — канальні метрики та згадки; server-only.
  "social_channels_daily",
  "social_mentions",
  // Email / marketing — журнали кампаній/подій + unsubscribe-реєстр; server-only.
  "email_campaigns_log",
  "email_events",
  "email_unsubscribes",
  // Governance / strategy — журнал порушень hard-rules і стратегічні цілі;
  // server-only (governance-tooling, не клієнтський Drizzle-read).
  "hard_rules_violations",
  "strategic_goals",
  // Rate limiting — token-bucket стан; читає/пише лише серверний middleware.
  "rate_limit_buckets",
  // User preferences — server-managed key-value налаштування (не Drizzle-read).
  "user_preferences",
];

function isSqlOnlyAllowlisted(table) {
  return SQL_ONLY_TABLES.includes(table);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Директорії за замовчуванням — реальні схеми. Env-оверрайди існують лише для
// тестів (drift.test.ts), щоб прогнати детектор проти фікстур; у CI/проді не
// виставляються.
const SQL_DIR = process.env.SCHEMA_DRIFT_SQL_DIR
  ? resolve(process.env.SCHEMA_DRIFT_SQL_DIR)
  : resolve(ROOT, "apps/server/src/migrations");
const DRIZZLE_DIR = process.env.SCHEMA_DRIFT_PG_DIR
  ? resolve(process.env.SCHEMA_DRIFT_PG_DIR)
  : resolve(ROOT, "packages/db-schema/src/pg");
const SQLITE_DRIZZLE_DIR = process.env.SCHEMA_DRIFT_SQLITE_DIR
  ? resolve(process.env.SCHEMA_DRIFT_SQLITE_DIR)
  : resolve(ROOT, "packages/db-schema/src/sqlite");

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

// ─── SQL-only table check ─────────────────────────────────────────────────────
//
// Кожна таблиця, яка існує в SQL-міграціях (після врахування DROP/RENAME), але
// відсутня в Drizzle PG-схемі, має бути або змодельована в Drizzle, або явно
// внесена в SQL_ONLY_TABLES. Інакше нова SQL-only таблиця пройшла б непоміченою
// — це і є сліпа зона, яку закриває ця перевірка.
const sqlOnlyTables = [];
for (const tbl of sqlSchema.keys()) {
  if (drizzleSchema.has(tbl)) continue; // змодельована в Drizzle — ок
  if (isWhitelisted(tbl)) continue; // whole-table whitelist (напр. auth)
  sqlOnlyTables.push(tbl);
  if (isSqlOnlyAllowlisted(tbl)) continue; // задокументована server-only таблиця
  issues.push({
    kind: "table-sql-only",
    table: tbl,
    message: `Table "${tbl}" created in SQL migrations but has no Drizzle PG model and is not in SQL_ONLY_TABLES — add a Drizzle model in packages/db-schema/src/pg/, or add "${tbl}" to SQL_ONLY_TABLES in scripts/check-schema-drift.mjs with a justification`,
  });
}

// Допоміжний режим для генерації/аудиту allowlist-у: друкує повний список
// SQL-only таблиць (незалежно від allowlist-у) і виходить. Використовується при
// перегляді SQL_ONLY_TABLES після додавання нових міграцій.
if (process.argv.includes("--list-sql-only")) {
  const sorted = [...sqlOnlyTables].sort();
  process.stdout.write(
    JSON.stringify(
      {
        count: sorted.length,
        tables: sorted,
        allowlisted: sorted.filter(isSqlOnlyAllowlisted),
        notAllowlisted: sorted.filter((t) => !isSqlOnlyAllowlisted(t)),
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(0);
}

// ─── PG ↔ SQLite Drizzle cross-check ─────────────────────────────────────────
//
// For tables defined in BOTH the PG and SQLite Drizzle schemas, column names
// (SQL names, not JS keys) must match.  Type differences (TIMESTAMPTZ → TEXT,
// UUID → TEXT, BOOLEAN → INTEGER, JSONB → TEXT) are expected and not checked.
// Tables that appear only in one dialect are intentionally skipped.
const sqliteSchema = parseSqliteDrizzleSchemas(SQLITE_DRIZZLE_DIR);

for (const [tbl, pgCols] of drizzleSchema) {
  if (!sqliteSchema.has(tbl)) continue; // PG-only table — expected, skip
  if (isCrossWhitelisted(tbl)) continue;

  const sqliteCols = sqliteSchema.get(tbl);

  for (const col of pgCols) {
    if (isCrossWhitelisted(tbl, col)) continue;
    if (!sqliteCols.has(col)) {
      issues.push({
        kind: "col-pg-not-in-sqlite",
        table: tbl,
        column: col,
        message: `Column "${tbl}.${col}" is in PG Drizzle schema but not in SQLite Drizzle schema`,
      });
    }
  }

  for (const col of sqliteCols) {
    if (isCrossWhitelisted(tbl, col)) continue;
    if (!pgCols.has(col)) {
      issues.push({
        kind: "col-sqlite-not-in-pg",
        table: tbl,
        column: col,
        message: `Column "${tbl}.${col}" is in SQLite Drizzle schema but not in PG Drizzle schema`,
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
        "     to mirror the same tables/columns. See docs/00-start/playbooks/add-sql-migration.md\n" +
        "Whitelist: add an entry to WHITELIST in scripts/check-schema-drift.mjs " +
        "for intentional divergences.",
    );
  }
}

process.exit(issues.length > 0 ? 1 : 0);
