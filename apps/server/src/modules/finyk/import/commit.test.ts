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

const ROW_CREATED_AT = new Date("2026-01-15T12:30:00.000Z");
const ROW_UPDATED_AT = new Date("2026-01-15T12:31:00.000Z");

/** Форма, яку віддає upsert-запит `commit.ts`: стан рядка ПІСЛЯ виклику
 * + прапорець «вставили саме зараз». */
function upsertRow(
  overrides: {
    inserted?: boolean;
    deleted_at?: Date | null;
    data_json?: unknown;
  } = {},
) {
  return {
    rows: [
      {
        data_json: overrides.data_json ?? { category: "food" },
        created_at: ROW_CREATED_AT,
        updated_at: ROW_UPDATED_AT,
        deleted_at: overrides.deleted_at ?? null,
        inserted: overrides.inserted ?? true,
      },
    ],
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
        : upsertRow();
      manualExpenseInsertCount++;
      return result;
    }
    if (/INSERT INTO import_batches/.test(sql)) {
      return overrides.batchInsert
        ? overrides.batchInsert(params)
        : { rows: [defaultBatchRow(params)] };
    }
    if (/INSERT INTO sync_op_log/.test(sql)) {
      const keys = (params[2] ?? []) as string[];
      return { rows: [], rowCount: keys.length };
    }
    throw new Error(`commit.test.ts fake client: unhandled SQL: ${sql}`);
  });
  return { query, release: vi.fn(), calls };
}

/** Параметри єдиної емісії опів (`serverOpLog.ts` — один statement на
 * весь батч, масиви-колонки через `unnest`). */
function syncOpEmit(calls: Array<{ sql: string; params: unknown[] }>) {
  const call = calls.find((c) => c.sql.includes("INSERT INTO sync_op_log"));
  if (!call) return null;
  const [userId, tableName, keys, ops, rows] = call.params as [
    string,
    string,
    string[],
    string[],
    string[],
  ];
  return {
    userId,
    tableName,
    keys,
    ops,
    rows: rows.map((r) => JSON.parse(r) as Record<string, unknown>),
  };
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
    const body = res.body as Record<string, unknown> & {
      rows: Array<{ id: string; status: string }>;
    };
    expect(body).toMatchObject({
      batchId: 1,
      created: 2,
      linked: 0,
      skipped: { monoMatched: 0, duplicate: 0 },
    });
    expect(body.rows.map((r) => r.status)).toEqual(["created", "created"]);
    expect(body.rows.every((r) => r.id.startsWith("imp1:"))).toBe(true);
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
      // конфлікт — рядок уже існував і живий
      manualExpenseInsert: () => upsertRow({ inserted: false }),
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
      manualExpenseInsert: () => {
        insertCallIndex++;
        // Перший фактичний insert-виклик (row0) — успіх; другий
        // (row2, бо row1 скіпнулась ДО insert) — конфлікт.
        return insertCallIndex === 1
          ? upsertRow()
          : upsertRow({ inserted: false });
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

/**
 * Регресія 2026-08-28: імпортовані рядки не зʼявлялись у «Операціях».
 * Причина — рядок жив лише у `finyk_manual_expenses`, а `syncV2Pull`
 * читає ВИКЛЮЧНО `sync_op_log`, тож жоден pull його не приносив.
 */
describe("commitImportHandler — емісія sync_op_log (видимість на пристроях)", () => {
  it("створений рядок отримує insert-оп у finyk_manual_expenses", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await commitImportHandler(makeReq(commitBody([row()])), makeRes());

    const emit = syncOpEmit(client.calls);
    expect(emit).not.toBeNull();
    expect(emit!.userId).toBe("u1");
    expect(emit!.tableName).toBe("finyk_manual_expenses");
    expect(emit!.ops).toEqual(["insert"]);
    expect(emit!.keys[0]).toMatch(/^srvimp:1:[0-9a-f]{32}$/);
    expect(emit!.keys[0]!.length).toBeLessThanOrEqual(64);
    expect(emit!.rows[0]).toMatchObject({
      user_id: "u1",
      deleted_at: null,
      updated_at: ROW_UPDATED_AT.toISOString(),
      created_at: ROW_CREATED_AT.toISOString(),
    });
  });

  it("рядок-дубль (уже на сервері, живий) ТЕЖ реплікується — самолікування застряглих імпортів", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient({
      manualExpenseInsert: () => upsertRow({ inserted: false }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(makeReq(commitBody([row()])), res);

    const body = res.body as { rows: Array<{ status: string }> };
    expect(body.rows.map((r) => r.status)).toEqual(["duplicate"]);
    const emit = syncOpEmit(client.calls);
    expect(emit!.ops).toEqual(["insert"]);
  });

  it("tombstone-рядок НЕ реплікується (не воскрешаємо видалене) і має статус tombstoned", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient({
      manualExpenseInsert: () =>
        upsertRow({
          inserted: false,
          deleted_at: new Date("2026-01-16T10:00:00.000Z"),
        }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(makeReq(commitBody([row()])), res);

    const body = res.body as {
      created: number;
      skipped: { duplicate: number };
      rows: Array<{ status: string }>;
    };
    expect(body.created).toBe(0);
    expect(body.skipped.duplicate).toBe(1);
    expect(body.rows.map((r) => r.status)).toEqual(["tombstoned"]);
    expect(syncOpEmit(client.calls)).toBeNull();
  });

  it("mono-matched рядок не реплікується, але лишається в rows зі своїм статусом", async () => {
    mocks.findMonoMatch.mockResolvedValueOnce({ monoTxId: "tx-1" });
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await commitImportHandler(makeReq(commitBody([row()])), res);

    const body = res.body as { rows: Array<{ status: string }> };
    expect(body.rows.map((r) => r.status)).toEqual(["mono_matched"]);
    expect(syncOpEmit(client.calls)).toBeNull();
  });

  it("rows 1:1 з поданими рядками навіть у змішаному батчі (порядок збережено)", async () => {
    mocks.findMonoMatch
      .mockResolvedValueOnce(null) // row0 — created
      .mockResolvedValueOnce({ monoTxId: "tx-1" }) // row1 — mono
      .mockResolvedValueOnce(null); // row2 — duplicate
    let insertCallIndex = 0;
    const client = makeFakeClient({
      manualExpenseInsert: () => {
        insertCallIndex++;
        return insertCallIndex === 1
          ? upsertRow()
          : upsertRow({ inserted: false });
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

    const body = res.body as { rows: Array<{ status: string }> };
    expect(body.rows.map((r) => r.status)).toEqual([
      "created",
      "mono_matched",
      "duplicate",
    ]);
    // Обидва живі рядки (created + duplicate) їдуть на пристрої.
    expect(syncOpEmit(client.calls)!.ops).toEqual(["insert", "insert"]);
  });

  it("емісія — ДО COMMIT (ROLLBACK не має лишити оп про неіснуючий рядок)", async () => {
    mocks.findMonoMatch.mockResolvedValue(null);
    const client = makeFakeClient();
    mocks.connect.mockResolvedValue(client);

    await commitImportHandler(makeReq(commitBody([row()])), makeRes());

    const emitIdx = client.calls.findIndex((c) =>
      c.sql.includes("INSERT INTO sync_op_log"),
    );
    const commitIdx = client.calls.findIndex((c) => c.sql.trim() === "COMMIT");
    expect(emitIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeLessThan(commitIdx);
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
