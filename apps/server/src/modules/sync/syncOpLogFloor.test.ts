// Нижня межа журналу в pull (ADR-0105 §3.2, міграція 166, аудит `rel-06`).
// Юніт-лейн на моку пулу: межа приходить у тому ж запиті, що й сторінка
// (`fl LEFT JOIN sized`), тож порожня сторінка - один рядок з `id = null`.
// Живий лейн - `syncV2Snapshot.integration.test.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../db.js", () => {
  const pool = { query: vi.fn(), connect: vi.fn() };
  return { default: pool, pool };
});

import _pool from "../../db.js";
import { syncV2Pull } from "./syncV2Pull.js";
import { SyncCursorExpiredError, isCursorExpired } from "./syncOpLogFloor.js";

const pool = _pool as unknown as { query: Mock };

function makeReq(since: number): Request {
  return {
    query: { since: String(since) },
    headers: { "x-origin-device-id": "dev-1" },
    user: { id: "u_1" },
  } as unknown as Request;
}

function makeRes(): Response & { body?: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { body?: unknown };
}

const ts = new Date("2026-10-01T00:00:00.000Z");
function opRow(id: string, floor: string | null) {
  return {
    floor_id: floor,
    id,
    table_name: "routine_entries",
    op: "insert",
    row: { id },
    client_ts: ts,
    server_ts: ts,
    origin_device_id: null,
    row_bytes: 10,
    next_id: null,
  };
}
function emptyRow(floor: string) {
  return {
    ...opRow("x", floor),
    id: null,
    table_name: null,
    row: null,
    client_ts: null,
    server_ts: null,
  };
}

beforeEach(() => {
  pool.query.mockReset();
  // Другий виклик - audit-insert у `recordSyncV2`.
  pool.query.mockResolvedValue({ rows: [] });
});

describe("isCursorExpired", () => {
  it("лише ненульова межа вище за since", () => {
    expect(isCursorExpired(0, 0)).toBe(false);
    expect(isCursorExpired(5, 5)).toBe(false);
    expect(isCursorExpired(6, 5)).toBe(false);
    expect(isCursorExpired(4, 5)).toBe(true);
    expect(isCursorExpired(0, 5)).toBe(true);
  });
});

describe("syncV2Pull · нижня межа журналу", () => {
  it("межі немає (floor 0) і порожня сторінка -> 200, ops = []", async () => {
    pool.query.mockResolvedValueOnce({ rows: [emptyRow("0")] });
    const res = makeRes();
    await syncV2Pull(makeReq(0), res);
    expect(res.body).toEqual({ ops: [], next_cursor: null });
    expect(pool.query.mock.calls[0]![0]).toContain("sync_op_log_floor");
  });

  it("floor 0 -> сторінка як раніше, з bigint -> number", async () => {
    pool.query.mockResolvedValueOnce({ rows: [opRow("7", "0")] });
    const res = makeRes();
    await syncV2Pull(makeReq(0), res);
    expect(res.body).toMatchObject({ ops: [{ id: 7 }], next_cursor: null });
  });

  it("since < floor_id -> 410 sync_cursor_expired з floor_id у details", async () => {
    pool.query.mockResolvedValueOnce({ rows: [emptyRow("100")] });
    const err = await syncV2Pull(makeReq(50), makeRes()).catch((e) => e);
    expect(err).toBeInstanceOf(SyncCursorExpiredError);
    expect(err).toMatchObject({
      status: 410,
      code: "sync_cursor_expired",
      floorId: 100,
      cause: { details: [{ floor_id: 100 }] },
    });
  });

  it("since = floor_id -> 200", async () => {
    pool.query.mockResolvedValueOnce({ rows: [opRow("101", "100")] });
    const res = makeRes();
    await syncV2Pull(makeReq(100), res);
    expect(res.body).toMatchObject({ ops: [{ id: 101 }] });
  });
});
