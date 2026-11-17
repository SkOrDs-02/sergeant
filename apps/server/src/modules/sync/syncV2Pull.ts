import type { Request, Response } from "express";
import pool from "../../db.js";
import { parseQuery } from "../../http/validate.js";
import { SyncV2PullSchema } from "../../http/schemas.js";
import { decryptOpRowForPull } from "../../lib/healthTextCrypto.js";
import {
  syncOpLogPullLagMs,
  syncOpLogPullQueueDepth,
  syncPullPageBytes,
  syncPullTruncatedTotal,
} from "../../obs/metrics.js";
import { env } from "../../env/env.js";
import { elapsedMs } from "../../lib/timing.js";
import { readOriginDeviceId, recordSyncV2 } from "./syncV2-core.js";
import {
  SYNC_OP_LOG_FLOOR_SQL,
  SyncCursorExpiredError,
  isCursorExpired,
} from "./syncOpLogFloor.js";

type WithSessionUser = Request & { user?: { id: string } };

interface PullRow {
  /**
   * Нижня межа журналу користувача (`sync_op_log_floor`, міграція 166);
   * bigint -> string. Є в кожному рядку результату, включно з єдиним
   * «порожнім» рядком (усі поля опа `null`), коли сторінка порожня.
   */
  floor_id?: string | number | null;
  id: string;
  table_name: string;
  op: "insert" | "update" | "delete";
  row: unknown;
  client_ts: Date;
  server_ts: Date;
  origin_device_id: string | null;
  /** `octet_length(row::text)` (int4). */
  row_bytes: number;
  /**
   * `LEAD(id) OVER (ORDER BY id)` - id наступного кандидата сторінки або
   * `null`; bigint, `pg` віддає string (Hard Rule #1).
   */
  next_id: string | null;
}

/** Бюджет сторінки pull у байтах (ADR-0105): env або дефолт 2 MiB. */
const PULL_MAX_BYTES_DEFAULT = 2_097_152;
export function pullByteBudget(): number {
  const v = env.SYNC_V2_PULL_MAX_BYTES;
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : PULL_MAX_BYTES_DEFAULT;
}

