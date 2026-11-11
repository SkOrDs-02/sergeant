import type { Request, RequestHandler, Response } from "express";
import {
  SYNC_STATE_HASH_TABLE_PKS,
  SYNC_STATE_HASH_TABLES_WITHOUT_DELETED_AT,
  computeStateHash,
  isSyncStateHashTable,
  joinStateHashPk,
  type StateHashBucket,
  type StateHashRow,
  type SyncStateHashTable,
} from "@sergeant/shared";
import pool from "../../db.js";
import { boolFromProcessEnv } from "../../env/envHelpers.js";
import { NotFoundError, ValidationError } from "../../obs/errors.js";
import { syncStateHashComputeMs } from "../../obs/metrics.js";
import { elapsedMs } from "../../lib/timing.js";

/**
 * `GET /api/v2/sync/state-hash?table=<t>` — хеш стану однієї sync-таблиці
 * користувача (ADR-0106, крок 1 плану розгортання; аудит `data-38`).
 *
 * Клієнт порівнює його з хешем своєї локальної копії; розбіжність означає,
 * що пристрій втратив записи, які сервер уже прийняв. Цей крок — лише
 * серверний ендпоінт і спільний канонізатор (`@sergeant/shared`
 * `computeStateHash`); клієнтська детекція й відновлення — наступні кроки.
 *
 * Хеш рахує той самий канонізатор, що й клієнт, у Node, а не
 * `sha256(string_agg(...))` у Postgres (як ескіз в ADR §3): один код на
 * обох боках прибирає ризик розбіжної нормалізації часу чи порядку. З БД
 * у Node їдуть лише `(pk, updated_at_ms, deleted_at_ms)`, без payload.
 */

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Прапорець `SYNC_STATE_HASH_ENABLED` (дефолт `false`). Читаємо
 * `process.env` на кожному запиті, як `SYNC_V2_STREAM_ENABLED`, щоб ops
 * вимикали ендпоінт без редеплою, а тести перемикали без ре-імпорту.
 */
export function isSyncStateHashEnabled(): boolean {
  return boolFromProcessEnv("SYNC_STATE_HASH_ENABLED", false);
}

/**
 * Ставиться ПЕРЕД pre-auth лімітером і `requireSession()`: вимкнений
 * маршрут відповідає 404 однаково анонімові й залогіненому (як стрім).
 */
export function requireSyncStateHashEnabled(): RequestHandler {
  return (_req, _res, next) => {
    if (isSyncStateHashEnabled()) {
      next();
      return;
    }
    next(new NotFoundError("Not found"));
  };
}

export interface SyncV2StateHashBody {
  table: SyncStateHashTable;
  /** Максимальний `id` застосованого оп-у користувача в тому ж знімку; 0 — оп-ів немає. */
  as_of_op_id: number;
  total: { hash: string; count: number };
  buckets: StateHashBucket[];
}

interface HashSourceRow {
  /** Компоненти ключа без `user_id`, у порядку PK (`text[]`). */
  pk_parts: string[];
  /** bigint → string у `pg` (Hard Rule #1). */
  updated_at_ms: string;
  deleted_at_ms: string | null;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * SQL вибірки рядків таблиці. Ідентифікатори беруться ЛИШЕ з allowlist
 * `SYNC_STATE_HASH_TABLE_PKS` (таблиця вже перевірена `isSyncStateHashTable`).
 * Час — `floor(epoch * 1000)`: субмілісекунди `timestamptz` відкидаються
 * вниз, як вимагає канонізатор; `extract(epoch)` у PG14+ — точний numeric.
 */
function buildRowsSql(table: SyncStateHashTable): string {
  const pk: readonly string[] = SYNC_STATE_HASH_TABLE_PKS[table];
  const pkParts =
    pk.length === 0
      ? "ARRAY[]::text[]"
      : `ARRAY[${pk.map((c) => `${quoteIdent(c)}::text`).join(", ")}]`;
  const deleted = SYNC_STATE_HASH_TABLES_WITHOUT_DELETED_AT.has(table)
    ? "NULL"
    : "floor(extract(epoch from deleted_at) * 1000)::bigint";
  return `SELECT ${pkParts} AS pk_parts,
                 floor(extract(epoch from updated_at) * 1000)::bigint AS updated_at_ms,
                 ${deleted} AS deleted_at_ms
            FROM ${quoteIdent(table)}
           WHERE user_id = $1`;
}

function toHashRow(r: HashSourceRow): StateHashRow {
  return {
    pk: joinStateHashPk(r.pk_parts),
    updated_at_ms: Number(r.updated_at_ms),
    deleted_at_ms: r.deleted_at_ms === null ? null : Number(r.deleted_at_ms),
  };
}

/**
 * Знімає `as_of_op_id` і рядки таблиці в ОДНІЙ транзакції REPEATABLE READ
 * (ADR-0106 §3): обидва читання бачать той самий знімок, тож хеш рівно
 * відповідає стану після оп-у `as_of_op_id`. `as_of_op_id` рахується лише
 * по `applied`, як курсор pull: відхилені оп-и стан не змінюють, і клієнт
 * до їхніх id курсором не доходить.
 */
export async function computeUserTableStateHash(
  userId: string,
  table: SyncStateHashTable,
): Promise<SyncV2StateHashBody> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const asOf = await client.query<{ as_of_op_id: string | null }>(
      `SELECT max(id) AS as_of_op_id
         FROM sync_op_log
        WHERE user_id = $1 AND status = 'applied'`,
      [userId],
    );
    const rows = await client.query<HashSourceRow>(buildRowsSql(table), [
      userId,
    ]);
    await client.query("COMMIT");
    const result = computeStateHash(rows.rows.map(toHashRow));
    return {
      table,
      as_of_op_id: Number(asOf.rows[0]?.as_of_op_id ?? 0),
      total: result.total,
      buckets: result.buckets,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function syncV2StateHash(
  req: Request,
  res: Response,
): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;
  const table = req.query["table"];
  if (!isSyncStateHashTable(table)) {
    throw new ValidationError("Таблиця не підтримує перевірку хешу стану", {
      code: "STATE_HASH_TABLE_NOT_ALLOWED",
    });
  }
  const body = await computeUserTableStateHash(user.id, table);
  try {
    syncStateHashComputeMs.observe({ table }, elapsedMs(start));
  } catch {
    /* metrics must never break a request */
  }
  res.json(body);
}
