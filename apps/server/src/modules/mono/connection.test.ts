import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("../../db.js", () => ({
  query: vi.fn(),
  // `connectHandler` triggers `historyFetch.ts` via `setImmediate(...)`,
  // which calls `pool.query(...)` after the handler returns. The mock
  // pool resolves to an empty row-set so the deferred backfill is a no-op
  // (Vitest otherwise reports "No 'pool' export is defined" as an
  // unhandled exception even though every test itself passes).
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  // T2 audit #10 — `historyFetch.ts` (called via `setImmediate` from
  // `connectHandler`) re-exports `redactKeyNames` / `redactPaths` for
  // ESLint-time PII discipline; mocking the logger without these breaks
  // module load with `No "redactKeyNames" export is defined`. Provide
  // empty arrays — they're not exercised by the connect/disconnect/
  // sync-state assertions, they only need to exist for the import to
  // resolve.
  redactKeyNames: [] as string[],
  redactPaths: [] as string[],
}));

vi.mock("../../obs/metrics.js", () => ({
  monoWebhookReceivedTotal: { inc: vi.fn() },
  monoWebhookDurationMs: { observe: vi.fn() },
}));

// `mockEnv` lives inside `vi.hoisted()` so it is initialised before the
// `vi.mock("../../env/env.js", …)` factory runs — `vi.mock` is hoisted to
// the top of the module by Vitest's transformer, so a plain top-level
// `const mockEnv = …` declaration is observed as TDZ inside the factory
// (`ReferenceError: Cannot access 'mockEnv' before initialization`).
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    MONO_WEBHOOK_ENABLED: true,
    MONO_TOKEN_ENC_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    PUBLIC_API_BASE_URL: "https://api.example.com",
  },
}));

vi.mock("../../env/env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockEnv as Record<string | symbol, unknown>)[prop];
      },
    },
  ),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { query as _query } from "../../db.js";
import {
  connectHandler,
  disconnectHandler,
  syncStateHandler,
} from "./connection.js";

const dbQuery = _query as unknown as Mock;

// ── Helpers ──────────────────────────────────────────────────

interface TestResBody {
  ok?: boolean;
  error?: string;
  code?: string;
  status?: string;
  accountsCount?: number;
  webhookActive?: boolean;
  lastEventAt?: string | null;
  lastBackfillAt?: string | null;
  upstream?: string;
}

interface TestRes {
  statusCode: number;
  body: TestResBody;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {} as TestResBody,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as TestResBody;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(body?: unknown): Request {
  return {
    method: "POST",
    body: body ?? {},
    user: { id: "user_1" },
  } as unknown as Request;
}

function makeReqNoUser(body?: unknown): Request {
  return {
    method: "POST",
    body: body ?? {},
  } as unknown as Request;
}

// ── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.MONO_WEBHOOK_ENABLED = true;
  mockEnv.MONO_TOKEN_ENC_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  mockEnv.PUBLIC_API_BASE_URL = "https://api.example.com";
});

describe("connectHandler", () => {
  it("returns 404 when MONO_WEBHOOK_ENABLED is false", async () => {
    mockEnv.MONO_WEBHOOK_ENABLED = false;
    const res = makeRes();
    await connectHandler(makeReq({ token: "valid_token_123" }), res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 401 when user is not authenticated", async () => {
    const res = makeRes();
    await connectHandler(makeReqNoUser({ token: "valid_token_123" }), res);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for invalid or missing token", async () => {
    const res = makeRes();
    await connectHandler(makeReq({ token: "" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when Monobank client-info returns 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    const res = makeRes();
    await connectHandler(makeReq({ token: "bad_token_12345" }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Invalid Monobank token");
    expect(res.body.code).toBe("MONO_TOKEN_INVALID");
    // Upstream body не має витікати до клієнта (може містити internal
    // details upstream-сервісу) — тільки нормалізований error/code.
    expect(res.body.upstream).toBeUndefined();
  });

  it("connects successfully: calls Monobank, upserts connection + accounts", async () => {
    const accounts = [
      { id: "acc_1", currencyCode: 980, balance: 100000 },
      { id: "acc_2", currencyCode: 840, balance: 5000 },
    ];

    // client-info success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ accounts }),
    });

    // webhook register success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // DB upserts: connection + 2 accounts
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const res = makeRes();
    await connectHandler(makeReq({ token: "valid_personal_token_12345" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.accountsCount).toBe(2);

    // 1 connection upsert + 2 account upserts = 3 DB calls
    expect(dbQuery).toHaveBeenCalledTimes(3);

    // Verify webhook registration was called
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const webhookCall = mockFetch.mock.calls[1]!;
    expect(webhookCall[0]!).toBe("https://api.monobank.ua/personal/webhook");
  });

  it("returns 502 when webhook registration fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

    const res = makeRes();
    await connectHandler(makeReq({ token: "valid_personal_token_12345" }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/register webhook/i);
    expect(res.body.code).toBe("MONO_UPSTREAM_ERROR");
    // Сирий upstream-боді ("Internal Server Error") не повертаємо клієнту.
    expect(res.body.upstream).toBeUndefined();
  });

  it("returns 504 when client-info fetch times out", async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException("signal timed out", "TimeoutError"),
    );

    const res = makeRes();
    await connectHandler(makeReq({ token: "valid_personal_token_12345" }), res);
    expect(res.statusCode).toBe(504);
    expect(res.body.error).toMatch(/не відповідає/i);
  });

  it("returns 504 when webhook registration fetch times out", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: [] }),
      })
      .mockRejectedValueOnce(
        new DOMException("signal timed out", "TimeoutError"),
      );

    const res = makeRes();
    await connectHandler(makeReq({ token: "valid_personal_token_12345" }), res);
    expect(res.statusCode).toBe(504);
    expect(res.body.error).toMatch(/не відповідає/i);
  });
});

