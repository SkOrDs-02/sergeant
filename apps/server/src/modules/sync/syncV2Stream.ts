import EventEmitter from "node:events";
import type { Request, Response } from "express";
import pool from "../../db.js";
import { validateQuery } from "../../http/validate.js";
import { SyncV2PullSchema } from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  syncDurationMs,
  syncOperationsTotal,
  syncStreamConnectionsActive,
} from "../../obs/metrics.js";

/**
 * Stage 5 / PR #041 із `docs/planning/storage-roadmap.md` — real-time pull
 * через Server-Sent Events.
 *
 * Доповнює `GET /api/v2/sync/pull` (PR #021) живим стрімом: коли
 * інший пристрій того ж юзера успішно `POST /api/v2/sync/push`-ить
 * batch, кожен applied-op фен-аутиться в усі відкриті SSE-підписки
 * через in-process `opLogEmitter`. Це усуває polling-loop, який
 * клієнтам довелось би крутити проти `/pull?since=`.
 *
 * Контракт стріму:
 *
 *   * Заголовки `Content-Type: text/event-stream`,
 *     `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
 *   * Відразу після connect — `event: hello` із `last_replayed_id`.
 *   * Backlog replay: ops з `id > since` (`?since=` query або
 *     `Last-Event-ID` header — стандартний SSE-reconnect-механізм)
 *     летять як `event: op` SSE-frames, по `SYNC_V2_STREAM_REPLAY_LIMIT`
 *     рядків за раз. Якщо backlog більший за ліміт, клієнт сам має
 *     реконектнутись із новим `since` — це навмисно, щоб не вантажити
 *     BLOB-и в одному запиті.
 *   * Після replay — `event: caught_up` із поточним `id`.
 *   * Live ops з `opLogEmitter` пушаться як `event: op`.
 *   * Heartbeat — `: heartbeat\n\n` (SSE-comment, ігнорується клієнтом)
 *     кожні `SYNC_V2_STREAM_HEARTBEAT_MS`. Тримає alive проти 30-секундних
 *     proxy-idle-таймаутів (Vercel/Cloudflare/nginx default).
 *
 * Single-process замітка: емітер in-memory; multi-instance деплоймент
 * у майбутньому потребуватиме PG `LISTEN/NOTIFY` чи Redis pub/sub
 * (TODO у roadmap PR #050). Railway-сетап Sergeant-а зараз single-instance,
 * тому fan-out тривіальний; cross-process — наступний шар.
 *
 * `X-Origin-Device-Id` (опціональний header) виключає ops із тим самим
 * device-id, симетрично з `/pull` — клієнт не реплеїть власні writes.
 */

export const SYNC_V2_STREAM_HEARTBEAT_MS = 25_000;
export const SYNC_V2_STREAM_REPLAY_LIMIT = 500;

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Public shape SSE-події `op`. Дзеркалить response.ops[] із `/pull`,
 * тому existing api-client типи можна reuse-нути 1:1.
 */
export interface SyncV2StreamOp {
  id: number;
  table: string;
  op: "insert" | "update" | "delete";
  row: unknown;
  client_ts: string;
  server_ts: string;
  origin_device_id: string | null;
}

/**
 * Внутрішній emitter — один на процес. Топік == user-id, payload —
 * масив applied-ops із push-batch-у. Чому per-batch (а не per-op):
 * push-handler уже має готовий applied-список після COMMIT, дешевше
 * один emit зі всім batch-ем, ніж N emit-ів. SSE-handler дегрупує і
 * letить кожен op окремим `event: op`-ом, тому клієнт не помічає.
 *
 * Жодних magic numbers на listener-cap-у — Node default-ить 10, ми
 * піднімаємо до 1000, бо real-world юзер може мати 10-20 одночасних
 * device-/tab-сесій без аномалії; warning-spam при 11-му підключенні
 * нам тут не потрібен.
 */
class SyncOpLogEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);
  }
}

export const opLogEmitter = new SyncOpLogEmitter();

/**
 * Викликається `syncV2Push` після успішного COMMIT-у. `applied` — лише
 * ops зі `status='applied'`, з фінальним `id`/`server_ts`. Rejected
 * рядки в стрім не йдуть, симетрично з `/pull` (status='applied').
 */
