/**
 * Юніт-тести для `backup-download.ts`.
 *
 * Контракт під тестом:
 *   1. Happy path: повертає { ok: true, blob } з рядка `nutrition_backups`.
 *   2. Рядок відсутній: кидає NotFoundError (що роутер перекладає у 404).
 *   3. Відсутній userId: кидає UnauthorizedError.
 *   4. NUTRITION_BACKUP_KEY_SECRET не заданий: кидає AppError зі статусом 503.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
  query: queryMock,
}));

vi.mock("../../env/env.js", () => ({
  env: {
    get NUTRITION_BACKUP_KEY_SECRET() {
      return process.env["_TEST_BACKUP_SECRET"] ?? "";
    },
  },
}));

import handler from "./backup-download.js";
import {
  NotFoundError,
  UnauthorizedError,
  AppError,
} from "../../obs/errors.js";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function mockRes(): TestRes & Response {
  const r: TestRes = {
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
  return r as TestRes & Response;
}

function makeReq(userId?: string, xToken?: string): Request {
  return {
    user: userId ? { id: userId } : undefined,
    headers: xToken ? { "x-token": xToken } : {},
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockReset();
  // Встановлюємо секрет за замовчуванням.
  process.env["_TEST_BACKUP_SECRET"] = "test-secret-value";
});

describe("backup-download handler", () => {
  it("повертає { ok: true, blob } для валідного запиту", async () => {
    const blobData = { meals: [{ name: "Вівсянка", kcal: 300 }] };
    // JSONB column — `pg` already parses it into a JS value, no JSON.parse.
    queryMock.mockResolvedValueOnce({ rows: [{ payload: blobData }] });

    const res = mockRes();
    await handler(makeReq("user-123", "client-token"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["blob"]).toEqual(blobData);
    expect(queryMock).toHaveBeenCalledOnce();
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/SELECT payload FROM nutrition_backups/);
    expect(params[0]).toBe("user-123");
  });

  it("кидає NotFoundError коли рядок відсутній", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(handler(makeReq("user-abc"), mockRes())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("кидає UnauthorizedError коли userId відсутній", async () => {
    await expect(handler(makeReq(undefined), mockRes())).rejects.toThrow(
      UnauthorizedError,
    );
    // DB не торкаємося.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("кидає AppError(503) коли NUTRITION_BACKUP_KEY_SECRET не задано", async () => {
    process.env["_TEST_BACKUP_SECRET"] = "";

    let err: unknown;
    try {
      await handler(makeReq("user-xyz"), mockRes());
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(503);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
