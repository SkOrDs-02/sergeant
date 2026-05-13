import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../db.js", () => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(),
  };
  return { default: pool, pool, __client: client };
});

vi.mock("./syncV2Stream.js", () => ({
  notifySyncV2OpsApplied: vi.fn(),
}));

import _pool from "../../db.js";
import {
  APPLY_REJECT_REASONS,
  ENGINE_REJECT_REASONS,
  INCREMENT_OP_SUPPORTED_TABLES,
  SYNC_V2_SUPPORTED_TABLES,
  syncV2Pull,
  syncV2Push,
} from "./syncV2.js";
import { notifySyncV2OpsApplied as _notify } from "./syncV2Stream.js";

interface PoolStub {
  connect: Mock;
  query: Mock;
}
interface ClientStub {
  query: Mock;
  release: Mock;
}

const pool = _pool as unknown as PoolStub;
// Кешуємо посилання на client-stub, який повертає `pool.connect()` за замовчуванням.
const dbModule = (await import("../../db.js")) as unknown as {
  __client: ClientStub;
};
const client = dbModule.__client;
const notify = _notify as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

interface ReqInit {
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string | undefined>;
  userId?: string;
}

function makeReq({
  body,
  query,
  headers,
  userId = "u_1",
}: ReqInit = {}): Request {
  return {
    body: body ?? {},
    query: query ?? {},
    headers: headers ?? {},
    user: { id: userId },
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  pool.connect.mockResolvedValue(client);
  client.query.mockReset();
  client.release.mockReset();
  notify.mockReset();
});

// ────────────────────────────────────────────────────────────────────────────
// Constants — стабільність контракту, який споживається метриками,
// дашбордами та документацією (`docs/observability/metrics.md`).
// ────────────────────────────────────────────────────────────────────────────

describe("APPLY_REJECT_REASONS / ENGINE_REJECT_REASONS — frozen contract", () => {
  it("APPLY_REJECT_REASONS — як `as const`-масив зі стабільним початком", () => {
    expect(Array.isArray(APPLY_REJECT_REASONS)).toBe(true);
    // Sentinel-літерали з документації — якщо хтось перейменує, тест червоніє.
    expect(APPLY_REJECT_REASONS).toContain("lww_conflict");
    expect(APPLY_REJECT_REASONS).toContain("tombstoned");
    expect(APPLY_REJECT_REASONS).toContain("user_id_mismatch");
    expect(APPLY_REJECT_REASONS).toContain("missing_id");
    expect(APPLY_REJECT_REASONS).toContain("invalid_delta"); // PR #042b
  });

  it("APPLY_REJECT_REASONS — без дублікатів", () => {
    const set = new Set(APPLY_REJECT_REASONS);
    expect(set.size).toBe(APPLY_REJECT_REASONS.length);
  });

  it("ENGINE_REJECT_REASONS містить engine-only причини", () => {
    expect(ENGINE_REJECT_REASONS).toEqual(
      expect.arrayContaining([
        "clock_skew",
        "table_not_allowed",
        "apply_failed",
        "duplicate",
        "op_not_supported",
      ]),
    );
  });

  it("APPLY ↔ ENGINE — диз'юнктивні множини (жодного перетину)", () => {
    const apply = new Set<string>(APPLY_REJECT_REASONS);
    for (const r of ENGINE_REJECT_REASONS) {
      expect(apply.has(r)).toBe(false);
    }
  });
});

