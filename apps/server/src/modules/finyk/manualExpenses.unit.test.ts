// Unit coverage for `createManualExpense` (POST /api/v1/finyk/manual-expenses)
// using a mocked `pool.query` instead of the Testcontainers harness in
// manualExpenses.integration.test.ts (which soft-skips outside Docker/CI).
//
// serializeManualExpense already has dedicated fixture tests in
// manualExpenses.test.ts; this file focuses on the handler's own logic:
// kopiykas→hryvnia conversion at the persistence boundary, the Kyiv-day
// default, session-derived user_id, validation errors, and the SQL params
// passed to `pool.query`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

import pool from "../../db.js";
import { createManualExpense } from "./manualExpenses.js";
import { ValidationError } from "../../obs/errors.js";

const connectMock = (pool as unknown as { connect: Mock }).connect;

// `createManualExpense` працює через `pool.connect()` + транзакцію (data-16):
// INSERT рядка і INSERT у `sync_op_log` ідуть одним client-ом між
// BEGIN/COMMIT. `insertMock` — це відповідь саме на INSERT рядка;
// `clientCalls` — повний журнал викликів client.query.
const insertMock: Mock = vi.fn();
const clientCalls: Array<{ sql: string; params: unknown[] }> = [];
const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    clientCalls.push({ sql, params });
    if (/INSERT INTO finyk_manual_expenses/.test(sql)) {
      return insertMock(sql, params);
    }
    return { rows: [], rowCount: 1 };
  }),
  release: vi.fn(),
};

function insertCall(): [string, unknown[]] {
  const call = clientCalls.find((c) =>
    c.sql.includes("INSERT INTO finyk_manual_expenses"),
  );
  if (!call) throw new Error("INSERT INTO finyk_manual_expenses не викликано");
  return [call.sql, call.params];
}

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {},
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

function makeReq(userId: string, body: Record<string, unknown>): Request {
  return { user: { id: userId }, body } as unknown as Request;
}