describe("disconnectHandler", () => {
  it("returns 404 when MONO_WEBHOOK_ENABLED is false", async () => {
    mockEnv.MONO_WEBHOOK_ENABLED = false;
    const res = makeRes();
    await disconnectHandler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 401 when user is not authenticated", async () => {
    const res = makeRes();
    await disconnectHandler(makeReqNoUser(), res);
    expect(res.statusCode).toBe(401);
  });

  it("disconnects: decrypts token, unregisters webhook, deletes connection", async () => {
    // Import crypto to create a real encrypted token for the mock row
    const { encryptToken } = await import("./crypto.js");
    const enc = encryptToken(
      "test_token_for_disconnect",
      mockEnv.MONO_TOKEN_ENC_KEY,
    );

    // SELECT token data
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          token_ciphertext: enc.ciphertext,
          token_iv: enc.iv,
          token_tag: enc.tag,
        },
      ],
    });

    // Unregister webhook fetch
    mockFetch.mockResolvedValueOnce({ ok: true });

    // DELETE connection
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = makeRes();
    await disconnectHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify unregister call with empty webHookUrl
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const unregisterCall = mockFetch.mock.calls[0]!;
    expect(unregisterCall[0]!).toBe("https://api.monobank.ua/personal/webhook");
    const body = JSON.parse(unregisterCall[1]!.body as string);
    expect(body.webHookUrl).toBe("");
  });

  it("still deletes connection even if unregister fails", async () => {
    const { encryptToken } = await import("./crypto.js");
    const enc = encryptToken(
      "test_token_for_disconnect",
      mockEnv.MONO_TOKEN_ENC_KEY,
    );

    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          token_ciphertext: enc.ciphertext,
          token_iv: enc.iv,
          token_tag: enc.tag,
        },
      ],
    });

    mockFetch.mockRejectedValueOnce(new Error("network error"));

    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = makeRes();
    await disconnectHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("syncStateHandler", () => {
  it("returns 404 when MONO_WEBHOOK_ENABLED is false", async () => {
    mockEnv.MONO_WEBHOOK_ENABLED = false;
    const res = makeRes();
    await syncStateHandler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it("returns disconnected status when no connection exists", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const req = { method: "GET", user: { id: "user_1" } } as unknown as Request;
    const res = makeRes();
    await syncStateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("disconnected");
    expect(res.body.webhookActive).toBe(false);
    expect(res.body.accountsCount).toBe(0);
  });

  it("returns active status with account count from DB", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          status: "active",
          webhook_registered_at: "2026-04-25T10:00:00Z",
          last_event_at: "2026-04-25T12:00:00Z",
          last_backfill_at: null,
        },
      ],
    });
    dbQuery.mockResolvedValueOnce({ rows: [{ count: "3" }] });

    const req = { method: "GET", user: { id: "user_1" } } as unknown as Request;
    const res = makeRes();
    await syncStateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.webhookActive).toBe(true);
    expect(res.body.lastEventAt).toBe("2026-04-25T12:00:00Z");
    expect(res.body.accountsCount).toBe(3);
  });

  it("coerces pg Date objects to ISO strings (TIMESTAMPTZ columns)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          status: "active",
          webhook_registered_at: new Date("2026-04-25T10:00:00Z"),
          last_event_at: new Date("2026-04-25T12:00:00Z"),
          last_backfill_at: new Date("2026-04-26T08:30:00Z"),
        },
      ],
    });
    dbQuery.mockResolvedValueOnce({ rows: [{ count: "5" }] });

    const req = { method: "GET", user: { id: "user_1" } } as unknown as Request;
    const res = makeRes();
    await syncStateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.webhookActive).toBe(true);
    expect(res.body.lastEventAt).toBe("2026-04-25T12:00:00.000Z");
    expect(res.body.lastBackfillAt).toBe("2026-04-26T08:30:00.000Z");
    expect(res.body.accountsCount).toBe(5);
  });
});
