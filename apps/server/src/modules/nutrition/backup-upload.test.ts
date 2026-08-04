import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
  query: queryMock,
}));

import { env } from "../../env/env.js";
import handler from "./backup-upload.js";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function makeReq(
  userId: string | undefined,
  body: unknown = {},
  xToken?: string,
): Request {
  return {
    user: userId !== undefined ? { id: userId } : undefined,
    headers: { "x-token": xToken ?? "tok-abc" },
    body,
  } as unknown as Request;
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const ORIGINAL_SECRET = env.NUTRITION_BACKUP_KEY_SECRET;
const TEST_SECRET = "test-secret-for-backup-upload-unit-tests-32bytes!";

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
  (env as Record<string, unknown>)["NUTRITION_BACKUP_KEY_SECRET"] = TEST_SECRET;
});

afterEach(() => {
  (env as Record<string, unknown>)["NUTRITION_BACKUP_KEY_SECRET"] =
    ORIGINAL_SECRET;
});

describe("nutrition backup-upload handler", () => {
  it("happy path: upsert-ить blob у nutrition_backups і повертає { ok: true, savedAt }", async () => {
    const blob = { version: 2, entries: [{ id: "e1", kcal: 500 }] };
    const nowBefore = Date.now();

    const res = makeRes();
    await handler(makeReq("user_99", { blob }, "tok-xyz"), res);

    expect(res.statusCode).toBe(200);
    const body = asRecord(res.body);
    expect(body["ok"]).toBe(true);
    expect(typeof body["savedAt"]).toBe("number");
    expect(body["savedAt"] as number).toBeGreaterThanOrEqual(nowBefore);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO nutrition_backups/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, key\) DO UPDATE/);
    expect(params[0]).toBe("user_99");
    expect(typeof params[1]).toBe("string"); // HMAC key
    expect(JSON.parse(params[2] as string)).toEqual(blob);
  });

  it("кидає UnauthorizedError коли user відсутній у запиті", async () => {
    await expect(
      handler(makeReq(undefined, { blob: { v: 1 } }), makeRes()),
    ).rejects.toMatchObject({
      name: "UnauthorizedError",
      status: 401,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("кидає AppError(503) коли NUTRITION_BACKUP_KEY_SECRET не задано", async () => {
    (env as Record<string, unknown>)["NUTRITION_BACKUP_KEY_SECRET"] = undefined;

    await expect(
      handler(makeReq("user_1", { blob: { v: 1 } }), makeRes()),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 503,
      code: "BACKUP_DISABLED",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("кидає ValidationError коли blob відсутній у body (schema fail)", async () => {
    await expect(
      // Передаємо body без поля blob — BackupUploadSchema.safeParse провалиться.
      handler(makeReq("user_1", {}), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("кидає AppError(413) коли JSON blob перевищує 2.5 МБ", async () => {
    // Створюємо blob із ключем, чий JSON-рядок перевищує 2_500_000 байт.
    const hugeBlobValue = "x".repeat(2_500_001);
    const bigBlob = { data: hugeBlobValue };

    await expect(
      handler(makeReq("user_1", { blob: bigBlob }), makeRes()),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("пробрасує DB-помилки без перехоплення", async () => {
    const ioErr = Object.assign(new Error("ECONNRESET"), {
      code: "ECONNRESET",
    });
    queryMock.mockRejectedValueOnce(ioErr);

    await expect(
      handler(makeReq("user_1", { blob: { v: 1 } }), makeRes()),
    ).rejects.toThrow("ECONNRESET");
  });

  it("різні userId дають різні HMAC-ключі (ізоляція між юзерами)", async () => {
    const blob = { v: 1 };

    await handler(makeReq("alice", { blob }, "same-token"), makeRes());
    await handler(makeReq("bob", { blob }, "same-token"), makeRes());

    expect(queryMock).toHaveBeenCalledTimes(2);
    const keyAlice = queryMock.mock.calls[0]![1][1] as string;
    const keyBob = queryMock.mock.calls[1]![1][1] as string;
    // HMAC різного userId дає різний ключ.
    expect(keyAlice).not.toBe(keyBob);
  });
});
