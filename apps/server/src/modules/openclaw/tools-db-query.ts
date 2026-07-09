// ─────────────────────────────────────────────────────────────────────────
// query_app_db — read-only SQL з table-allowlist
// ─────────────────────────────────────────────────────────────────────────

import type { Pool, QueryResult } from "pg";
import { parse, astVisitor } from "pgsql-ast-parser";
import { QUERY_APP_DB_TABLE_ALLOWLIST } from "./types.js";
import { OpenClawAllowlistError, OpenClawSchemaError } from "./tools-errors.js";

export interface QueryAppDbInput {
  sql: string;
  params?: ReadonlyArray<unknown> | undefined;
  /** Hard cap на rows. Default 200, max 1000. */
  limit?: number | undefined;
}

export interface QueryAppDbOutput {
  rowCount: number;
  rows: Record<string, unknown>[];
  /** Список таблиць, які пройшли allowlist-перевірку. */
  tablesUsed: string[];
}

/**
 * Detects basic write-statements (INSERT/UPDATE/DELETE/TRUNCATE/ALTER/CREATE
 * /DROP/GRANT/REVOKE/COPY). Case-insensitive. Найперший token має бути
 * SELECT або WITH (для CTEs).
 */
function isWriteSql(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase();
  if (
    trimmed.startsWith("select ") ||
    trimmed.startsWith("select(") ||
    trimmed.startsWith("with ")
  ) {
    return false;
  }
  return true;
}

/**
 * Витягає всі таблиці, до яких звертається запит, через справжній SQL-parser
 * (`pgsql-ast-parser`). Регекс тут не годиться: schema-qualified (`public.session`),
 * quoted (`"user"`), comma-join (`FROM a, session`) і вкладені subquery-таблиці
 * обходять наївний `\bFROM\s+(\w+)` і читаються повз allowlist. AST бачить
 * структуру, тож кожен `tableRef` (на будь-якій глибині) враховується.
 *
 * CTE-псевдоніми (`WITH x AS (…) … FROM x`) не є реальними таблицями — їх
 * виключаємо, щоб легітимні CTE не блокувалися allowlist-ом. Non-public схеми
 * нормалізуються у qualified-ім'я (`pg_catalog.pg_authid`), яке ніколи не в
 * allowlist → block. Unparseable SQL → fail-closed (кидаємо), бо пропустити
 * обфускований bypass гірше, ніж відхилити рідкісний валідний edge-case.
 */
export function extractSqlTables(sql: string): string[] {
  let statements: ReturnType<typeof parse>;
  try {
    statements = parse(sql);
  } catch {
    throw new OpenClawAllowlistError(
      "query_app_db: SQL could not be parsed for table-allowlist check",
    );
  }

  const cteNames = new Set<string>();
  const referenced = new Set<string>();
  const visitor = astVisitor(() => ({
    with: (w) => {
      for (const bind of w.bind) {
        if (bind.alias.name) cteNames.add(bind.alias.name.toLowerCase());
      }
      visitor.super().with(w);
    },
    tableRef: (t) => {
      const schema = t.schema?.toLowerCase();
      const name = t.name.toLowerCase();
      referenced.add(
        schema && schema !== "public" ? `${schema}.${name}` : name,
      );
    },
  }));
  for (const stmt of statements) visitor.statement(stmt);

  for (const cte of cteNames) referenced.delete(cte);
  return [...referenced];
}

/**
 * Денилист небезпечних SQL-функцій, яких table-allowlist структурно не
 * ловить: вони не мають FROM-таблиці, тож `extractSqlTables` їх не бачить
 * (`SELECT pg_read_file('/etc/passwd')`). Покриває файловий доступ
 * (`pg_read_file`, `pg_ls_dir`, `lo_import`…), out-of-band/SSRF (`dblink`),
 * DoS/адмін (`pg_sleep`, `pg_terminate_backend`, `set_config`). Матчиться на
 * stripped-SQL (без коментів і string-literals), тому `'pg_sleep'` у тексті
 * не дає false-positive. COPY свідомо не тут — він не починається з
 * SELECT/WITH, тож його ловить `isWriteSql` раніше.
 */
