/**
 * Handler-level тести для `syncV2Stream` — запускаються у звичайному
 * `pnpm test` (без Postgres-testcontainers). Mock-аємо `pool.query`
 * з canned-результатами; перевіряємо повний SSE-handshake, replay,
 * live-fan-out, heartbeat, та cleanup на close.
 *
 * Чому окремий файл (а не разом із `syncV2Stream.test.ts`):
 * `vi.mock` повинен бути top-level до імпорту тестованого модуля,
 * і ми мокаємо `pool.query` тільки для handler-тестів. Pure unit-
 * тести wire-format-у (`formatSseFrame`, emitter) у `syncV2Stream.test.ts`
 * не залежать від `pool` і живуть без mock-у.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { Request, Response } from "express";

vi.mock("../../db.js", () => {
  const pool = { query: vi.fn() };
  return { default: pool, pool };
});

vi.mock("../../obs/logger.js", async () => {
  const actual = await vi.importActual("../../obs/logger.js");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

vi.mock("../../obs/metrics.js", () => ({
  syncDurationMs: { observe: vi.fn() },
  syncOperationsTotal: { inc: vi.fn() },
  syncPayloadBytes: { observe: vi.fn() },
  syncStreamConnectionsActive: { inc: vi.fn(), dec: vi.fn() },
}));

// sec-09: heartbeat перевіряє сесію через `getFreshSessionUser` (ліниво
// імпортований `auth.js`). Мокаємо лише його: справжній Better Auth тут не
// потрібен, а вердикт («сесія жива / відкликана») задає кожен тест.
vi.mock("../../auth.js", () => ({ getFreshSessionUser: vi.fn() }));

import _pool from "../../db.js";
import { getFreshSessionUser as _getFreshSessionUser } from "../../auth.js";
import {
  __testingResetSyncV2StreamRegistry,
  notifySyncV2OpsApplied,
  opLogEmitter,
  syncV2Stream,
  SYNC_V2_STREAM_HEARTBEAT_MS,
  SYNC_V2_STREAM_MAX_AGE_MS,
  SYNC_V2_STREAM_MAX_PER_USER,
  SYNC_V2_STREAM_REPLAY_LIMIT,
  type SyncV2StreamOp,
} from "./syncV2Stream.js";
import { SYNC_OP_LOG_COMMITTED_WATERMARK_SQL } from "./syncV2-core.js";

const pool = _pool as unknown as { query: Mock };
const getFreshSessionUser = _getFreshSessionUser as unknown as Mock;

interface FakeRes {
  statusCode: number;
  headers: Map<string, string>;
  writes: string[];
  ended: boolean;
  writableEnded: boolean;
  flushHeadersCalled: boolean;
  closeListeners: Array<() => void>;
}

interface FakeReq {
  headers: Record<string, string>;
  query: Record<string, string>;
  closeListeners: Array<() => void>;
  user: { id: string };
}

function makeRes(): FakeRes & Response {
  const res = {
    statusCode: 200,
    headers: new Map<string, string>(),
    writes: [] as string[],
    ended: false,
    writableEnded: false,
    flushHeadersCalled: false,
    closeListeners: [] as Array<() => void>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers.set(name.toLowerCase(), value);
      return res;
    },
    flushHeaders() {
      res.flushHeadersCalled = true;
    },
    write(chunk: string) {
      res.writes.push(chunk);
      return true;
    },
    end() {
      res.ended = true;
      res.writableEnded = true;
      return res;
    },
    on(event: string, listener: () => void) {
      if (event === "close") res.closeListeners.push(listener);
      return res;
    },
  };
  return res as unknown as FakeRes & Response;
}

function makeReq(opts: {
  userId: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): FakeReq & Request {
  const req = {
    headers: opts.headers ?? {},
    query: opts.query ?? {},
    closeListeners: [] as Array<() => void>,
    user: { id: opts.userId },
    on(event: string, listener: () => void) {
      if (event === "close" || event === "aborted") {
        req.closeListeners.push(listener);
      }
      return req;
    },
  };
  return req as unknown as FakeReq & Request;
}

function fireClose(req: FakeReq): void {
  for (const fn of req.closeListeners) fn();
}

const SAMPLE_DB_ROW = {
  id: "42",
  table_name: "routine_entries",
  op: "insert",
  row: { id: "abc", title: "Meditate" },
  client_ts: new Date("2026-05-04T10:00:00.000Z"),
  server_ts: new Date("2026-05-04T10:00:00.500Z"),
  origin_device_id: "device-A",
};

beforeEach(() => {
  pool.query.mockReset();
  opLogEmitter.removeAllListeners();
  __testingResetSyncV2StreamRegistry();
  // За замовчуванням сесія жива: повертаємо того самого юзера, що в req.
  getFreshSessionUser.mockReset();
  getFreshSessionUser.mockImplementation(async (req: FakeReq) => req.user);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  opLogEmitter.removeAllListeners();
});

describe("syncV2Stream handler — handshake & replay", () => {
  it("sets correct SSE headers and flushes them eagerly", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ userId: "u1" }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.flushHeadersCalled).toBe(true);
  });

  it("emits hello with `since` and replay_limit, then caught_up after replay", async () => {
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_DB_ROW] });
    const req = makeReq({
      userId: "u1",
      query: { since: "10" },
    }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);

    expect(res.writes[0]).toContain('event: hello\ndata: {"since":10');
    expect(res.writes[0]).toContain(
      `"replay_limit":${SYNC_V2_STREAM_REPLAY_LIMIT}`,
    );

    expect(res.writes[1]).toContain("id: 42\nevent: op\n");
    expect(res.writes[1]).toContain('"id":42');
    expect(res.writes[1]).toContain('"table":"routine_entries"');

    expect(res.writes[2]).toContain(
      `event: caught_up\ndata: {"last_id":42,"truncated":false}`,
    );
  });

  it("marks `truncated:true` when backlog hits the replay cap", async () => {
    const rows = Array.from(
      { length: SYNC_V2_STREAM_REPLAY_LIMIT },
      (_, i) => ({
        ...SAMPLE_DB_ROW,
        id: String(i + 1),
      }),
    );
    pool.query.mockResolvedValueOnce({ rows });
    const req = makeReq({ userId: "u1" }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);

    const caughtUpFrame = res.writes[res.writes.length - 1];
    expect(caughtUpFrame).toContain('"truncated":true');
    expect(caughtUpFrame).toContain(`"last_id":${SYNC_V2_STREAM_REPLAY_LIMIT}`);
  });

  it("Last-Event-ID overrides ?since= (resume beats bookmark)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({
      userId: "u1",
      query: { since: "10" },
      headers: { "last-event-id": "999" },
    }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);

    // Pool query 2nd argument has the resolved cursor at index 1.
    const args = pool!.query.mock.calls[0]![1] as unknown[];
    expect(args[1]).toBe(999);
    expect(res.writes[0]).toContain('"since":999');
    // Replay — такий самий читач курсором, як /pull: без вотермарку
    // Last-Event-ID перескакує оп-и довгої транзакції (міграція 147).
    expect(pool!.query.mock.calls[0]![0]).toContain(
      SYNC_OP_LOG_COMMITTED_WATERMARK_SQL,
    );
  });

  it("ignores malformed Last-Event-ID and falls back to ?since=", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({
      userId: "u1",
      query: { since: "10" },
      headers: { "last-event-id": "garbage" },
    }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);
    const args = pool!.query.mock.calls[0]![1] as unknown[];
    expect(args[1]).toBe(10);
  });

  it("propagates X-Origin-Device-Id to the SQL filter", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({
      userId: "u1",
      headers: { "x-origin-device-id": "device-B" },
    }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);
    const args = pool!.query.mock.calls[0]![1] as unknown[];
    expect(args[2]).toBe("device-B");
  });

  it("ends the response cleanly when DB query fails", async () => {
    pool.query.mockRejectedValueOnce(new Error("db down"));
    const req = makeReq({ userId: "u1" }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);

    expect(res.ended).toBe(true);
    // No frames should have been written (hello block sits inside try).
    expect(res.writes.length).toBe(0);
  });
});

describe("syncV2Stream handler — live emit & heartbeat", () => {
  it("writes live ops as SSE frames when emitter fires", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ userId: "u1" }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);
    const beforeLive = res.writes.length;

    const liveOp: SyncV2StreamOp = {
      id: 100,
      table: "routine_entries",
      op: "update",
      row: { id: "abc", title: "Updated" },
      client_ts: "2026-05-04T11:00:00.000Z",
      server_ts: "2026-05-04T11:00:00.250Z",
      origin_device_id: null,
    };
    notifySyncV2OpsApplied("u1", [liveOp]);

    expect(res.writes.length).toBe(beforeLive + 1);
    const liveFrame = res.writes[beforeLive];
    expect(liveFrame).toContain("id: 100\nevent: op\n");
    expect(liveFrame).toContain('"id":100');
  });

  it("filters out live ops that match X-Origin-Device-Id (own-write echo suppression)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({
      userId: "u1",
      headers: { "x-origin-device-id": "device-A" },
    }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);
    const beforeLive = res.writes.length;

    notifySyncV2OpsApplied("u1", [
      {
        id: 100,
        table: "routine_entries",
        op: "update",
        row: {},
        client_ts: "2026-05-04T11:00:00.000Z",
        server_ts: "2026-05-04T11:00:00.250Z",
        origin_device_id: "device-A",
      },
      {
        id: 101,
        table: "routine_entries",
        op: "update",
        row: {},
        client_ts: "2026-05-04T11:00:01.000Z",
        server_ts: "2026-05-04T11:00:01.250Z",
        origin_device_id: "device-B",
      },
    ]);

    expect(res.writes.length).toBe(beforeLive + 1);
    expect(res.writes[beforeLive]).toContain("id: 101\n");
  });

  it("emits heartbeat comment after SYNC_V2_STREAM_HEARTBEAT_MS", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ userId: "u1" }) as unknown as FakeReq & Request;
    const res = makeRes() as unknown as FakeRes & Response;

    await syncV2Stream(req as Request, res as Response);
    const beforeHb = res.writes.length;

    vi.advanceTimersByTime(SYNC_V2_STREAM_HEARTBEAT_MS);
    expect(res.writes[beforeHb]).toBe(": heartbeat\n\n");

    vi.advanceTimersByTime(SYNC_V2_STREAM_HEARTBEAT_MS);
    expect(res.writes[beforeHb + 1]).toBe(": heartbeat\n\n");
  });

  it("cleans up listeners and timers on req close", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ userId: "u1" });
    const res = makeRes();

    await syncV2Stream(req as Request, res as Response);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(1);

    fireClose(req);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(0);
    expect(res.ended).toBe(true);

    // After close, further notify-calls must not write to the closed res.
    const before = res.writes.length;
    notifySyncV2OpsApplied("u1", [
      {
        id: 1,
        table: "routine_entries",
        op: "insert",
        row: {},
        client_ts: "2026-05-04T11:00:00.000Z",
        server_ts: "2026-05-04T11:00:00.250Z",
        origin_device_id: null,
      },
    ]);
    expect(res.writes.length).toBe(before);

    // Heartbeat timer also stopped.
    vi.advanceTimersByTime(SYNC_V2_STREAM_HEARTBEAT_MS * 2);
    expect(res.writes.length).toBe(before);
  });

  it("supports multi-tab fan-out for the same user", async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const tab1Req = makeReq({ userId: "u1" });
    const tab1Res = makeRes();
    const tab2Req = makeReq({ userId: "u1" });
    const tab2Res = makeRes();

    await syncV2Stream(tab1Req as Request, tab1Res as Response);
    await syncV2Stream(tab2Req as Request, tab2Res as Response);

    const before1 = tab1Res.writes.length;
    const before2 = tab2Res.writes.length;
    notifySyncV2OpsApplied("u1", [
      {
        id: 1,
        table: "routine_entries",
        op: "insert",
        row: {},
        client_ts: "2026-05-04T11:00:00.000Z",
        server_ts: "2026-05-04T11:00:00.250Z",
        origin_device_id: null,
      },
    ]);

    expect(tab1Res.writes.length).toBe(before1 + 1);
    expect(tab2Res.writes.length).toBe(before2 + 1);
  });
});

// ───────────────────────── sec-09: сесія, вік, ліміт ─────────────────────────

describe("syncV2Stream handler — sec-09 session / max-age / per-user cap", () => {
  const closedFrame = (res: FakeRes, reason: string): boolean =>
    res.writes.some(
      (w) => w.includes("event: closed") && w.includes(`"reason":"${reason}"`),
    );

  async function open(userId: string): Promise<{
    req: FakeReq & Request;
    res: FakeRes & Response;
  }> {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ userId });
    const res = makeRes();
    await syncV2Stream(req as Request, res as Response);
    return { req, res };
  }

  it("keeps the stream open while the session is alive and re-checks it from DB on every heartbeat", async () => {
    const { req, res } = await open("u1");

    await vi.advanceTimersByTimeAsync(SYNC_V2_STREAM_HEARTBEAT_MS * 3);

    expect(res.ended).toBe(false);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(1);
    expect(getFreshSessionUser).toHaveBeenCalledTimes(3);
    expect(getFreshSessionUser).toHaveBeenCalledWith(req);
  });

  it("closes the stream on the next heartbeat after the session is revoked", async () => {
    const { res } = await open("u1");
    getFreshSessionUser.mockResolvedValue(null); // sign-out / revoke-sessions

    // Поки heartbeat не тікнув, стрім ще живий: вікно закриття = один тік.
    expect(res.ended).toBe(false);
    await vi.advanceTimersByTimeAsync(SYNC_V2_STREAM_HEARTBEAT_MS);

    expect(res.ended).toBe(true);
    expect(closedFrame(res, "session_revoked")).toBe(true);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(0);

    // Після закриття live-ops у відкликаний стрім більше не летять.
    const before = res.writes.length;
    notifySyncV2OpsApplied("u1", [
      {
        id: 7,
        table: "routine_entries",
        op: "insert",
        row: {},
        client_ts: "2026-05-04T11:00:00.000Z",
        server_ts: "2026-05-04T11:00:00.250Z",
        origin_device_id: null,
      },
    ]);
    expect(res.writes.length).toBe(before);
  });

  it("closes the stream when the cookie now resolves to a different user", async () => {
    const { res } = await open("u1");
    getFreshSessionUser.mockResolvedValue({ id: "someone-else" });

    await vi.advanceTimersByTimeAsync(SYNC_V2_STREAM_HEARTBEAT_MS);

    expect(res.ended).toBe(true);
    expect(closedFrame(res, "session_revoked")).toBe(true);
  });

  it("fails closed when the session lookup throws", async () => {
    const { res } = await open("u1");
    getFreshSessionUser.mockRejectedValue(new Error("db down"));

    await vi.advanceTimersByTimeAsync(SYNC_V2_STREAM_HEARTBEAT_MS);

    expect(res.ended).toBe(true);
    expect(closedFrame(res, "session_check_failed")).toBe(true);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(0);
  });

  it("closes the stream at SYNC_V2_STREAM_MAX_AGE_MS even if the session stays valid", async () => {
    const { res } = await open("u1");

    await vi.advanceTimersByTimeAsync(SYNC_V2_STREAM_MAX_AGE_MS - 1_000);
    expect(res.ended).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(res.ended).toBe(true);
    expect(closedFrame(res, "max_age")).toBe(true);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(0);
  });

  it("evicts the OLDEST stream when a user opens more than SYNC_V2_STREAM_MAX_PER_USER", async () => {
    expect(SYNC_V2_STREAM_MAX_PER_USER).toBe(3);
    const first = await open("u1");
    const second = await open("u1");
    const third = await open("u1");
    const other = await open("u2");
    expect(opLogEmitter.listenerCount("user:u1")).toBe(3);

    const fourth = await open("u1");

    expect(first.res.ended).toBe(true);
    expect(closedFrame(first.res, "evicted")).toBe(true);
    expect(second.res.ended).toBe(false);
    expect(third.res.ended).toBe(false);
    expect(fourth.res.ended).toBe(false);
    expect(other.res.ended).toBe(false);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(3);

    // П'ятий витісняє вже другого (наступного за віком).
    await open("u1");
    expect(second.res.ended).toBe(true);
    expect(third.res.ended).toBe(false);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(3);
  });

  it("frees a slot when a stream closes normally (no phantom eviction)", async () => {
    const a = await open("u1");
    const b = await open("u1");
    const c = await open("u1");
    fireClose(a.req);

    const d = await open("u1");

    expect(b.res.ended).toBe(false);
    expect(c.res.ended).toBe(false);
    expect(d.res.ended).toBe(false);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(3);
  });

  it("evicts a stream that is still replaying without writing data to it", async () => {
    let resolveFirst: (v: { rows: unknown[] }) => void = () => undefined;
    pool.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const slowReq = makeReq({ userId: "u1" });
    const slowRes = makeRes();
    const slow = syncV2Stream(slowReq as Request, slowRes as Response);

    await open("u1");
    await open("u1");
    await open("u1"); // 4-й: витісняє `slow`, що ще чекає SELECT

    resolveFirst({ rows: [SAMPLE_DB_ROW] });
    await slow;

    expect(slowRes.ended).toBe(true);
    expect(slowRes.writes.some((w) => w.includes("event: op"))).toBe(false);
    expect(closedFrame(slowRes, "evicted")).toBe(true);
    expect(opLogEmitter.listenerCount("user:u1")).toBe(3);
  });
});