export function notifySyncV2OpsApplied(
  userId: string,
  applied: readonly SyncV2StreamOp[],
): void {
  if (applied.length === 0) return;
  try {
    opLogEmitter.emit(`user:${userId}`, applied);
  } catch (err: unknown) {
    // Emitter exception в одного listener-а не повинна валити push-handler.
    try {
      logger.warn({
        msg: "sync_v2_stream_emit_failed",
        userId,
        count: applied.length,
        err: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* logging must never break a request */
    }
  }
}

interface PullRow {
  id: string;
  table_name: string;
  op: "insert" | "update" | "delete";
  row: unknown;
  client_ts: Date;
  server_ts: Date;
  origin_device_id: string | null;
}

function rowToStreamOp(r: PullRow): SyncV2StreamOp {
  // Hard rule #1: BIGSERIAL `id` повертається з `pg` як string. Coerce.
  return {
    id: Number(r.id),
    table: r.table_name,
    op: r.op,
    row: r.row,
    client_ts: r.client_ts.toISOString(),
    server_ts: r.server_ts.toISOString(),
    origin_device_id: r.origin_device_id,
  };
}

/**
 * SSE-frame builder. Окремою функцією — щоб тести могли asserti-ти
 * проти точного wire-формату без mocking-у Express Response.
 *
 * Контракт:
 *   * `id:` — клієнт зберігає у EventSource.lastEventId і присилає
 *     назад у Last-Event-ID на reconnect.
 *   * `event:` — name каналу; клієнт ловить `addEventListener('op', …)`.
 *   * `data:` — JSON. Multi-line data заборонено, бо blank line закінчує
 *     event; ми сериалізуємо одним JSON.stringify, який гарантовано
 *     not-multiline (не містить literal `\n`).
 */
export function formatSseFrame(
  event: string,
  data: unknown,
  id?: number | string,
): string {
  const lines: string[] = [];
  if (id != null) lines.push(`id: ${String(id)}`);
  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  // Trailing blank line ends the event. SSE requires "\n\n".
  return lines.join("\n") + "\n\n";
}

export function formatSseHeartbeat(): string {
  // SSE-comment рядок (`:`) — клієнт ігнорує, але reverse-proxy бачить
  // активність і не закриває idle-з'єднання.
  return `: heartbeat\n\n`;
}

function readOriginDeviceId(req: Request): string | null {
  const raw = req.headers["x-origin-device-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

function readLastEventId(req: Request): number | null {
  const raw = req.headers["last-event-id"];
  if (typeof raw !== "string") return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

/**
 * `GET /api/v2/sync/stream` — SSE-стрім applied-ops для поточного юзера.
 *
 * Reconnect-механіка:
 *   * `?since=<id>` — explicit cursor (точно, як у `/pull`).
 *   * `Last-Event-ID: <id>` — стандартний SSE-header при auto-reconnect.
 *   * Якщо обидва присутні — `Last-Event-ID` перемагає (пріоритет
 *     resume-сценарію над bookmark-ом).
 *
 * `X-Origin-Device-Id` (опціональний) виключає ops із тим самим device-id —
 * клієнт не реплеїть власні writes.
 */
export async function syncV2Stream(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  const parsed = validateQuery(SyncV2PullSchema, req, res);
  if (!parsed.ok) {
    try {
      syncOperationsTotal.inc({
        op: "v2_stream",
        module: "v2",
        outcome: "invalid",
      });
      syncDurationMs.observe(
        { op: "v2_stream", module: "v2" },
        elapsedMs(start),
      );
    } catch {
      /* metrics must never break a request */
    }
    return;
  }
  const lastEventId = readLastEventId(req);
  const since = lastEventId != null ? lastEventId : parsed.data.since;
  const originDeviceId = readOriginDeviceId(req);

  // SSE handshake. `flushHeaders` важливий — без нього Node не вишле
  // status+headers, доки не накопичиться буфер; SSE-клієнт залишиться
  // у стані "connecting" нескінченно.
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disables buffering на nginx-/Cloudflare-edge-проксі. Без цього
  // events можуть доїхати клієнту батчами раз на 4 KB, ламаючи
  // real-time-семантику.
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let activeCounted = false;
  try {
    syncStreamConnectionsActive.inc({ module: "v2" });
    activeCounted = true;
  } catch {
    /* metrics must never break a request */
  }

  // 1. Replay backlog. Один SELECT (як у `/pull`), без auto-pagination —
  //    якщо backlog > limit, клієнт reconnect-иться з оновленим since.
  let lastReplayedId = since;
  try {
    const result = await pool.query<PullRow>(
      `SELECT id, table_name, op, row, client_ts, server_ts, origin_device_id
         FROM sync_op_log
        WHERE user_id = $1
          AND id > $2
          AND status = 'applied'
          AND origin_device_id IS DISTINCT FROM $3
        ORDER BY id ASC
        LIMIT $4`,
      [user.id, since, originDeviceId, SYNC_V2_STREAM_REPLAY_LIMIT],
    );
    res.write(
      formatSseFrame("hello", {
        since,
        replay_limit: SYNC_V2_STREAM_REPLAY_LIMIT,
      }),
    );
    for (const row of result.rows) {
      const op = rowToStreamOp(row);
      lastReplayedId = op.id;
      res.write(formatSseFrame("op", op, op.id));
    }
    res.write(
      formatSseFrame("caught_up", {
        last_id: lastReplayedId,
        truncated: result.rows.length === SYNC_V2_STREAM_REPLAY_LIMIT,
      }),
    );
  } catch (err: unknown) {
    try {
      syncOperationsTotal.inc({
        op: "v2_stream",
        module: "v2",
        outcome: "error",
      });
      syncDurationMs.observe(
        { op: "v2_stream", module: "v2" },
        elapsedMs(start),
      );
    } catch {
      /* metrics must never break a request */
    }
    try {
      logger.error({
        msg: "sync_v2_stream_replay_failed",
        userId: user.id,
        err: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* logging must never break a request */
    }
    if (activeCounted) {
      try {
        syncStreamConnectionsActive.dec({ module: "v2" });
      } catch {
        /* metrics must never break a request */
      }
    }
    if (!res.writableEnded) res.end();
    return;
  }

  // 2. Live subscription. Listener живе доки клієнт не закриє connection;
  //    `req.on('close')` прибирає subscription і clearInterval.
  const channel = `user:${user.id}`;
  const onOps = (applied: readonly SyncV2StreamOp[]): void => {
    if (res.writableEnded) return;
    for (const op of applied) {
      // Симетрично з backlog-replay: ops з тим самим origin device id
      // не реплеються власному клієнту.
      if (originDeviceId != null && op.origin_device_id === originDeviceId) {
        continue;
      }
      try {
        res.write(formatSseFrame("op", op, op.id));
      } catch {
        // socket-помилка → cleanup-handler нижче (req.on('close')).
        return;
      }
    }
  };
  opLogEmitter.on(channel, onOps);

  // 3. Heartbeat. Нагадування keep-alive для idle-проксі. setTimeout-based
  //    замість setInterval — щоб не накопичувати pending event-loop tick-ів,
  //    якщо клієнт відвалився між ticks (старий interval-handle ще виконається
  //    раз перед clearInterval; для нашого short cadence це ОК, але прикриваємо
  //    через `unref`, щоб не блокувати graceful shutdown).
  const heartbeatTimer = setInterval(() => {
    if (res.writableEnded) return;
    try {
      res.write(formatSseHeartbeat());
    } catch {
      /* socket може бути в half-closed; cleanup нижче */
    }
  }, SYNC_V2_STREAM_HEARTBEAT_MS);
  if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeatTimer);
    opLogEmitter.off(channel, onOps);
    if (activeCounted) {
      try {
        syncStreamConnectionsActive.dec({ module: "v2" });
      } catch {
        /* metrics must never break a request */
      }
    }
    try {
      syncOperationsTotal.inc({
        op: "v2_stream",
        module: "v2",
        outcome: "ok",
      });
      syncDurationMs.observe(
        { op: "v2_stream", module: "v2" },
        elapsedMs(start),
      );
    } catch {
      /* metrics must never break a request */
    }
    if (!res.writableEnded) {
      try {
        res.end();
      } catch {
        /* res може бути вже закрите */
      }
    }
    try {
      logger.info({
        msg: "sync_v2_stream_closed",
        userId: user.id,
        ms: Math.round(elapsedMs(start)),
        replayed_to: lastReplayedId,
      });
    } catch {
      /* logging must never break a request */
    }
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
}