const FORBIDDEN_SQL_FUNCTION_RE =
  /\b(pg_read_file|pg_read_binary_file|pg_stat_file|pg_ls_dir|pg_ls_logdir|pg_ls_waldir|pg_ls_tmpdir|pg_ls_archive_statusdir|lo_import|lo_export|lo_get|lo_put|dblink|dblink_connect|dblink_exec|pg_sleep|pg_sleep_for|pg_sleep_until|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|set_config)\s*\(/i;

function assertNoForbiddenSqlConstructs(sql: string): void {
  const stripped = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^']|'')*'/g, "");
  const match = FORBIDDEN_SQL_FUNCTION_RE.exec(stripped);
  if (match) {
    throw new OpenClawAllowlistError(
      `query_app_db: forbidden SQL construct: ${match[1]}`,
    );
  }
}

/**
 * Per-query timeout для LLM-driven read-queries. Тримаємо тісніше за
 * глобальний пуловий `PG_STATEMENT_TIMEOUT_MS` (db.ts) — cofounder-запити
 * мають бути швидкими, а tight-cap рубає `pg_sleep`/runaway DoS.
 */
const QUERY_APP_DB_STATEMENT_TIMEOUT_MS = 5_000;

export async function queryAppDb(
  pool: Pool,
  input: QueryAppDbInput,
): Promise<QueryAppDbOutput> {
  if (typeof input.sql !== "string" || !input.sql.trim()) {
    throw new OpenClawAllowlistError("query_app_db: sql is required");
  }
  if (isWriteSql(input.sql)) {
    throw new OpenClawAllowlistError(
      "query_app_db: only SELECT / WITH queries are allowed",
    );
  }
  assertNoForbiddenSqlConstructs(input.sql);

  const tables = extractSqlTables(input.sql);
  const forbidden = tables.filter((t) => !QUERY_APP_DB_TABLE_ALLOWLIST.has(t));
  if (forbidden.length > 0) {
    throw new OpenClawAllowlistError(
      `query_app_db: tables not in allowlist: ${forbidden.join(", ")}`,
    );
  }

  const limit = Math.max(1, Math.min(1000, input.limit ?? 200));
  // Загорнули у subquery щоб LIMIT був enforce-нутий навіть якщо LLM
  // забув його. Дві LIMIT-и не псують план — Postgres приймає.
  const wrapped = `SELECT * FROM (${input.sql}) AS __openclaw_q LIMIT ${limit}`;

  // READ ONLY транзакція — engine-level гарантія: навіть якщо guard-и щось
  // пропустять (напр. DML усередині CTE — `WITH x AS (DELETE … RETURNING *)
  // SELECT 1`, де final-SELECT без FROM проходить table-allowlist), Postgres
  // відхилить будь-який запис кодом 25006. `SET LOCAL statement_timeout`
  // кепить runaway/`pg_sleep` DoS тісніше за глобальний пуловий timeout.
  const client = await pool.connect();
  let result: QueryResult<Record<string, unknown>>;
  try {
    await client.query("BEGIN READ ONLY");
    // eslint-disable-next-line no-restricted-syntax -- statement_timeout не приймає bind-параметри ($1); інтерполюється лише довірена числова константа, не user-input
    await client.query(
      `SET LOCAL statement_timeout = ${QUERY_APP_DB_STATEMENT_TIMEOUT_MS}`,
    );
    result = await client.query(wrapped, input.params ? [...input.params] : []);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* з'єднання могло вже впасти — release у finally однаково спрацює */
    }
    if (isPgReadOnlyError(err)) {
      throw new OpenClawAllowlistError(
        "query_app_db: write operations are not permitted",
      );
    }
    if (isPgSchemaError(err)) {
      const message = err instanceof Error ? err.message : String(err);
      throw new OpenClawSchemaError(`query_app_db: ${message}`);
    }
    throw err;
  } finally {
    client.release();
  }
  return {
    rowCount: result.rowCount ?? result.rows.length,
    rows: result.rows,
    tablesUsed: tables,
  };
}

/** Postgres SQLSTATE 25006 — спроба запису у READ ONLY транзакції. */
function isPgReadOnlyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "25006"
  );
}

function isPgSchemaError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return false;
  }
  const code = (err as { code: unknown }).code;
  return typeof code === "string" && code.startsWith("42");
}
