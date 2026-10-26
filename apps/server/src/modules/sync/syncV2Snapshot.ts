import type { Request, RequestHandler, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../db.js";
import { boolFromProcessEnv } from "../../env/envHelpers.js";
import { parseQuery } from "../../http/validate.js";
import { SyncV2SnapshotQuerySchema } from "../../http/schemas.js";
import { decryptOpRowForPull } from "../../lib/healthTextCrypto.js";
import { NotFoundError, ValidationError } from "../../obs/errors.js";
import { logger } from "../../obs/logger.js";
import { SYNC_V2_SUPPORTED_TABLES } from "./syncV2.js";
import { pullByteBudget } from "./syncV2Pull.js";
import { SYNC_OP_LOG_FLOOR_SQL } from "./syncOpLogFloor.js";

/**
 * `GET /api/v2/sync/snapshot` (ADR-0105 §3.3, аудит 2026-10-01 `rel-06`).
 *
 * Поточний стан рядків користувача з модульних sync-таблиць (вони джерело
 * істини) як послідовність pull-оп-ів `op: "insert"` з `row` у формі колонок
 * таблиці (`to_jsonb`), tombstone-и (`deleted_at`) включно. Клієнт
 * застосовує їх наявним `applyPullOp` (LWW-безпечно) і ставить курсор pull
 * на `as_of_op_id`.
 *
 * **Послідовність.** `as_of_op_id` знімається на першій сторінці в тій самій
 * REPEATABLE READ транзакції, що й читання рядків: усе, що закомічено до
 * нього, є в знімку. Наступні сторінки - інші транзакції; вони бачать
 * новіший стан, але кожна зміна після `as_of_op_id` має оп з `id >
 * as_of_op_id` (записувачі серіалізовані `lockUserSyncOpLog`), тож pull
 * після знімка її довезе, а LWW зробить повтор безпечним.
 *
 * `as_of_op_id = GREATEST(max(id) журналу користувача, floor_id)`: після
 * retention, що видалив УСІ оп-и користувача, `max(id)` нижчий за межу, і
 * курсор на ньому знову дав би 410 - нескінченний цикл.
 *
 * **Сторінкування.** Той самий байтовий бюджет, що й pull
 * (`SYNC_V2_PULL_MAX_BYTES`, сума `octet_length(row::text)` рахується в
 * Postgres, перший рядок сторінки віддається завжди) плюс `limit` рядків.
 * Курсор непрозорий: base64url JSON `{v, t, k}` - таблиця і ключ останнього
 * віддаваного рядка (PK без `user_id`), `k = null` - таблиця з початку.
 *
 * За прапорцем `SYNC_SNAPSHOT_ENABLED` (дефолт вимкнено -> 404), доки немає
 * клієнтського bootstrap-у (ADR-0105 §5, крок 3).
 */

type WithSessionUser = Request & { user?: { id: string } };

const CURSOR_VERSION = 1;

interface SnapshotCursor {
  t: string;
  /** Ключ (PK без `user_id`) останнього віддаваного рядка; `null` - з початку. */
  k: Record<string, string | number> | null;
}

interface SnapshotRow {
  row: Record<string, unknown>;
  row_bytes: number;
  /** `LEAD` номера рядка у вікні сторінки: не `null` - у вікні ще є рядки. */
  next_rn: string | null;
}

export function isSyncSnapshotEnabled(): boolean {
  return boolFromProcessEnv("SYNC_SNAPSHOT_ENABLED", false);
}

/**
 * Ставиться ДО pre-auth лімітера і `requireSession()`, як прапорець стріму:
 * вимкнений маршрут однаково відповідає 404 і анонімові, і залогіненому.
 */
export function requireSyncSnapshotEnabled(): RequestHandler {
  return (_req, _res, next) => {
    if (isSyncSnapshotEnabled()) {
      next();
      return;
    }
    next(new NotFoundError("Not found"));
  };
}

export function encodeSnapshotCursor(cursor: SnapshotCursor): string {
  return Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, t: cursor.t, k: cursor.k }),
    "utf8",
  ).toString("base64url");
}

function invalidCursor(): ValidationError {
  return new ValidationError("Некоректний курсор знімка", {
    cause: { details: [{ path: "cursor", message: "invalid" }] },
  });
}