describe("INCREMENT_OP_SUPPORTED_TABLES / SYNC_V2_SUPPORTED_TABLES", () => {
  it("INCREMENT — Set із гарантованим routine_streaks (PR #042b)", () => {
    expect(INCREMENT_OP_SUPPORTED_TABLES).toBeInstanceOf(Set);
    expect(INCREMENT_OP_SUPPORTED_TABLES.has("routine_streaks")).toBe(true);
  });

  it("SYNC_V2_SUPPORTED_TABLES — frozen-масив із core whitelist", () => {
    expect(Object.isFrozen(SYNC_V2_SUPPORTED_TABLES)).toBe(true);
    expect(SYNC_V2_SUPPORTED_TABLES).toEqual(
      expect.arrayContaining([
        "routine_entries",
        "routine_streaks",
        "fizruk_workouts",
        "nutrition_meals",
        "finyk_budgets",
      ]),
    );
  });

  it("INCREMENT-whitelist — підмножина SYNC_V2_SUPPORTED_TABLES", () => {
    const all = new Set(SYNC_V2_SUPPORTED_TABLES);
    for (const t of INCREMENT_OP_SUPPORTED_TABLES) {
      expect(all.has(t)).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// syncV2Push — early-exit / validation (без DB-пути)
// ────────────────────────────────────────────────────────────────────────────

describe("syncV2Push · validation gate", () => {
  it("400 на порожній body → pool.connect не викликається", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await syncV2Push(req, res);
    expect(res.statusCode).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("400 на пустий ops-масив (schema min(1))", async () => {
    const req = makeReq({ body: { ops: [] } });
    const res = makeRes();
    await syncV2Push(req, res);
    expect(res.statusCode).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("400 на op без обов'язкового поля", async () => {
    const req = makeReq({
      body: {
        ops: [
          {
            // table missing
            op: "insert",
            row: {},
            client_ts: "2026-01-01T00:00:00.000Z",
            idempotency_key: "k1",
          },
        ],
      },
    });
    const res = makeRes();
    await syncV2Push(req, res);
    expect(res.statusCode).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// syncV2Push — duplicate-only batch (idempotency replay)
// ────────────────────────────────────────────────────────────────────────────

describe("syncV2Push · idempotency replay (duplicate-only)", () => {
  function validOp(idempotency_key: string) {
    return {
      table: "routine_entries",
      op: "insert" as const,
      row: { id: "x" },
      client_ts: "2026-01-01T00:00:00.000Z",
      idempotency_key,
    };
  }

  it("батч із лише duplicate ops → повертає кешовані статуси, без INSERT", async () => {
    // BEGIN, потім дві SELECT-и, що повертають duplicate-rows, потім COMMIT.
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "11", status: "applied", reject_reason: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "12", status: "rejected", reject_reason: "lww_conflict" }],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const req = makeReq({
      body: { ops: [validOp("k_a"), validOp("k_b")] },
    });
    const res = makeRes();

    await syncV2Push(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      accepted: number;
      last_op_id: number;
      results: Array<{ status: string; reason?: string }>;
    };
    expect(body.accepted).toBe(1); // одна applied-replay
    expect(body.last_op_id).toBe(12); // bigint→number coerce
    expect(body.results).toEqual([
      { idempotency_key: "k_a", status: "applied" },
      {
        idempotency_key: "k_b",
        status: "rejected",
        reason: "lww_conflict",
      },
    ]);

    // Жодного INSERT INTO sync_op_log не зроблено.
    const insertCalls = client.query.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO sync_op_log"),
    );
    expect(insertCalls.length).toBe(0);

    // SSE-стрім НЕ нотифікується для duplicate-replay (порожній accumulator).
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("u_1", []);

    // client.release() завжди викликається у finally.
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("status='duplicate' (legacy-replay) → reason='duplicate' у відповіді", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "5", status: "duplicate", reject_reason: null }],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const req = makeReq({ body: { ops: [validOp("k_d")] } });
    const res = makeRes();
    await syncV2Push(req, res);
    const body = res.body as { results: Array<{ reason?: string }> };
    expect(body.results[0]!.reason).toBe("duplicate");
  });

  it("транзакція кидає → ROLLBACK + release + throw наверх", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("DB exploded")) // SELECT fails
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const req = makeReq({ body: { ops: [validOp("k_x")] } });
    const res = makeRes();

    await expect(syncV2Push(req, res)).rejects.toThrow("DB exploded");

    // ROLLBACK та release обидва викликались.
    const rollbackCalls = client.query.mock.calls.filter(
      (c) => c[0] === "ROLLBACK",
    );
    expect(rollbackCalls.length).toBe(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    // notifySyncV2OpsApplied НЕ викликається на failed-COMMIT.
    expect(notify).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// syncV2Pull
// ────────────────────────────────────────────────────────────────────────────

describe("syncV2Pull · validation", () => {
  it("400 на нечислове since → pool.query не викликається", async () => {
    const req = makeReq({ query: { since: "garbage" } });
    const res = makeRes();
    await syncV2Pull(req, res);
    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("400 на limit > MAX_LIMIT (500)", async () => {
    const req = makeReq({ query: { limit: "9999" } });
    const res = makeRes();
    await syncV2Pull(req, res);
    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("syncV2Pull · happy-path", () => {
  it("порожній результат → ops=[], next_cursor=null, default since=0/limit=100", async () => {
    // 1-й query — read; 2-й — audit insert у recordSyncV2.
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await syncV2Pull(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ops: [], next_cursor: null });

    // Перший виклик — читання sync_op_log (контракт цього тесту).
    const args = pool.query.mock.calls[0]![1] as unknown[];
    expect(args[0]).toBe("u_1");
    expect(args[1]).toBe(0); // default since
    expect(args[2]).toBeNull(); // origin device id missing
    expect(args[3]).toBe(100); // default limit
  });

  it("BIGINT id → number; ISO для timestamps; X-Origin-Device-Id як 3-й параметр", async () => {
    const ts1 = new Date("2026-01-01T00:00:00.000Z");
    const ts2 = new Date("2026-01-02T00:00:00.000Z");
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "9007199254740993", // bigint as string
          table_name: "routine_entries",
          op: "insert",
          row: { foo: "bar" },
          client_ts: ts1,
          server_ts: ts2,
          origin_device_id: "device-7",
        },
      ],
    });

    const req = makeReq({
      query: { since: "10", limit: "50" },
      headers: { "x-origin-device-id": "  device-A  " },
    });
    const res = makeRes();
    await syncV2Pull(req, res);

    const body = res.body as {
      ops: Array<{
        id: number;
        table: string;
        client_ts: string;
        server_ts: string;
      }>;
      next_cursor: number | null;
    };
    expect(typeof body.ops[0]!.id).toBe("number"); // coerced
    expect(body.ops[0]!.client_ts).toBe(ts1.toISOString());
    expect(body.ops[0]!.server_ts).toBe(ts2.toISOString());
    expect(body.next_cursor).toBeNull(); // 1 row < limit 50

    // Аргументи запиту: trimmed device id (без зовнішніх spaces).
    const args = pool.query.mock.calls[0]![1] as unknown[];
    expect(args[1]).toBe(10);
    expect(args[2]).toBe("device-A");
    expect(args[3]).toBe(50);
  });

  it("результат довжини limit → next_cursor = id останнього", async () => {
    const baseTs = new Date("2026-01-01T00:00:00.000Z");
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "100",
          table_name: "t",
          op: "insert",
          row: {},
          client_ts: baseTs,
          server_ts: baseTs,
          origin_device_id: null,
        },
        {
          id: "101",
          table_name: "t",
          op: "insert",
          row: {},
          client_ts: baseTs,
          server_ts: baseTs,
          origin_device_id: null,
        },
      ],
    });

    const req = makeReq({ query: { limit: "2" } });
    const res = makeRes();
    await syncV2Pull(req, res);
    const body = res.body as { next_cursor: number | null };
    expect(body.next_cursor).toBe(101);
  });

  it("DB-помилка → throw (request errorhandler-у віддасть 500)", async () => {
    pool.query.mockRejectedValueOnce(new Error("PG down"));
    const req = makeReq();
    const res = makeRes();
    await expect(syncV2Pull(req, res)).rejects.toThrow("PG down");
  });

  it("X-Origin-Device-Id зі string-ом > 64 chars обрізається до 64", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const longId = "x".repeat(120);
    const req = makeReq({ headers: { "x-origin-device-id": longId } });
    const res = makeRes();
    await syncV2Pull(req, res);

    const args = pool.query.mock.calls[0]![1] as unknown[];
    expect(typeof args[2]).toBe("string");
    expect((args[2] as string).length).toBe(64);
  });

  it("порожній X-Origin-Device-Id (whitespace-only) → null", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ headers: { "x-origin-device-id": "   " } });
    const res = makeRes();
    await syncV2Pull(req, res);
    const args = pool.query.mock.calls[0]![1] as unknown[];
    expect(args[2]).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// syncV2Push · NULL-origin telemetry (origin-device-id rollout gate)
// ────────────────────────────────────────────────────────────────────────────
//
// Без `X-Origin-Device-Id` сервер кладе у `sync_op_log` row із
// `origin_device_id = NULL`. Pull-filter `WHERE origin_device_id IS
// DISTINCT FROM $3` для $3=NULL відсікає такі рядки повністю (PG:
// `NULL IS DISTINCT FROM NULL` = FALSE) — multi-device convergence
// silently broken. Counter `sync_op_log_null_origin_device_id_total`
// — це observability-gate для регресії, щоб alert спрацьовував
// до того, як клієнти почнуть масово втрачати ops через pull.

describe("syncV2Push · NULL origin-device-id telemetry", () => {
  async function readCounterValue(): Promise<number> {
    const { syncOpLogNullOriginDeviceIdTotal } =
      await import("../../obs/metrics.js");
    const metric = await syncOpLogNullOriginDeviceIdTotal.get();
    const sample = metric.values.find((v) => v.labels?.module === "v2");
    return sample?.value ?? 0;
  }

  function validOp(idempotency_key: string) {
    return {
      table: "routine_entries",
      op: "insert" as const,
      row: { id: "x" },
      client_ts: "2026-01-01T00:00:00.000Z",
      idempotency_key,
    };
  }

  it("не інкрементиться, коли клієнт прислав X-Origin-Device-Id", async () => {
    const before = await readCounterValue();

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "21", status: "applied", reject_reason: null }],
      }) // duplicate-replay (avoid actual INSERT path)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const req = makeReq({
      body: { ops: [validOp("k-with-device")] },
      headers: { "x-origin-device-id": "device-A" },
    });
    const res = makeRes();
    await syncV2Push(req, res);

    const after = await readCounterValue();
    expect(after).toBe(before);
  });

  it("інкрементиться рівно ОДИН раз на push без X-Origin-Device-Id (per-request, не per-op)", async () => {
    const before = await readCounterValue();

    // Two-op push, both routed to duplicate-replay so we don't need
    // to mock the full INSERT path. Counter MUST be +1 (not +2 — the
    // signal is "client misconfigured", not "N ops were dropped"; per-
    // op increments would explode cardinality on a busy push).
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "31", status: "applied", reject_reason: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "32", status: "applied", reject_reason: null }],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const req = makeReq({
      body: { ops: [validOp("k-no-device-1"), validOp("k-no-device-2")] },
      // No `x-origin-device-id` header.
    });
    const res = makeRes();
    await syncV2Push(req, res);

    const after = await readCounterValue();
    expect(after).toBe(before + 1);
  });
});
