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
  default: { query: vi.fn() },
}));

import pool from "../../db.js";
import { createManualExpense } from "./manualExpenses.js";
import { ValidationError } from "../../obs/errors.js";

const queryMock = (pool as unknown as { query: Mock }).query;

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
});

describe("createManualExpense", () => {
  it("converts kopiykas body amount to hryvnia in the persisted blob", async () => {
    queryMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
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

    const [sqlText, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("INSERT INTO finyk_manual_expenses");
    const persistedBlob = JSON.parse(params[2] as string) as { amount: number };
    expect(persistedBlob.amount).toBe(120); // hryvnyas, not kopiykas
  });

  it("uses req.user.id for user_id, never trusting the body", async () => {
    queryMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
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

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe("session_user_42");
  });

  it("defaults note to empty string when omitted", async () => {
    queryMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
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
    queryMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
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

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const persistedBlob = JSON.parse(params[2] as string) as { date: string };
    // Format check only (YYYY-MM-DD) — exact "today" is environment/clock
    // dependent, but the handler must never fall back to a UTC-derived date.
    expect(persistedBlob.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the explicit date when provided instead of Kyiv-today", async () => {
    queryMock.mockImplementationOnce((_sqlText: string, params: unknown[]) =>
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

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    const persistedBlob = JSON.parse(params[2] as string) as { date: string };
    expect(persistedBlob.date).toBe("2020-01-15");
  });

  it("throws ValidationError for a non-positive amount", async () => {
    const req = makeReq("user_1", { amount: 0, category: "food" });
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(queryMock).not.toHaveBeenCalled();
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
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = makeReq("user_1", { amount: 1000, category: "food" });
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toThrow(
      "finyk_manual_expenses INSERT returned no row",
    );
  });
});
