import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

// Мокаємо node:fs/promises до завантаження handler-а — аналогічно
// backup-download.test.ts, щоб vi.mock-фабрика відпрацювала до реального import.
vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  },
}));

import fs from "node:fs/promises";
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
  vi.mocked(fs.mkdir).mockReset();
  vi.mocked(fs.writeFile).mockReset();
  (env as Record<string, unknown>)["NUTRITION_BACKUP_KEY_SECRET"] = TEST_SECRET;
});

afterEach(() => {
  (env as Record<string, unknown>)["NUTRITION_BACKUP_KEY_SECRET"] =
    ORIGINAL_SECRET;
});

describe("nutrition backup-upload handler", () => {
  it("happy path: зберігає blob на диск і повертає { ok: true, savedAt }", async () => {
    const blob = { version: 2, entries: [{ id: "e1", kcal: 500 }] };
    const nowBefore = Date.now();

    const res = makeRes();
    await handler(makeReq("user_99", { blob }, "tok-xyz"), res);

    expect(res.statusCode).toBe(200);
    const body = asRecord(res.body);
    expect(body["ok"]).toBe(true);
    expect(typeof body["savedAt"]).toBe("number");
    expect(body["savedAt"] as number).toBeGreaterThanOrEqual(nowBefore);

    // Переконуємось, що mkdir і writeFile були викликані рівно по одному разу.
    expect(vi.mocked(fs.mkdir)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledTimes(1);

    // Перевіряємо, що writeFile отримав правильний JSON та UTF-8 encoding.
    const [filePath, content, encoding] = vi.mocked(fs.writeFile).mock
      .calls[0] as [string, string, string];
    expect(encoding).toBe("utf8");
    expect(JSON.parse(content)).toEqual(blob);
    // Шлях файлу має містити "nutrition-backup-" і закінчуватись на ".json".
    expect(filePath).toMatch(/nutrition-backup-[0-9a-f]{32}\.json$/);
  });

  it("кидає UnauthorizedError коли user відсутній у запиті", async () => {
    await expect(
      handler(makeReq(undefined, { blob: { v: 1 } }), makeRes()),
    ).rejects.toMatchObject({
      name: "UnauthorizedError",
      status: 401,
    });
    expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
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
    expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
  });

  it("кидає ValidationError коли blob відсутній у body (schema fail)", async () => {
    await expect(
      // Передаємо body без поля blob — BackupUploadSchema.safeParse провалиться.
      handler(makeReq("user_1", {}), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: "Некоректні дані запиту",
    });
    expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
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
    expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
  });

  it("пробрасує fs.writeFile-помилки без перехоплення", async () => {
    const ioErr = Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
    vi.mocked(fs.writeFile).mockRejectedValueOnce(ioErr as never);

    await expect(
      handler(makeReq("user_1", { blob: { v: 1 } }), makeRes()),
    ).rejects.toThrow("EIO: i/o error");
  });

  it("різні userId дають різні шляхи файлів (ізоляція між юзерами)", async () => {
    const blob = { v: 1 };

    await handler(makeReq("alice", { blob }, "same-token"), makeRes());
    await handler(makeReq("bob", { blob }, "same-token"), makeRes());

    const calls = vi.mocked(fs.writeFile).mock.calls;
    expect(calls).toHaveLength(2);
    const [pathAlice] = calls[0] as [string, ...unknown[]];
    const [pathBob] = calls[1] as [string, ...unknown[]];
    // Шляхи мають відрізнятись — HMAC різного userId дає різний ключ.
    expect(pathAlice).not.toBe(pathBob);
  });
});
