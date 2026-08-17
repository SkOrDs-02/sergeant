import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findMonoMatch: vi.fn(),
}));

vi.mock("../../../db.js", () => ({
  default: { connect: mocks.connect },
}));
vi.mock("./dedupMono.js", () => ({
  findMonoMatch: mocks.findMonoMatch,
}));

import commitImportHandler from "./commit.js";

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

function makeReq(body: unknown, userId = "u1"): Request {
  return { user: { id: userId }, body } as unknown as Request;
}

const NOW = "2026-01-15T12:35:00.000Z";

function commitBody(
  rows: Array<Record<string, unknown>>,
  source = "bank_statement",
) {
  return { source, rows };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-01-15",
    amountKopiykas: 10000,
    direction: "expense",
    description: "Кава",
    category: "food",
    ...overrides,
  };
}

function defaultBatchRow(params: unknown[]) {
  const [
    userId,
    source,
    rowsTotal,
    rowsCreated,
    rowsSkipped,
    createdRowIdsJson,
  ] = params as [string, string, number, number, number, string];
  return {
    id: "1",
    user_id: userId,
    source,
    status: "completed",
    rows_total: rowsTotal,
    rows_created: rowsCreated,
    rows_linked: 0,
    rows_skipped: rowsSkipped,
    created_row_ids: JSON.parse(createdRowIdsJson) as unknown[],
    created_at: NOW,
    updated_at: NOW,
  };
}

/**
 * Диспетчер по SQL-тексту (той самий патерн, що
 * `receipts/save.test.ts#makeFakeClient`), з per-call-лічильником для
 * `finyk_manual_expenses`-вставок, бо commit обробляє N рядків в одному
 * виклику (на відміну від save.ts, який завжди вставляє один чек).
 */
function makeFakeClient(
  overrides: {
    manualExpenseInsert?: (
      params: unknown[],
      callIndex: number,
    ) => { rows: unknown[] };
    batchInsert?: (params: unknown[]) => { rows: unknown[] };
  } = {},
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let manualExpenseInsertCount = 0;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql.trim())) return { rows: [] };
    if (/INSERT INTO finyk_manual_expenses/.test(sql)) {
      const result = overrides.manualExpenseInsert
        ? overrides.manualExpenseInsert(params, manualExpenseInsertCount)
        : { rows: [{ id: params[0] }] };
      manualExpenseInsertCount++;
      return result;
    }
    if (/INSERT INTO import_batches/.test(sql)) {
      return overrides.batchInsert
        ? overrides.batchInsert(params)
        : { rows: [defaultBatchRow(params)] };
    }
    throw new Error(`commit.test.ts fake client: unhandled SQL: ${sql}`);
  });
  return { query, release: vi.fn(), calls };
}

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.findMonoMatch.mockReset();
});

describe("commitImportHandler — happy path, усі рядки нові", () => {
  it("201, created дорівнює кількості рядків, linked:0, skipped нульові", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(
      makeReq(
        commitBody([
          row({ description: "Кава" }),
          row({
            description: "Зарплата",
            direction: "income",
            category: "salary",
          }),
        ]),
      ),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      batchId: 1,
      created: 2,
      linked: 0,
      skipped: { monoMatched: 0, duplicate: 0 },
    });
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("blob income-рядка несе kind:'income', amount у гривнях (не копійках)", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await commitImportHandler(
      makeReq(
        commitBody([
          row({
            description: "Зарплата",
            direction: "income",
            amountKopiykas: 1500000,
            category: "salary",
          }),
        ]),
      ),
      makeRes(),
    );

    const insertCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_manual_expenses"),
    );
    expect(insertCall).toBeDefined();
    const [, userId, blobJson] = insertCall!.params as [string, string, string];
    expect(userId).toBe("u1");
    const blob = JSON.parse(blobJson) as {
      kind: string;
      amount: number;
      category: string;
      description: string;
      date: string;
    };
    expect(blob.kind).toBe("income");
    expect(blob.amount).toBe(15000); // 1 500 000 копійок → 15 000 ГРИВЕНЬ
    expect(blob.category).toBe("salary");
    expect(blob.date).toBe("2026-01-15");
  });

  it("blob expense-рядка несе kind:'expense' явно (не покладається на легасі-дефолт)", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await commitImportHandler(
      makeReq(commitBody([row({ direction: "expense" })])),
      makeRes(),
    );

    const insertCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_manual_expenses"),
    );
    const blob = JSON.parse(insertCall!.params[2] as string) as {
      kind: string;
    };
    expect(blob.kind).toBe("expense");
  });

  it("порожній опис → fallback 'Без опису' у blob (не в rowKey-хеші)", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await commitImportHandler(
      makeReq(commitBody([row({ description: "" })])),
      makeRes(),
    );

    const insertCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_manual_expenses"),
    );
    const blob = JSON.parse(insertCall!.params[2] as string) as {
      description: string;
    };
    expect(blob.description).toBe("Без опису");
  });
});

