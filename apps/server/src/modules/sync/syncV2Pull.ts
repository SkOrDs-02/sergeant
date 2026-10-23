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

type WithSessionUser = Request & { user?: { id: string } };

interface PullRow {
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
function pullByteBudget(): number {
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
    const result = await pool.query<PullRow>(
      `WITH page AS (
         SELECT id, table_name, op, row, client_ts, server_ts, origin_device_id,
                octet_length(row::text) AS row_bytes
           FROM sync_op_log
          WHERE user_id = $1
            AND id > $2
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
       SELECT id, table_name, op, row, client_ts, server_ts, origin_device_id,
              row_bytes, next_id
         FROM sized
        WHERE bytes_before < $5
        ORDER BY id ASC`,
      [user.id, since, originDeviceId, limit, budget],
    );

    const opsOut = result.rows.map((r) => ({
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
    const lastRow = result.rows[result.rows.length - 1];
    const truncatedByBudget = lastRow != null && lastRow.next_id != null;
    // Не лише `length === limit`: обрізана бюджетом сторінка коротша за limit,
    // але за курсором ще є оп-и.
    const nextCursor =
      opsOut.length === limit || truncatedByBudget
        ? opsOut[opsOut.length - 1]!.id
        : null;

    const pageBytes = result.rows.reduce(
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
      if (result.rows.length > 0) {
        const newest = result!.rows[result.rows.length - 1]!.server_ts;
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
    recordSyncV2("v2_pull", "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }
}
