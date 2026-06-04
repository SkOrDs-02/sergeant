/**
 * Юніт-тести для `backup-download.ts`.
 *
 * Контракт під тестом:
 *   1. Happy path: повертає { ok: true, blob } з розпарсеного файлу.
 *   2. ENOENT: кидає NotFoundError (що роутер перекладає у 404).
 *   3. Відсутній userId: кидає UnauthorizedError.
 *   4. NUTRITION_BACKUP_KEY_SECRET не заданий: кидає AppError зі статусом 503.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// Мокаємо залежності до першого import handler.
vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn() },
  readFile: vi.fn(),
}));

vi.mock("../../env/env.js", () => ({
  env: {
    get NUTRITION_BACKUP_KEY_SECRET() {
      return process.env["_TEST_BACKUP_SECRET"] ?? "";
    },
  },
}));

import fsMod from "node:fs/promises";
import handler from "./backup-download.js";
import {
  NotFoundError,
  UnauthorizedError,
  AppError,
} from "../../obs/errors.js";

const fsMock = fsMod as unknown as { readFile: ReturnType<typeof vi.fn> };

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
  // Встановлюємо секрет за замовчуванням.
  process.env["_TEST_BACKUP_SECRET"] = "test-secret-value";
});

describe("backup-download handler", () => {
  it("повертає { ok: true, blob } для валідного запиту", async () => {
    const blobData = { meals: [{ name: "Вівсянка", kcal: 300 }] };
    fsMock.readFile.mockResolvedValueOnce(JSON.stringify(blobData));

    const res = mockRes();
    await handler(makeReq("user-123", "client-token"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["blob"]).toEqual(blobData);
  });

  it("кидає NotFoundError коли файл відсутній (ENOENT)", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    fsMock.readFile.mockRejectedValueOnce(enoent);

    await expect(handler(makeReq("user-abc"), mockRes())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("кидає UnauthorizedError коли userId відсутній", async () => {
    await expect(handler(makeReq(undefined), mockRes())).rejects.toThrow(
      UnauthorizedError,
    );
    // fs не торкаємося.
    expect(fsMock.readFile).not.toHaveBeenCalled();
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
    expect(fsMock.readFile).not.toHaveBeenCalled();
  });
});
