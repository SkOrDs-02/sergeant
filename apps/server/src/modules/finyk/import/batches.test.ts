import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../../db.js", () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

import pool from "../../../db.js";
import { deleteImportBatchHandler, getImportBatchHandler } from "./batches.js";

const queryMock = (pool as unknown as { query: Mock }).query;
const connectMock = (pool as unknown as { connect: Mock }).connect;

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
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(id: string, userId = "u1"): Request {
  return { user: { id: userId }, params: { id } } as unknown as Request;
}

const NOW = "2026-01-15T12:35:00.000Z";

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    user_id: "u1",
    source: "bank_statement",
    status: "completed",
    rows_total: 3,
    rows_created: 2,
    rows_linked: 0,
    rows_skipped: 1,
    created_row_ids: ["imp1:abc", "imp1:def"],
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
});

describe("getImportBatchHandler", () => {
  it("400 ValidationError на нечисловий id", async () => {
    await expect(
      getImportBatchHandler(makeReq("abc"), makeRes()),
    ).rejects.toMatchObject({ status: 400 });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("400 ValidationError на id <= 0", async () => {
    await expect(
      getImportBatchHandler(makeReq("0"), makeRes()),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("404 NotFoundError, коли батч не існує / належить іншому користувачу", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      getImportBatchHandler(makeReq("999"), makeRes()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("скоупить SELECT по user_id з сесії, не з довільного джерела", async () => {
    queryMock.mockResolvedValueOnce({ rows: [batchRow()] });
    await getImportBatchHandler(makeReq("1", "session-user"), makeRes());
    expect(queryMock.mock.calls[0]?.[1]).toEqual([1, "session-user"]);
  });

  it("happy path: коерсує bigint id у number, серіалізує createdRowIds", async () => {
    queryMock.mockResolvedValueOnce({ rows: [batchRow()] });
    const res = makeRes();
    await getImportBatchHandler(makeReq("1"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { batch: Record<string, unknown> };
    expect(body.batch["id"]).toBe(1);
    expect(typeof body.batch["id"]).toBe("number");
    expect(body.batch["status"]).toBe("completed");
    expect(body.batch["rowsTotal"]).toBe(3);
    expect(body.batch["rowsCreated"]).toBe(2);
    expect(body.batch["rowsLinked"]).toBe(0);
    expect(body.batch["rowsSkipped"]).toBe(1);
    expect(body.batch["createdRowIds"]).toEqual(["imp1:abc", "imp1:def"]);
  });
});

const DELETED_AT = new Date("2026-01-16T09:00:00.000Z");

/** Результат tombstone-UPDATE-у: `RETURNING id, deleted_at` живить
 * емісію delete-опів (undo мусить доїхати на інші пристрої). */
function tombstoned(ids: string[]) {
  return {
    rowCount: ids.length,
    rows: ids.map((id) => ({ id, deleted_at: DELETED_AT })),
  };
}

/**
 * Диспетчер по SQL-тексту для DELETE-транзакції (SELECT ... FOR UPDATE →
 * UPDATE finyk_manual_expenses → емісія опів → UPDATE import_batches
 * RETURNING).
 */
function makeFakeClient(
  overrides: {
    selectBatch?: (params: unknown[]) => { rows: unknown[] };
    tombstone?: (params: unknown[]) => { rowCount: number; rows: unknown[] };
    updateBatch?: (params: unknown[]) => { rows: unknown[] };
  } = {},
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql.trim())) return { rows: [] };
    if (/SELECT .* FROM import_batches/s.test(sql) && /FOR UPDATE/.test(sql)) {
      return overrides.selectBatch
        ? overrides.selectBatch(params)
        : { rows: [] };
    }
    if (/UPDATE finyk_manual_expenses/.test(sql)) {
      return overrides.tombstone ? overrides.tombstone(params) : tombstoned([]);
    }
    if (/INSERT INTO sync_op_log/.test(sql)) {
      const keys = (params[2] ?? []) as string[];
      return { rows: [], rowCount: keys.length };
    }
    if (/UPDATE import_batches/.test(sql)) {
      return overrides.updateBatch
        ? overrides.updateBatch(params)
        : { rows: [] };
    }
    throw new Error(`batches.test.ts fake client: unhandled SQL: ${sql}`);
  });
  return { query, release: vi.fn(), calls };
}

describe("deleteImportBatchHandler", () => {
  it("400 ValidationError на нечисловий id", async () => {
    await expect(
      deleteImportBatchHandler(makeReq("abc"), makeRes()),
    ).rejects.toMatchObject({ status: 400 });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("404, коли батч не існує / чужий — ROLLBACK, release()", async () => {
    const client = makeFakeClient({ selectBatch: () => ({ rows: [] }) });
    connectMock.mockResolvedValue(client);

    await expect(
      deleteImportBatchHandler(makeReq("999"), makeRes()),
    ).rejects.toMatchObject({ status: 404 });

    expect(client.calls.some((c) => c.sql.trim() === "ROLLBACK")).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("tombstone-ить created_row_ids, оновлює status на 'undone', повертає 200 + tombstoned:N", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow()] }),
      tombstone: () => tombstoned(["imp1:abc", "imp1:def"]),
      updateBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
    });
    connectMock.mockResolvedValue(client);

    const res = makeRes();
    await deleteImportBatchHandler(makeReq("1"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      batch: Record<string, unknown>;
      tombstoned: number;
    };
    expect(body.batch["status"]).toBe("undone");
    expect(body.tombstoned).toBe(2);

    const tombstoneCall = client.calls.find((c) =>
      c.sql.includes("UPDATE finyk_manual_expenses"),
    );
    expect(tombstoneCall?.params).toEqual(["u1", ["imp1:abc", "imp1:def"]]);
    expect(tombstoneCall?.sql).toContain("deleted_at IS NULL");

    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
  });

  it("ідемпотентний повторний виклик: tombstoned:0, все одно 200 (не помилка)", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
      tombstone: () => tombstoned([]), // deleted_at IS NULL більше нічого не матче
      updateBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
    });
    connectMock.mockResolvedValue(client);

    const res = makeRes();
    await deleteImportBatchHandler(makeReq("1"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      tombstoned: number;
      batch: Record<string, unknown>;
    };
    expect(body.tombstoned).toBe(0);
    expect(body.batch["status"]).toBe("undone");
  });

  it("порожній created_row_ids → tombstone-запит з порожнім масивом, без помилки", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow({ created_row_ids: [] })] }),
      tombstone: () => tombstoned([]),
      updateBatch: () => ({
        rows: [batchRow({ created_row_ids: [], status: "undone" })],
      }),
    });
    connectMock.mockResolvedValue(client);

    await deleteImportBatchHandler(makeReq("1"), makeRes());

    const tombstoneCall = client.calls.find((c) =>
      c.sql.includes("UPDATE finyk_manual_expenses"),
    );
    expect(tombstoneCall?.params[1]).toEqual([]);
  });

  it("скоупить SELECT FOR UPDATE по user_id із сесії", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow()] }),
      tombstone: () => tombstoned([]),
      updateBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
    });
    connectMock.mockResolvedValue(client);

    await deleteImportBatchHandler(makeReq("1", "session-user"), makeRes());

    const selectCall = client.calls.find(
      (c) => /FROM import_batches/.test(c.sql) && /FOR UPDATE/.test(c.sql),
    );
    expect(selectCall?.params).toEqual([1, "session-user"]);
  });

  it("емітує delete-опи рівно на реально tombstone-нуті рядки (undo доїжджає на інші пристрої)", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow()] }),
      tombstone: () => tombstoned(["imp1:abc", "imp1:def"]),
      updateBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
    });
    connectMock.mockResolvedValue(client);

    await deleteImportBatchHandler(makeReq("1"), makeRes());

    const emit = client.calls.find((c) =>
      c.sql.includes("INSERT INTO sync_op_log"),
    );
    expect(emit).toBeDefined();
    const [userId, tableName, keys, ops, rows] = emit!.params as [
      string,
      string,
      string[],
      string[],
      string[],
    ];
    expect(userId).toBe("u1");
    expect(tableName).toBe("finyk_manual_expenses");
    expect(ops).toEqual(["delete", "delete"]);
    expect(keys.every((k) => /^srvimpdel:1:[0-9a-f]{32}$/.test(k))).toBe(true);
    expect(JSON.parse(rows[0]!)).toMatchObject({
      id: "imp1:abc",
      user_id: "u1",
      deleted_at: DELETED_AT.toISOString(),
    });
    // Емісія — до COMMIT: ROLLBACK не має лишити оп про нескасований undo.
    const emitIdx = client.calls.indexOf(emit!);
    const commitIdx = client.calls.findIndex((c) => c.sql.trim() === "COMMIT");
    expect(emitIdx).toBeLessThan(commitIdx);
  });

  it("ідемпотентний повтор (нічого не тонили) не емітує жодного опа", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
      tombstone: () => tombstoned([]),
      updateBatch: () => ({ rows: [batchRow({ status: "undone" })] }),
    });
    connectMock.mockResolvedValue(client);

    await deleteImportBatchHandler(makeReq("1"), makeRes());

    expect(
      client.calls.some((c) => c.sql.includes("INSERT INTO sync_op_log")),
    ).toBe(false);
  });

  it("ROLLBACK + release(), коли tombstone-запит кидає помилку", async () => {
    const client = makeFakeClient({
      selectBatch: () => ({ rows: [batchRow()] }),
      tombstone: () => {
        throw new Error("tombstone boom");
      },
    });
    connectMock.mockResolvedValue(client);

    await expect(
      deleteImportBatchHandler(makeReq("1"), makeRes()),
    ).rejects.toThrow("tombstone boom");

    expect(client.calls.some((c) => c.sql.trim() === "ROLLBACK")).toBe(true);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