export function decodeSnapshotCursor(
  raw: string,
  tables: readonly string[],
): SnapshotCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  if (!parsed || typeof parsed !== "object") throw invalidCursor();
  const { v, t, k } = parsed as Record<string, unknown>;
  if (v !== CURSOR_VERSION || typeof t !== "string" || !tables.includes(t)) {
    throw invalidCursor();
  }
  if (k === null) return { t, k: null };
  if (!k || typeof k !== "object" || Array.isArray(k)) throw invalidCursor();
  const key: Record<string, string | number> = {};
  for (const [col, val] of Object.entries(k)) {
    if (typeof val !== "string" && typeof val !== "number") {
      throw invalidCursor();
    }
    key[col] = val;
  }
  return { t, k: key };
}

/** PK-колонки таблиці без `user_id`, у порядку індексу. Кеш на процес. */
const keyColumnsCache = new Map<string, string[]>();

async function keyColumns(
  client: PoolClient,
  table: string,
): Promise<string[]> {
  const cached = keyColumnsCache.get(table);
  if (cached) return cached;
  const { rows } = await client.query<{ attname: string }>(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = to_regclass($1) AND i.indisprimary
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [table],
  );
  const cols = rows.map((r) => r.attname).filter((c) => c !== "user_id");
  keyColumnsCache.set(table, cols);
  return cols;
}

/** Ідентифікатор з каталогу Postgres -> SQL з лапками. */
function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Одна таблиця: рядки користувача після ключа `after`, до `limit` штук,
 * поки сума розмірів ПОПЕРЕДНІХ рядків сторінки (`usedBytes` уже віддано
 * з попередніх таблиць) менша за бюджет.
 */
async function readTablePage(
  client: PoolClient,
  userId: string,
  table: string,
  cols: readonly string[],
  after: Record<string, string | number> | null,
  limit: number,
  usedBytes: number,
  budget: number,
): Promise<SnapshotRow[]> {
  const t = ident(table);
  const order = cols.length
    ? cols.map((c) => `t.${ident(c)}`).join(", ")
    : "t.user_id";
  const keyset =
    after && cols.length
      ? `AND (${cols.map((c) => `t.${ident(c)}`).join(", ")}) >
             (SELECT ${cols.map((c) => `p.${ident(c)}`).join(", ")}
                FROM jsonb_populate_record(NULL::${t}, $2::jsonb) p)`
      : // `$2` завжди null тут; згадка лише типізує параметр.
        "AND $2::jsonb IS NULL";
  // eslint-disable-next-line no-restricted-syntax -- інтерполюються лише ідентифікатори: `table` з реєстру `SYNC_V2_SUPPORTED_TABLES` (перевірено викликачем), колонки - з `pg_index`, у лапках `ident`; значення ключа, `userId` і ліміти йдуть $-параметрами.
  const { rows } = await client.query<SnapshotRow>(
    `WITH page AS (
       SELECT to_jsonb(t) AS row,
              ROW_NUMBER() OVER (ORDER BY ${order}) AS rn
         FROM ${t} t
        WHERE t.user_id = $1 ${keyset}
        ORDER BY ${order}
        LIMIT $3
     ), sized AS (
       SELECT row, rn,
              octet_length(row::text) AS row_bytes,
              COALESCE(SUM(octet_length(row::text)) OVER (
                ORDER BY rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ), 0) AS bytes_before,
              LEAD(rn) OVER (ORDER BY rn) AS next_rn
         FROM page
     )
     SELECT row, row_bytes, next_rn
       FROM sized
      WHERE $4::bigint + bytes_before < $5::bigint
      ORDER BY rn`,
    [
      userId,
      after && cols.length ? JSON.stringify(after) : null,
      limit,
      usedBytes,
      budget,
    ],
  );
  return rows;
}

interface SnapshotOp {
  id: number;
  table: string;
  op: "insert";
  row: Record<string, unknown>;
  client_ts: string;
  server_ts: string;
  origin_device_id: null;
}

export interface SnapshotPage {
  ops: SnapshotOp[];
  as_of_op_id: number;
  next_cursor: string | null;
}

/**
 * Одна сторінка знімка в уже відкритій транзакції. Окремо від handler-а,
 * щоб інтеграційний тест ганяв її на живому Postgres без Express.
 */