function dbRowFor(blob: {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}) {
  return {
    id: blob.id,
    data_json: blob,
    created_at: new Date("2026-07-10T10:00:00.000Z"),
    updated_at: new Date("2026-07-10T10:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientCalls.length = 0;
  insertMock.mockReset();
  connectMock.mockResolvedValue(client);
});

describe("createManualExpense", () => {
  it("converts kopiykas body amount to hryvnia in the persisted blob", async () => {
    insertMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
      Promise.resolve({
        rows: [
          dbRowFor(
            JSON.parse(params[2] as string) as {
              id: string;
              date: string;
              description: string;
              amount: number;
              category: string;
            },
          ),
        ],
      }),
    );

    const req = makeReq("user_1", {
      amount: 12000,
      category: "food",
      date: "2026-07-10",
      note: "Кава",
    });
    const res = makeRes();
    await createManualExpense(req, res);

    expect(res.statusCode).toBe(201);
    const body = res.body as {
      ok: boolean;
      expense: { amountKopiykas: number };
    };
    expect(body.ok).toBe(true);
    // Round-trips back to kopiykas via the serializer (×100 of the stored
    // hryvnia amount) — proves the /100 conversion at the persistence
    // boundary and the serializer's ×100 cancel out losslessly.
    expect(body.expense.amountKopiykas).toBe(12000);

    const [sqlText, params] = insertCall();
    expect(sqlText).toContain("INSERT INTO finyk_manual_expenses");
    const persistedBlob = JSON.parse(params[2] as string) as { amount: number };
    expect(persistedBlob.amount).toBe(120); // hryvnyas, not kopiykas
  });

  it("uses req.user.id for user_id, never trusting the body", async () => {
    insertMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
      Promise.resolve({
        rows: [
          dbRowFor(
            JSON.parse(params[2] as string) as {
              id: string;
              date: string;
              description: string;
              amount: number;
              category: string;
            },
          ),
        ],
      }),
    );

    const req = makeReq("session_user_42", {
      amount: 500,
      category: "transport",
    });
    const res = makeRes();
    await createManualExpense(req, res);

    const [, params] = insertCall();
    expect(params[1]).toBe("session_user_42");
  });

  it("defaults note to empty string when omitted", async () => {
    insertMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
      Promise.resolve({
        rows: [
          dbRowFor(
            JSON.parse(params[2] as string) as {
              id: string;
              date: string;
              description: string;
              amount: number;
              category: string;
            },
          ),
        ],
      }),
    );

    const req = makeReq("user_1", { amount: 100, category: "misc" });
    const res = makeRes();
    await createManualExpense(req, res);

    const body = res.body as { expense: { note: string } };
    expect(body.expense.note).toBe("");
  });

  it("defaults date to today's Kyiv day when omitted", async () => {
    insertMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
      Promise.resolve({
        rows: [
          dbRowFor(
            JSON.parse(params[2] as string) as {
              id: string;
              date: string;
              description: string;
              amount: number;
              category: string;
            },
          ),
        ],
      }),
    );

    const req = makeReq("user_1", { amount: 100, category: "misc" });
    const res = makeRes();
    await createManualExpense(req, res);

    const [, params] = insertCall();
    const persistedBlob = JSON.parse(params[2] as string) as { date: string };
    // Format check only (YYYY-MM-DD) — exact "today" is environment/clock
    // dependent, but the handler must never fall back to a UTC-derived date.
    expect(persistedBlob.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the explicit date when provided instead of Kyiv-today", async () => {
    insertMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
      Promise.resolve({
        rows: [
          dbRowFor(
            JSON.parse(params[2] as string) as {
              id: string;
              date: string;
              description: string;
              amount: number;
              category: string;
            },
          ),
        ],
      }),
    );

    const req = makeReq("user_1", {
      amount: 100,
      category: "misc",
      date: "2020-01-15",
    });
    const res = makeRes();
    await createManualExpense(req, res);

    const [, params] = insertCall();
    const persistedBlob = JSON.parse(params[2] as string) as { date: string };
    expect(persistedBlob.date).toBe("2020-01-15");
  });

  it("throws ValidationError for a non-positive amount", async () => {
    const req = makeReq("user_1", { amount: 0, category: "food" });
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError for a non-integer amount", async () => {
    const req = makeReq("user_1", { amount: 199.5, category: "food" });
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws ValidationError when category is missing", async () => {
    const req = makeReq("user_1", { amount: 1000 });
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws when INSERT … RETURNING yields no row (driver anomaly guard)", async () => {
    insertMock.mockResolvedValueOnce({ rows: [] });

    const req = makeReq("user_1", { amount: 1000, category: "food" });
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toThrow(
      "finyk_manual_expenses INSERT returned no row",
    );
  });
  describe("sync_op_log (data-16)", () => {
    function seedInsert(): void {
      insertMock.mockImplementationOnce((_sql: string, params: unknown[]) =>
        Promise.resolve({
          rows: [
            dbRowFor(
              JSON.parse(params[2] as string) as {
                id: string;
                date: string;
                description: string;
                amount: number;
                category: string;
              },
            ),
          ],
        }),
      );
    }

    it("емітить insert-оп у sync_op_log з тим самим id у ТІЙ САМІЙ транзакції", async () => {
      seedInsert();
      const res = makeRes();
      await createManualExpense(
        makeReq("user_1", {
          amount: 12000,
          category: "food",
          date: "2026-07-10",
          note: "Кава",
        }),
        res,
      );

      expect(res.statusCode).toBe(201);
      const expenseId = (res.body as { expense: { id: string } }).expense.id;

      const opCall = clientCalls.find((c) =>
        c.sql.includes("INSERT INTO sync_op_log"),
      );
      expect(opCall).toBeDefined();
      const [userId, tableName, keys, ops, rows, tss] = opCall!.params as [
        string,
        string,
        string[],
        string[],
        string[],
        string[],
      ];
      expect(userId).toBe("user_1");
      expect(tableName).toBe("finyk_manual_expenses");
      expect(ops).toEqual(["insert"]);
      expect(keys).toEqual([`srv:fme:${expenseId}`]);
      expect(keys[0]!.length).toBeLessThanOrEqual(64);
      const row = JSON.parse(rows[0]!) as Record<string, unknown>;
      expect(row["id"]).toBe(expenseId);
      expect(row["user_id"]).toBe("user_1");
      expect(row["deleted_at"]).toBeNull();
      expect((row["data_json"] as { amount: number }).amount).toBe(120);
      // clientTs = updated_at РЯДКА, не час запиту (докстрінг serverOpLog.ts).
      expect(tss[0]).toBe("2026-07-10T10:00:00.000Z");

      // Порядок: BEGIN → INSERT рядка → INSERT оп → COMMIT.
      const order = clientCalls.map((c) =>
        c.sql.trim().split(/\s+/).slice(0, 3).join(" "),
      );
      expect(order).toEqual([
        "BEGIN",
        "INSERT INTO finyk_manual_expenses",
        "INSERT INTO sync_op_log",
        "COMMIT",
      ]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it("збій запису опа → ROLLBACK, без COMMIT, 201 не віддається, client звільнено", async () => {
      seedInsert();
      client.query.mockImplementationOnce(async (sql: string) => {
        clientCalls.push({ sql, params: [] });
        return { rows: [] }; // BEGIN
      });
      client.query.mockImplementationOnce(
        async (sql: string, params: unknown[] = []) => {
          clientCalls.push({ sql, params });
          return insertMock(sql, params); // INSERT рядка
        },
      );
      client.query.mockImplementationOnce(async (sql: string) => {
        clientCalls.push({ sql, params: [] });
        throw new Error("oplog down");
      });
      const res = makeRes();

      await expect(
        createManualExpense(
          makeReq("user_1", { amount: 100, category: "misc" }),
          res,
        ),
      ).rejects.toThrow("oplog down");

      const sqls = clientCalls.map((c) => c.sql.trim());
      expect(sqls).toContain("ROLLBACK");
      expect(sqls).not.toContain("COMMIT");
      expect(res.statusCode).toBe(200);
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });
});
