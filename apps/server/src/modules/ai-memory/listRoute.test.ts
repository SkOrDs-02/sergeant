import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";
import type pg from "pg";

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { removeMemoryBankEntryMock } = vi.hoisted(() => ({
  removeMemoryBankEntryMock: vi.fn(async () => ({ removed: false })),
}));

vi.mock("../me/profile.js", () => ({
  removeMemoryBankEntry: removeMemoryBankEntryMock,
}));

import { logger } from "../../obs/logger.js";
import { buildMemoryDeleteHandler } from "./listRoute.js";

/**
 * L-8 Фаза 2 (2026-08-09) — `DELETE /api/ai-memory/:id` тепер узгоджує
 * видалення з `user_profile.payload.memoryBank.entries` для рядків
 * `source='profile'`. Тести перевіряють і саме узгодження, і
 * транзакційність (обидві зміни разом, або жодна).
 */

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

function makeReq(userId: string, id: string): Request {
  return { user: { id: userId }, params: { id } } as unknown as Request;
}

interface ClientStub {
  query: Mock;
  release: Mock;
}

function makeClient(): ClientStub {
  return {
    query: vi.fn(),
    release: vi.fn(),
  };
}

function makePool(client: ClientStub): pg.Pool {
  return {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as pg.Pool;
}

/** Налаштовує `client.query` mock послідовно: BEGIN → DELETE...RETURNING → COMMIT. */
function scriptClient(
  client: ClientStub,
  deleteResult: {
    rowCount: number;
    rows: Array<{ source: string; source_ref: string | null }>;
  },
) {
  client.query.mockImplementation((sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return Promise.resolve({ rows: [] });
    }
    if (typeof sql === "string" && sql.includes("DELETE FROM ai_memories")) {
      return Promise.resolve(deleteResult);
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  removeMemoryBankEntryMock.mockReset();
  removeMemoryBankEntryMock.mockResolvedValue({ removed: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildMemoryDeleteHandler — 400 на невалідний id", () => {
  it("не звертається до pool.connect() взагалі", async () => {
    const client = makeClient();
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await handler(makeReq("user-1", "not-a-number"), res);

    expect(res.statusCode).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe("buildMemoryDeleteHandler — узгоджене видалення", () => {
  it("source !== 'profile' → removeMemoryBankEntry НЕ викликається", async () => {
    const client = makeClient();
    scriptClient(client, {
      rowCount: 1,
      rows: [{ source: "chat", source_ref: null }],
    });
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await handler(makeReq("user-1", "42"), res);

    expect(removeMemoryBankEntryMock).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(res.body).toEqual({ ok: true, deleted: true });
  });

  it("source === 'profile' з source_ref → removeMemoryBankEntry викликається з тим самим client + source_ref", async () => {
    const client = makeClient();
    scriptClient(client, {
      rowCount: 1,
      rows: [{ source: "profile", source_ref: "fact-1" }],
    });
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await handler(makeReq("user-1", "42"), res);

    expect(removeMemoryBankEntryMock).toHaveBeenCalledWith(
      client,
      "user-1",
      "fact-1",
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(res.body).toEqual({ ok: true, deleted: true });
  });

  it("нічого не видалено (id не знайдено) → removeMemoryBankEntry НЕ викликається, deleted:false", async () => {
    const client = makeClient();
    scriptClient(client, { rowCount: 0, rows: [] });
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await handler(makeReq("user-1", "999"), res);

    expect(removeMemoryBankEntryMock).not.toHaveBeenCalled();
    expect(res.body).toEqual({ ok: true, deleted: false });
  });

  it("source === 'profile' але source_ref === null (захисний edge-case) → removeMemoryBankEntry НЕ викликається", async () => {
    const client = makeClient();
    scriptClient(client, {
      rowCount: 1,
      rows: [{ source: "profile", source_ref: null }],
    });
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await handler(makeReq("user-1", "42"), res);

    expect(removeMemoryBankEntryMock).not.toHaveBeenCalled();
    expect(res.body).toEqual({ ok: true, deleted: true });
  });
});

describe("buildMemoryDeleteHandler — транзакційність (обидві зміни разом, або жодна)", () => {
  it("removeMemoryBankEntry кидає → ROLLBACK, помилка прокидається, ai_memories-DELETE відкочується", async () => {
    const client = makeClient();
    scriptClient(client, {
      rowCount: 1,
      rows: [{ source: "profile", source_ref: "fact-1" }],
    });
    removeMemoryBankEntryMock.mockRejectedValueOnce(
      new Error("pg connection reset"),
    );
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await expect(handler(makeReq("user-1", "42"), res)).rejects.toThrow(
      "pg connection reset",
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("buildMemoryDeleteHandler — логує source видаленого рядка", () => {
  it("успішний delete логує msg=ai_memory_deleted_by_user з полем source", async () => {
    const client = makeClient();
    scriptClient(client, {
      rowCount: 1,
      rows: [{ source: "profile", source_ref: "fact-1" }],
    });
    const pool = makePool(client);
    const handler = buildMemoryDeleteHandler(pool);
    const res = makeRes();

    await handler(makeReq("user-1", "42"), res);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "ai_memory_deleted_by_user",
        userId: "user-1",
        memoryId: 42,
        source: "profile",
      }),
    );
  });
});
