import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { envMock, loggerMock, recallMock } = vi.hoisted(() => ({
  envMock: { AI_MEMORY_ENABLED: true, AI_MEMORY_TOP_K: 8 },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recallMock: vi.fn(),
}));

vi.mock("../../env.js", () => ({ env: envMock }));
vi.mock("../../obs/logger.js", () => ({ logger: loggerMock }));
vi.mock("./bootstrap.js", () => ({
  getAiMemory: () => ({ recall: recallMock }),
}));

import { recallMemoryHandler } from "./recallRoute.js";
import {
  MissingVoyageApiKeyError,
  VoyageHttpError,
  VoyageContractError,
} from "./embeddings.js";
import { CircuitOpenError } from "../../lib/circuitBreaker.js";

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

describe("recallMemoryHandler", () => {
  it("returns 503 when AI memory is disabled", async () => {
    envMock.AI_MEMORY_ENABLED = false;
    const req = makeReq({ query: "coffee spend" });
    const res = makeRes();

    await recallMemoryHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: "AI memory вимкнено на сервері",
      code: "AI_MEMORY_DISABLED",
    });
    expect(recallMock).not.toHaveBeenCalled();
  });

  it("returns 200 with serialized memories (createdAt as ISO string)", async () => {
    recallMock.mockResolvedValue([
      {
        id: 1,
        source: "chat",
        sourceRef: "ref_1",
        content: "user likes coffee",
        score: 0.92,
        createdAt: new Date("2026-07-19T10:00:00.000Z"),
        metadata: { tag: "food" },
      },
    ]);
    const req = makeReq({ query: "coffee spend", topK: 5 });
    const res = makeRes();

    await recallMemoryHandler(req, res);

    expect(recallMock).toHaveBeenCalledWith({
      userId: "user_1",
      query: "coffee spend",
      topK: 5,
      sources: undefined,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      memories: [
        {
          id: 1,
          source: "chat",
          sourceRef: "ref_1",
          content: "user likes coffee",
          score: 0.92,
          createdAt: "2026-07-19T10:00:00.000Z",
          metadata: { tag: "food" },
        },
      ],
    });
  });

  it("returns an empty array when no memories match", async () => {
    recallMock.mockResolvedValue([]);
    const req = makeReq({ query: "something obscure" });
    const res = makeRes();

    await recallMemoryHandler(req, res);

    expect(res.body).toEqual({ memories: [] });
  });

  it.each([
    ["MissingVoyageApiKeyError", new MissingVoyageApiKeyError()],
    ["VoyageHttpError", new VoyageHttpError(500, "boom", true)],
    ["VoyageContractError", new VoyageContractError("bad shape")],
    ["CircuitOpenError", new CircuitOpenError("voyage", 5000)],
  ])(
    "returns 503 EMBEDDING_PROVIDER_UNAVAILABLE when recall throws %s",
    async (_label, err) => {
      recallMock.mockRejectedValue(err);
      const req = makeReq({ query: "coffee spend" });
      const res = makeRes();

      await recallMemoryHandler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({
        error: "Провайдер ембеддингів тимчасово недоступний",
        code: "EMBEDDING_PROVIDER_UNAVAILABLE",
      });
    },
  );

  it("returns 500 RECALL_FAILED on an unexpected error", async () => {
    recallMock.mockRejectedValue(new Error("pgvector connection drop"));
    const req = makeReq({ query: "coffee spend" });
    const res = makeRes();

    await recallMemoryHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "Не вдалося виконати recall",
      code: "RECALL_FAILED",
    });
  });

  it("rejects when query is missing (schema validation)", async () => {
    const req = makeReq({});
    const res = makeRes();
    await expect(recallMemoryHandler(req, res)).rejects.toThrow();
    expect(recallMock).not.toHaveBeenCalled();
  });
});
