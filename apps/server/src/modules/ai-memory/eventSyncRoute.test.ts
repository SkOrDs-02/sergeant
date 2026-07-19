import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const {
  envMock,
  loggerMock,
  isProductMemoryEventMock,
  recordProductMemoryEventMock,
} = vi.hoisted(() => ({
  envMock: { AI_MEMORY_ENABLED: true },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  isProductMemoryEventMock: vi.fn(),
  recordProductMemoryEventMock: vi.fn(),
}));

vi.mock("../../env.js", () => ({ env: envMock }));
vi.mock("../../obs/logger.js", () => ({ logger: loggerMock }));
vi.mock("./eventSync.js", () => ({
  isProductMemoryEvent: isProductMemoryEventMock,
  recordProductMemoryEvent: recordProductMemoryEventMock,
}));

import { buildEventSyncHandler } from "./eventSyncRoute.js";

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

function makeReq(body: Record<string, unknown>, userId = "user_1"): Request {
  return { body, user: { id: userId } } as unknown as Request;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
  envMock.AI_MEMORY_ENABLED = true;
});

describe("buildEventSyncHandler", () => {
  it("returns 503 when AI memory is disabled", async () => {
    envMock.AI_MEMORY_ENABLED = false;
    const handler = buildEventSyncHandler(pool);
    const req = makeReq({ eventName: "signup_completed" });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: "AI memory вимкнено на сервері",
      code: "AI_MEMORY_DISABLED",
    });
    expect(recordProductMemoryEventMock).not.toHaveBeenCalled();
  });

  it("returns 200 {ok:false} for an event outside the allowlist (not an error)", async () => {
    isProductMemoryEventMock.mockReturnValue(false);
    const handler = buildEventSyncHandler(pool);
    const req = makeReq({ eventName: "some_random_event" });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: false, reason: "event_not_synced" });
    expect(recordProductMemoryEventMock).not.toHaveBeenCalled();
  });

  it("returns 202 with enqueued/sourceRef on a successful allowlisted event", async () => {
    isProductMemoryEventMock.mockReturnValue(true);
    recordProductMemoryEventMock.mockResolvedValue({
      enqueued: true,
      sourceRef: "signup_completed:user_1:2026-07-19",
      contentLength: 42,
    });
    const handler = buildEventSyncHandler(pool);
    const req = makeReq(
      { eventName: "signup_completed", payload: { plan: "pro" } },
      "user_1",
    );
    const res = makeRes();

    await handler(req, res);

    expect(recordProductMemoryEventMock).toHaveBeenCalledWith(pool, {
      userId: "user_1",
      eventName: "signup_completed",
      payload: { plan: "pro" },
    });
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      ok: true,
      enqueued: true,
      sourceRef: "signup_completed:user_1:2026-07-19",
    });
  });

  it("returns 500 when recordProductMemoryEvent throws unexpectedly", async () => {
    isProductMemoryEventMock.mockReturnValue(true);
    recordProductMemoryEventMock.mockRejectedValue(new Error("db down"));
    const handler = buildEventSyncHandler(pool);
    const req = makeReq({ eventName: "signup_completed" });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "Не вдалося обробити event-sync",
      code: "EVENT_SYNC_FAILED",
    });
  });

  it("rejects (schema validation throws) when eventName is missing", async () => {
    const handler = buildEventSyncHandler(pool);
    const req = makeReq({});
    const res = makeRes();

    await expect(handler(req, res)).rejects.toThrow();
    expect(recordProductMemoryEventMock).not.toHaveBeenCalled();
  });

  it("rejects when the body has an unknown extra key (schema is .strict())", async () => {
    const handler = buildEventSyncHandler(pool);
    const req = makeReq({ eventName: "signup_completed", extra: "nope" });
    const res = makeRes();

    await expect(handler(req, res)).rejects.toThrow();
  });
});