describe("commitImportHandler — mono-дедуп (тір 1)", () => {
  it("mono-matched рядок НЕ вставляється у finyk_manual_expenses, лічиться в skipped.monoMatched", async () => {
    mocks.findMonoMatch.mockResolvedValueOnce({ monoTxId: "tx-1" });
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(makeReq(commitBody([row()])), res);

    const body = res.body as {
      created: number;
      skipped: { monoMatched: number; duplicate: number };
    };
    expect(body.created).toBe(0);
    expect(body.skipped).toEqual({ monoMatched: 1, duplicate: 0 });
    expect(
      client.calls.some((c) =>
        c.sql.includes("INSERT INTO finyk_manual_expenses"),
      ),
    ).toBe(false);
  });

  it("mono-matched для expense перевіряє direction='expense' у виклику findMonoMatch", async () => {
    mocks.findMonoMatch.mockResolvedValueOnce(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await commitImportHandler(
      makeReq(
        commitBody([row({ direction: "expense", amountKopiykas: 8475 })]),
      ),
      makeRes(),
    );

    expect(mocks.findMonoMatch).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        userId: "u1",
        date: "2026-01-15",
        amountKopiykas: 8475,
        direction: "expense",
      }),
    );
  });

  it("змішаний батч: рядок 0 matched (skip), рядок 1 новий (created)", async () => {
    mocks.findMonoMatch
      .mockResolvedValueOnce({ monoTxId: "tx-1" })
      .mockResolvedValueOnce(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(
      makeReq(
        commitBody([
          row({ description: "matched" }),
          row({ description: "новий" }),
        ]),
      ),
      res,
    );

    const body = res.body as {
      created: number;
      skipped: { monoMatched: number };
    };
    expect(body.created).toBe(1);
    expect(body.skipped.monoMatched).toBe(1);
    expect(
      client.calls.filter((c) =>
        c.sql.includes("INSERT INTO finyk_manual_expenses"),
      ),
    ).toHaveLength(1);
  });
});

describe("commitImportHandler — between-imports дедуп (тір 2, ON CONFLICT)", () => {
  it("ON CONFLICT (0 рядків RETURNING) → duplicate, НЕ у createdRowIds", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient({
      manualExpenseInsert: () => ({ rows: [] }), // конфлікт — рядок уже існував
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(makeReq(commitBody([row()])), res);

    const body = res.body as {
      created: number;
      skipped: { monoMatched: number; duplicate: number };
    };
    expect(body.created).toBe(0);
    expect(body.skipped).toEqual({ monoMatched: 0, duplicate: 1 });

    const batchInsertCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO import_batches"),
    );
    const createdRowIds = JSON.parse(
      batchInsertCall!.params[5] as string,
    ) as unknown[];
    expect(createdRowIds).toEqual([]);
  });

  it("created_row_ids несе ЛИШЕ реально створені id (не mono-matched, не duplicate)", async () => {
    mocks.findMonoMatch
      .mockResolvedValueOnce(null) // row0 — created
      .mockResolvedValueOnce({ monoTxId: "tx-1" }) // row1 — mono-matched
      .mockResolvedValueOnce(null); // row2 — duplicate

    let insertCallIndex = 0;
    const client = makeFakeClient({
      manualExpenseInsert: (params) => {
        insertCallIndex++;
        // Перший фактичний insert-виклик (row0) — успіх; другий
        // (row2, бо row1 скіпнулась ДО insert) — конфлікт.
        return insertCallIndex === 1
          ? { rows: [{ id: params[0] }] }
          : { rows: [] };
      },
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(
      makeReq(
        commitBody([
          row({ description: "новий" }),
          row({ description: "matched" }),
          row({ description: "дубль" }),
        ]),
      ),
      res,
    );

    const body = res.body as {
      created: number;
      skipped: { monoMatched: number; duplicate: number };
    };
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual({ monoMatched: 1, duplicate: 1 });

    const batchInsertCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO import_batches"),
    );
    const [, , rowsTotal, rowsCreated, rowsSkipped, createdRowIdsJson] =
      batchInsertCall!.params as [
        string,
        string,
        number,
        number,
        number,
        string,
      ];
    expect(rowsTotal).toBe(3);
    expect(rowsCreated).toBe(1);
    expect(rowsSkipped).toBe(2);
    const createdRowIds = JSON.parse(createdRowIdsJson) as string[];
    expect(createdRowIds).toHaveLength(1);
  });
});

describe("commitImportHandler — rollback on failure", () => {
  it("ROLLBACK + release(), коли findMonoMatch кидає помилку; оригінальна помилка пробрасується", async () => {
    mocks.findMonoMatch.mockRejectedValueOnce(new Error("mono boom"));
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await expect(
      commitImportHandler(makeReq(commitBody([row()])), makeRes()),
    ).rejects.toThrow("mono boom");

    expect(client.calls.some((c) => c.sql.trim() === "ROLLBACK")).toBe(true);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("commitImportHandler — валідація", () => {
  it("відхиляє порожній rows[] (400, ValidationError через parseBody)", async () => {
    mocks.connect.mockResolvedValue(makeFakeClient());
    await expect(
      commitImportHandler(makeReq(commitBody([])), makeRes()),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("відхиляє рядок без category (400)", async () => {
    mocks.connect.mockResolvedValue(makeFakeClient());
    const badRow = row();
    delete (badRow as Record<string, unknown>)["category"];
    await expect(
      commitImportHandler(makeReq(commitBody([badRow])), makeRes()),
    ).rejects.toMatchObject({ status: 400 });
  });
});