export async function syncV2Pull(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  let since: number;
  let limit: number;
  try {
    ({ since, limit } = parseQuery(SyncV2PullSchema, req));
  } catch (err) {
    recordSyncV2("v2_pull", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }
  const originDeviceId = readOriginDeviceId(req);

  try {
    const budget = pullByteBudget();
    // ADR-0105 §1: бюджет рахує сам Postgres. `page` бере до `limit` рядків,
    // `sized` додає суму `octet_length(row::text)` ПОПЕРЕДНІХ рядків вікна;
    // лишаються рядки, чий префікс ще менший за бюджет (перший завжди).
    // Рядки понад бюджет у Node не потрапляють.
    //
    // ADR-0105 §3: нижня межа журналу (`fl`) читається в тому ж запиті, без
    // окремого round-trip. `fl LEFT JOIN sized` дає щонайменше один рядок і
    // для порожньої сторінки, тож межу видно завжди. Прострочений курсор
    // (`$2 < floor_id`) не читає журнал узагалі (умова в `page`).
    // eslint-disable-next-line no-restricted-syntax -- інтерполюється лише константа `SYNC_OP_LOG_FLOOR_SQL` з нашого коду; усі значення - $-параметри.
    const result = await pool.query<PullRow>(
      `WITH fl AS (
         SELECT ${SYNC_OP_LOG_FLOOR_SQL}::bigint AS floor_id
       ), page AS (
         SELECT id, table_name, op, row, client_ts, server_ts, origin_device_id,
                octet_length(row::text) AS row_bytes
           FROM sync_op_log
          WHERE user_id = $1
            AND id > $2
            AND $2 >= (SELECT floor_id FROM fl)
            AND status = 'applied'
            AND origin_device_id IS DISTINCT FROM $3
            AND (tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot()))
          ORDER BY id ASC
          LIMIT $4
       ), sized AS (
         SELECT page.*,
                COALESCE(SUM(row_bytes) OVER (
                  ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ), 0) AS bytes_before,
                LEAD(id) OVER (ORDER BY id) AS next_id
           FROM page
       )
       SELECT fl.floor_id, s.id, s.table_name, s.op, s.row, s.client_ts,
              s.server_ts, s.origin_device_id, s.row_bytes, s.next_id
         FROM fl
         LEFT JOIN sized s ON s.bytes_before < $5
        ORDER BY s.id ASC`,
      [user.id, since, originDeviceId, limit, budget],
    );

    const floorId = Number(result.rows[0]?.floor_id ?? 0) || 0;
    if (isCursorExpired(since, floorId)) {
      recordSyncV2("v2_pull", "invalid", {
        ms: elapsedMs(start),
        userId: user.id,
        extra: { since, floor_id: floorId, reason: "sync_cursor_expired" },
      });
      throw new SyncCursorExpiredError(floorId);
    }
    // Рядок `fl` без опа (порожня сторінка) - лише носій межі. Обгортка
    // `{ rows }` лишає серіалізатор під `sergeant-design/no-bigint-string`
    // (правило дивиться саме на `.rows.map`).
    const page = { rows: result.rows.filter((r) => r.id != null) };

    const opsOut = page.rows.map((r) => ({
      id: Number(r.id),
      table: r.table_name,
      op: r.op,
      row: decryptOpRowForPull(r.table_name, r.row),
      client_ts: r.client_ts.toISOString(),
      server_ts: r.server_ts.toISOString(),
      // eslint-disable-next-line sergeant-design/no-bigint-string -- origin_device_id is an opaque TEXT device id (migration 027_sync_op_log.sql), not a pg bigint numeric; Hard Rule #1 N/A.
      origin_device_id: r.origin_device_id,
    }));

    // Обрізано бюджетом, коли за останнім збереженим рядком у вікні сторінки
    // ще був кандидат. `LEAD` дивиться на один рядок уперед і не змушує
    // Postgres буферизувати всю сторінку разом із payload-ами, як
    // `COUNT(*) OVER ()` (рев'ю #1646).
    const lastRow = page.rows[page.rows.length - 1];
    const truncatedByBudget = lastRow != null && lastRow.next_id != null;
    // Не лише `length === limit`: обрізана бюджетом сторінка коротша за limit,
    // але за курсором ще є оп-и.
    const nextCursor =
      opsOut.length === limit || truncatedByBudget
        ? opsOut[opsOut.length - 1]!.id
        : null;

    const pageBytes = page.rows.reduce(
      (acc, r) => acc + (Number(r.row_bytes) || 0),
      0,
    );
    try {
      syncPullPageBytes.observe(pageBytes);
      if (truncatedByBudget) syncPullTruncatedTotal.inc();
    } catch {
      /* metrics must never break a request */
    }

    try {
      syncOpLogPullQueueDepth.observe(opsOut.length);
      if (page.rows.length > 0) {
        const newest = page.rows[page.rows.length - 1]!.server_ts;
        const lagMs = Date.now() - newest.getTime();
        if (lagMs >= 0 && Number.isFinite(lagMs)) {
          syncOpLogPullLagMs.observe(lagMs);
        }
      }
    } catch {
      /* metrics must never break a request */
    }

    recordSyncV2("v2_pull", opsOut.length === 0 ? "empty" : "ok", {
      ms: elapsedMs(start),
      bytes: pageBytes,
      userId: user.id,
      extra: { since, limit, returned: opsOut.length },
    });

    res.json({
      ops: opsOut,
      next_cursor: nextCursor,
    });
  } catch (err) {
    // 410 уже записано як `invalid` вище; не дублюємо його як `error`.
    if (err instanceof SyncCursorExpiredError) throw err;
    recordSyncV2("v2_pull", "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }
}
