import EventEmitter from "node:events";
import type { Request, Response } from "express";
import pool from "../../db.js";
import { parseQuery } from "../../http/validate.js";
import { SyncV2PullSchema } from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  syncDurationMs,
  syncOperationsTotal,
  syncStreamConnectionsActive,
} from "../../obs/metrics.js";
import { elapsedMs } from "../../lib/timing.js";
import { decryptOpRowForPull } from "../../lib/healthTextCrypto.js";

/**
 * Stage 5 / PR #041 із `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md` — real-time pull
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
 *   * sec-09: маршрут закритий прапорцем `SYNC_V2_STREAM_ENABLED` (дефолт
 *     off → 404, `syncV2StreamGuard.ts`). Для ввімкненого стану: кожен
 *     heartbeat перевіряє сесію в БД (`getFreshSessionUser`, без cookie-кешу)
 *     і закриває стрім, якщо її немає; зʼєднання живе не довше
 *     `SYNC_V2_STREAM_MAX_AGE_MS`; не більше `SYNC_V2_STREAM_MAX_PER_USER`
 *     одночасних стрімів на юзера (новий витісняє найстаріший). Перед
 *     серверним закриттям летить кадр `event: closed` із `reason`.
 *
 * Single-process замітка: емітер in-memory; multi-instance деплоймент
 * у майбутньому потребуватиме cross-process fan-out. Рішення зафіксовано
 * в `docs/governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md`
 * (PG `LISTEN/NOTIFY` обрано над Redis; реалізація gated на реальний
 * multi-instance тригер — roadmap PR #050). Railway-сетап Sergeant-а зараз
 * single-instance, тому fan-out тривіальний; cross-process — наступний шар.
 *
 * `X-Origin-Device-Id` (опціональний header) виключає ops із тим самим
 * device-id, симетрично з `/pull` — клієнт не реплеїть власні writes.
 */

export const SYNC_V2_STREAM_HEARTBEAT_MS = 25_000;
export const SYNC_V2_STREAM_REPLAY_LIMIT = 500;
/**
 * sec-09: максимальний вік одного зʼєднання. Після нього сервер закриває
 * стрім сам; клієнт перепідключається з `Last-Event-ID` і проходить
 * handshake (`requireSession`) заново.
 */
export const SYNC_V2_STREAM_MAX_AGE_MS = 15 * 60_000;
/**
 * sec-09: ліміт одночасних стрімів на користувача (кілька вкладок/пристроїв
 * законні, безмежна кількість - ні). Новий стрім витісняє НАЙСТАРІШИЙ.
 */
export const SYNC_V2_STREAM_MAX_PER_USER = 3;

/** Чому сервер закрив стрім; іде клієнту в `event: closed` (best-effort). */
export type SyncV2StreamCloseReason =
  "max_age" | "session_revoked" | "session_check_failed" | "evicted";

type WithSessionUser = Request & { user?: { id: string } };

interface StreamHandle {
  close(reason: SyncV2StreamCloseReason): void;
}

/**
 * Реєстр відкритих стрімів по користувачу (in-process, як і `opLogEmitter`).
 * `Set` зберігає порядок вставки, тож перший елемент - найстаріший стрім.
 */
const streamsByUser = new Map<string, Set<StreamHandle>>();

function registerStream(userId: string, handle: StreamHandle): void {
  const set = streamsByUser.get(userId) ?? new Set<StreamHandle>();
  while (set.size >= SYNC_V2_STREAM_MAX_PER_USER) {
    const oldest = set.values().next().value;
    if (!oldest) break;
    // Видаляємо ДО close(): стрім, що ще в replay, не встиг підписатись і
    // сам себе з реєстру не прибере - цикл інакше крутився б вічно.
    set.delete(oldest);
    oldest.close("evicted");
  }
  set.add(handle);
  // Після циклу: cleanup витісненого міг прибрати порожній запис з мапи.
  streamsByUser.set(userId, set);
}

/** Лише для тестів: стріми, що не закрились між кейсами, не мають текти в наступні. */
export const __testingResetSyncV2StreamRegistry = (): void => {
  streamsByUser.clear();
};

function unregisterStream(userId: string, handle: StreamHandle): void {
  const set = streamsByUser.get(userId);
  if (!set) return;
  set.delete(handle);
  if (set.size === 0) streamsByUser.delete(userId);
}

/**
 * sec-09: перевірка сесії НАЖИВО, в обхід 5-хвилинного `cookieCache`
 * (`getFreshSessionUser` - один SELECT). `requireSession()` резолвить сесію
 * лише на handshake, тож без цього logout / revoke-sessions / зміна пароля
 * не закривали вже відкритий стрім.
 *
 * `auth.js` імпортується ліниво, на першому heartbeat: статичний імпорт
 * тягнув би весь Better Auth (і пул БД) у кожен модуль, що імпортує
 * `notifySyncV2OpsApplied` (push-хендлер, його тести).
 */
