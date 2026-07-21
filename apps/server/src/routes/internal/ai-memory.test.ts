import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { startBackfillMock, runBackfillBatchMock, finalizeBackfillMock } =
  vi.hoisted(() => ({
    startBackfillMock: vi.fn(),
    runBackfillBatchMock: vi.fn(),
    finalizeBackfillMock: vi.fn(),
  }));

vi.mock("../../modules/ai-memory/backfill.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../modules/ai-memory/backfill.js")
    >();
  return {
    ...actual,
    startBackfill: startBackfillMock,
    runBackfillBatch: runBackfillBatchMock,
    finalizeBackfill: finalizeBackfillMock,
  };
});

async function makeApp(): Promise<express.Express> {
  const { createAiMemoryInternalRouter } = await import("./ai-memory.js");
  const app = express();
  app.use(express.json());
  app.use(
    createAiMemoryInternalRouter({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
    }),
  );
  const { errorHandler } = await import("../../http/errorHandler.js");
  app.use(errorHandler);
  return app;
}

describe("createAiMemoryInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a backfill and forwards parsed options", async () => {
    startBackfillMock.mockResolvedValueOnce({
      stateId: 42,
      totalCandidates: 17,
      estimatedCostUsd: 0.12,
      status: "running",
      budgetExceeded: false,
      voyageBudgetSoftUsd: 1,
    });
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/ai-memory/backfill/start")
      .send({
        founderUserId: "founder_opaque",
        daysWindow: 30,
        sourceMode: "cofounder",
        batchSize: 100,
        dryRun: true,
        topicFilter: ["finyk", "coach"],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      stateId: 42,
      totalCandidates: 17,
      estimatedCostUsd: 0.12,
      status: "running",
      budgetExceeded: false,
      voyageBudgetSoftUsd: 1,
    });
    expect(startBackfillMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "founder_opaque",
      daysWindow: 30,
      sourceMode: "cofounder",
      batchSize: 100,
      dryRun: true,
      topicFilter: ["finyk", "coach"],
    });
  });

  it("rejects invalid start payloads via the central validation shape", async () => {
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/ai-memory/backfill/start")
      .send({
        founderUserId: "founder_opaque",
        daysWindow: 366,
        sourceMode: "cofounder",
        batchSize: 100,
        dryRun: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
    expect(startBackfillMock).not.toHaveBeenCalled();
  });

  it("runs a batch and wraps the module payload with ok=true", async () => {
    runBackfillBatchMock.mockResolvedValueOnce({
      stateId: 42,
      processedInBatch: 3,
      enqueuedInBatch: 2,
      skippedDedupInBatch: 1,
      cumulativeProcessed: 8,
      cumulativeEnqueued: 6,
      hasMore: true,
      lastProcessedId: 9001,
    });
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/ai-memory/backfill/batch")
      .send({ stateId: 42, founderUserId: "founder_opaque" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      stateId: 42,
      processedInBatch: 3,
      hasMore: true,
    });
    expect(runBackfillBatchMock).toHaveBeenCalledWith(expect.anything(), {
      stateId: 42,
      founderUserId: "founder_opaque",
    });
  });

  it("finalizes with optional error text only when supplied", async () => {
    finalizeBackfillMock.mockResolvedValueOnce(undefined);
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/ai-memory/backfill/finalize")
      .send({
        stateId: 42,
        founderUserId: "founder_opaque",
        status: "aborted_error",
        error: "Voyage budget exceeded",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(finalizeBackfillMock).toHaveBeenCalledWith(expect.anything(), {
      stateId: 42,
      founderUserId: "founder_opaque",
      status: "aborted_error",
      error: "Voyage budget exceeded",
    });
  });
});