export async function readSnapshotPage(
  client: PoolClient,
  userId: string,
  opts: {
    cursor: SnapshotCursor | null;
    asOfOpId: number | undefined;
    limit: number;
    budget: number;
    tables: readonly string[];
  },
): Promise<SnapshotPage> {
  let asOfOpId = opts.asOfOpId;
  if (asOfOpId === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- інтерполюється лише константа `SYNC_OP_LOG_FLOOR_SQL`; `userId` - $-параметр.
    const { rows } = await client.query<{ as_of: string }>(
      `SELECT GREATEST(
         COALESCE((SELECT MAX(id) FROM sync_op_log WHERE user_id = $1), 0),
         ${SYNC_OP_LOG_FLOOR_SQL}
       )::bigint AS as_of`,
      [userId],
    );
    // Hard Rule #1: bigint -> number.
    asOfOpId = Number(rows[0]?.as_of ?? 0) || 0;
  }

  const serverTs = new Date().toISOString();
  const ops: SnapshotOp[] = [];
  let usedBytes = 0;
  let nextCursor: SnapshotCursor | null = null;
  const startIdx = opts.cursor ? opts.tables.indexOf(opts.cursor.t) : 0;

  for (let i = startIdx; i < opts.tables.length; i += 1) {
    const table = opts.tables[i]!;
    const cols = await keyColumns(client, table);
    let after: Record<string, string | number> | null = null;
    if (opts.cursor && i === startIdx && opts.cursor.k) {
      // Ключ мусить нести рівно PK-колонки: відсутня дала б NULL у
      // порівнянні кортежів, і таблиця тихо пропустилась би цілком.
      const k = opts.cursor.k;
      const keys = Object.keys(k);
      if (keys.length !== cols.length || cols.some((c) => !(c in k))) {
        throw invalidCursor();
      }
      // Таблиця з одним рядком на користувача (PK = user_id) уже віддана.
      if (cols.length === 0) continue;
      after = k;
    }

    const remaining = opts.limit - ops.length;
    const rows = await readTablePage(
      client,
      userId,
      table,
      cols,
      after,
      remaining,
      usedBytes,
      opts.budget,
    );
    for (const r of rows) {
      const row = decryptOpRowForPull(table, r.row);
      ops.push({
        id: asOfOpId,
        table,
        op: "insert",
        row,
        client_ts:
          toIso(row["updated_at"]) ?? toIso(row["created_at"]) ?? serverTs,
        server_ts: serverTs,
        origin_device_id: null,
      });
      usedBytes += Number(r.row_bytes) || 0;
    }

    const last = rows[rows.length - 1];
    const cutInsideTable =
      (last != null && last.next_rn != null) || rows.length === remaining;
    if (cutInsideTable && last) {
      const key: Record<string, string | number> = {};
      for (const c of cols) {
        const v = last.row[c];
        key[c] = typeof v === "number" ? v : String(v);
      }
      nextCursor = { t: table, k: key };
      break;
    }
    if (usedBytes >= opts.budget || ops.length >= opts.limit) {
      const nextTable = opts.tables[i + 1];
      nextCursor = nextTable ? { t: nextTable, k: null } : null;
      break;
    }
  }

  return {
    ops,
    as_of_op_id: asOfOpId,
    next_cursor: nextCursor ? encodeSnapshotCursor(nextCursor) : null,
  };
}

export async function syncV2Snapshot(
  req: Request,
  res: Response,
): Promise<void> {
  const user = (req as WithSessionUser).user!;
  const query = parseQuery(SyncV2SnapshotQuerySchema, req);
  const tables = SYNC_V2_SUPPORTED_TABLES;
  const cursor = query.cursor
    ? decodeSnapshotCursor(query.cursor, tables)
    : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const page = await readSnapshotPage(client, user.id, {
      cursor,
      asOfOpId: query.as_of_op_id,
      limit: query.limit,
      budget: pullByteBudget(),
      tables,
    });
    await client.query("COMMIT");
    logger.info({
      msg: "sync_v2_snapshot_page",
      returned: page.ops.length,
      first_page: cursor === null,
      done: page.next_cursor === null,
    });
    res.json(page);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
