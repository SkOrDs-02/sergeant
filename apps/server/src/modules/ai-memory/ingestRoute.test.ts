import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { envMock, loggerMock, enqueueMemoryIngestMock } = vi.hoisted(() => ({
  envMock: {
    AI_MEMORY_ENABLED: true,
    AI_MEMORY_INGEST_MAX_CONTENT_LEN: 5000,
  },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  enqueueMemoryIngestMock: vi.fn(),
}));

vi.mock("../../env.js", () => ({ env: envMock }));
vi.mock("../../obs/logger.js", () => ({ logger: loggerMock }));
vi.mock("./ingestQueue.js", () => ({
  enqueueMemoryIngest: enqueueMemoryIngestMock,
}));

import { ingestMemoryHandler } from "./ingestRoute.js";

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

beforeEach(() => {
  vi.clearAllMocks();
  envMock.AI_MEMORY_ENABLED = true;
});

describe("ingestMemoryHandler", () => {
  it("returns 503 when AI memory is disabled", async () => {
    envMock.AI_MEMORY_ENABLED = false;
    const req = makeReq({ source: "nutrition", content: "ate a sandwich" });
    const res = makeRes();

    await ingestMemoryHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: "AI memory вимкнено на сервері",
      code: "AI_MEMORY_DISABLED",
    });
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("enqueues the ingest job and returns 202 with source/sourceRef", async () => {
    enqueueMemoryIngestMock.mockResolvedValue(undefined);
    const req = makeReq({
      source: "nutrition",
      sourceRef: "meal_123",
      content: "ate a sandwich",
      metadata: { calories: 400 },
    });
    const res = makeRes();

    await ingestMemoryHandler(req, res);

    expect(enqueueMemoryIngestMock).toHaveBeenCalledWith({
      userId: "user_1",
      source: "nutrition",
      sourceRef: "meal_123",
      content: "ate a sandwich",
      metadata: { calories: 400 },
    });
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      ok: true,
      source: "nutrition",
      sourceRef: "meal_123",
    });
  });

  it("defaults sourceRef to null when omitted", async () => {
    enqueueMemoryIngestMock.mockResolvedValue(undefined);
    const req = makeReq({ source: "journal", content: "morning pages" });
    const res = makeRes();

    await ingestMemoryHandler(req, res);

    const [call] = enqueueMemoryIngestMock.mock.calls[0] as [
      { sourceRef: unknown },
    ];
    expect(call.sourceRef).toBeNull();
    expect(res.body).toEqual({
      ok: true,
      source: "journal",
      sourceRef: null,
    });
  });

  it("rejects source=finyk (server-side-only source, excluded from client allowlist)", async () => {
    const req = makeReq({ source: "finyk", content: "manual expense" });
    const res = makeRes();
    await expect(ingestMemoryHandler(req, res)).rejects.toThrow();
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("rejects source=digest (server-side-only source)", async () => {
    const req = makeReq({ source: "digest", content: "weekly summary" });
    const res = makeRes();
    await expect(ingestMemoryHandler(req, res)).rejects.toThrow();
  });

  it("rejects an empty content string", async () => {
    const req = makeReq({ source: "chat", content: "" });
    const res = makeRes();
    await expect(ingestMemoryHandler(req, res)).rejects.toThrow();
  });

  it("returns 400 INVALID_METADATA when metadata is not JSON-serializable", async () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const req = makeReq({
      source: "chat",
      content: "hello",
      metadata: circular,
    });
    const res = makeRes();

    await ingestMemoryHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Некоректне metadata-поле (не JSON-серіалізовуване)",
      code: "INVALID_METADATA",
    });
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("returns 413 METADATA_TOO_LARGE when metadata exceeds 8KB", async () => {
    const req = makeReq({
      source: "chat",
      content: "hello",
      metadata: { blob: "x".repeat(9000) },
    });
    const res = makeRes();

    await ingestMemoryHandler(req, res);

    expect(res.statusCode).toBe(413);
    const body = res.body as { code: string };
    expect(body.code).toBe("METADATA_TOO_LARGE");
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("returns 500 ENQUEUE_FAILED when enqueueMemoryIngest throws", async () => {
    enqueueMemoryIngestMock.mockRejectedValue(new Error("redis down"));
    const req = makeReq({ source: "chat", content: "hello" });
    const res = makeRes();

    await ingestMemoryHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "Не вдалося enqueue-нути ingest-job",
      code: "ENQUEUE_FAILED",
    });
  });
});