async function checkStreamSession(
  req: Request,
  userId: string,
): Promise<"ok" | SyncV2StreamCloseReason> {
  try {
    const { getFreshSessionUser } = await import("../../auth.js");
    const current = await getFreshSessionUser(req);
    return current && current.id === userId ? "ok" : "session_revoked";
  } catch (err: unknown) {
    // Fail-closed: стрім несе чутливі дані, а клієнт перепідключається сам.
    try {
      logger.warn({
        msg: "sync_v2_stream_session_check_failed",
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* logging must never break a request */
    }
    return "session_check_failed";
  }
}

/**
 * Public shape SSE-події `op`. Дзеркалить response.ops[] із `/pull`,
 * тому existing api-client типи можна reuse-нути 1:1.
 *
 * `op` включає `'increment'` після PR #042a (PN-counter scaffolding):
 * під час самого PR жоден increment не доходить до applied-стану
 * (engine-gate ловить його з `op_not_supported`), але type lines up із
 * `SyncV2OpKind` із `@sergeant/api-client`, щоб PR #042b міг ввімкнути
 * apply-fn без додаткового rev-у на цьому шарі.
 */
export interface SyncV2StreamOp {
  id: number;
  table: string;
  op: "insert" | "update" | "delete" | "increment";
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
 *
 * AI-DANGER: живі кадри НЕ проходять вотермарк `SYNC_OP_LOG_COMMITTED_WATERMARK_SQL`.
 * Вони йдуть у порядку коміту з `op.id` як SSE event id, а серверні оп-и
 * (`serverOpLog.ts`, імпорт виписки) сюди не потрапляють узагалі. Клієнт,
 * що візьме `Last-Event-ID` як курсор pull, перескочить оп-и довгої
 * транзакції назавжди. Споживач (Фаза 3, `sync-client-wiring.md`) мусить
 * трактувати живий кадр як сигнал «зроби pull», а не як просування курсора.
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
    row: decryptOpRowForPull(r.table_name, r.row),
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
  // активність і не закриває idle-зʼєднання.
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

  let parsed: { since: number; limit: number };
  try {
    parsed = parseQuery(SyncV2PullSchema, req);
  } catch (err) {
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
    throw err;
  }
  const lastEventId = readLastEventId(req);
  const since = lastEventId != null ? lastEventId : parsed.since;
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

  // 0. Реєстр одночасних стрімів (sec-09). Реєструємось ДО replay: інакше
  //    паралельні конекти проскочили б ліміт, поки чекають SELECT. Якщо нас
  //    витіснили, поки `liveClose` ще не заданий (йде replay), лише
  //    запамʼятовуємо причину - replay перевірить її після `await`.
  //    (Обʼєкт, а не `let`: TS не бачить присвоєнь із замикань і звузив би
  //    `let x = null` до `null`.)
  const closing: {
    reason: SyncV2StreamCloseReason | null;
    live: ((reason: SyncV2StreamCloseReason) => void) | null;
  } = { reason: null, live: null };
  const handle: StreamHandle = {
    close(reason) {
      if (closing.live) closing.live(reason);
      else closing.reason ??= reason;
    },
  };
  registerStream(user.id, handle);

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
          AND (tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot()))
        ORDER BY id ASC
        LIMIT $4`,
      [user.id, since, originDeviceId, SYNC_V2_STREAM_REPLAY_LIMIT],
    );
    // Витіснено під час replay: даних не пишемо, закриваємо нижче.
    if (closing.reason === null) {
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
    }
  } catch (err: unknown) {
    unregisterStream(user.id, handle);
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
  //
  //    sec-09: той самий тік перевіряє сесію в БД. Стрім без живої сесії
  //    закривається на наступному heartbeat (до 25 с після sign-out/revoke).
  let cleanedUp = false;
  let sessionCheckInFlight = false;
  const heartbeatTimer = setInterval(() => {
    if (res.writableEnded || cleanedUp) return;
    try {
      res.write(formatSseHeartbeat());
    } catch {
      /* socket може бути в half-closed; cleanup нижче */
    }
    // Не накопичуємо перевірки, якщо БД відповідає повільніше за тік.
    if (sessionCheckInFlight) return;
    sessionCheckInFlight = true;
    void checkStreamSession(req, user.id)
      .then((verdict) => {
        if (verdict !== "ok") closeStream(verdict);
      })
      .finally(() => {
        sessionCheckInFlight = false;
      });
  }, SYNC_V2_STREAM_HEARTBEAT_MS);
  if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();

  // sec-09: жорстка стеля віку зʼєднання, незалежно від сесії.
  const maxAgeTimer = setTimeout(
    () => closeStream("max_age"),
    SYNC_V2_STREAM_MAX_AGE_MS,
  );
  if (typeof maxAgeTimer.unref === "function") maxAgeTimer.unref();

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeatTimer);
    clearTimeout(maxAgeTimer);
    unregisterStream(user.id, handle);
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
  // Серверне закриття: best-effort кадр `closed` (клієнт може не
  // перепідключатись на `session_revoked`), далі той самий cleanup.
  const closeStream = (reason: SyncV2StreamCloseReason): void => {
    if (cleanedUp) return;
    try {
      if (!res.writableEnded) res.write(formatSseFrame("closed", { reason }));
    } catch {
      /* socket вже мертвий - cleanup однаково закриє res */
    }
    try {
      logger.info({
        msg: "sync_v2_stream_server_closed",
        userId: user.id,
        reason,
      });
    } catch {
      /* logging must never break a request */
    }
    cleanup();
  };
  closing.live = closeStream;

  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);

  // Клієнт міг відвалитись, поки йшов replay (події `close` ми ще не
  // слухали), або нас витіснили в тому ж вікні.
  if (closing.reason !== null) closeStream(closing.reason);
  else if (res.destroyed) cleanup();
}
