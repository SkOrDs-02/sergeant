/**
 * `/api/internal/ai-memory-dlq/*` route-level tests.
 *
 * Pattern: mock helpers (`dlq.js`, `ingestQueue.js`), focus на schema-validation
 * + handler-wiring. Helper-логіка покрита окремо у `modules/ai-memory/dlq.test.ts`.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DlqRow } from "../../modules/ai-memory/dlq.js";

const { listDlqRowsMock, markDlqRowReplayedMock, enqueueMemoryIngestMock } =
  vi.hoisted(() => ({
    listDlqRowsMock: vi.fn(),
    markDlqRowReplayedMock: vi.fn(),
    enqueueMemoryIngestMock: vi.fn(),
  }));

vi.mock("../../modules/ai-memory/dlq.js", async (origImport) => {
  const actual =
    await origImport<typeof import("../../modules/ai-memory/dlq.js")>();
  return {
    ...actual,
    listDlqRows: listDlqRowsMock,
    markDlqRowReplayed: markDlqRowReplayedMock,
  };
});

vi.mock("../../modules/ai-memory/ingestQueue.js", async (origImport) => {
  const actual =
    await origImport<typeof import("../../modules/ai-memory/ingestQueue.js")>();
  return {
    ...actual,
    enqueueMemoryIngest: enqueueMemoryIngestMock,
  };
});

async function makeApp(): Promise<express.Express> {
  const { createAiMemoryDlqInternalRouter } =
    await import("./ai-memory-dlq.js");
  const app = express();
  app.use(express.json());
  app.use(
    createAiMemoryDlqInternalRouter({
      pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } as never,
    }),
  );
  return app;
}

function sampleRow(overrides: Partial<DlqRow> = {}): DlqRow {
  return {
    id: 42,
    userId: "u1",
    source: "finyk",
    sourceRef: "tx-1",
    payloadJson: {
      userId: "u1",
      source: "finyk",
      sourceRef: "tx-1",
      content: "txn snapshot",
      metadata: { amount: 100 },
    },
    errorMsg: "Voyage 503",
    attempts: 5,
    lastAttemptAt: new Date("2026-05-15T12:00:00Z"),
    replayedAt: null,
    replayCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/internal/ai-memory-dlq/list", () => {
  it("повертає serialized rows (ISO dates)", async () => {
    listDlqRowsMock.mockResolvedValueOnce([sampleRow()]);

    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/ai-memory-dlq/list")
      .send({ source: "finyk", limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rows).toEqual([
      {
        id: 42,
        userId: "u1",
        source: "finyk",
        sourceRef: "tx-1",
        errorMsg: "Voyage 503",
        attempts: 5,
        lastAttemptAt: "2026-05-15T12:00:00.000Z",
        replayedAt: null,
        replayCount: 0,
      },
    ]);
  });

  it("default — includeReplayed=false", async () => {
    listDlqRowsMock.mockResolvedValueOnce([]);
    const app = await makeApp();
    await request(app).post("/api/internal/ai-memory-dlq/list").send({});
    expect(listDlqRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeReplayed: false, limit: 100 }),
    );
  });
});

describe("POST /api/internal/ai-memory-dlq/replay", () => {
  it("default dryRun=true — НЕ викликає enqueue", async () => {
    listDlqRowsMock.mockResolvedValueOnce([sampleRow()]);

    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/ai-memory-dlq/replay")
      .send({ source: "finyk" });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.attempted).toBe(1);
    expect(res.body.replayed).toBe(0);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
    expect(markDlqRowReplayedMock).not.toHaveBeenCalled();
  });

  it("dryRun=false — re-enqueue + mark replayed для кожного row", async () => {
    listDlqRowsMock.mockResolvedValueOnce([
      sampleRow({ id: 1 }),
      sampleRow({ id: 2, source: "chat", sourceRef: null }),
    ]);
    enqueueMemoryIngestMock.mockResolvedValue(undefined);

    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/ai-memory-dlq/replay")
      .send({ source: "finyk", dryRun: false });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
    expect(res.body.attempted).toBe(2);
    expect(res.body.replayed).toBe(2);
    expect(enqueueMemoryIngestMock).toHaveBeenCalledTimes(2);
    expect(markDlqRowReplayedMock).toHaveBeenCalledTimes(2);
    expect(markDlqRowReplayedMock).toHaveBeenCalledWith(1);
    expect(markDlqRowReplayedMock).toHaveBeenCalledWith(2);
  });

  it("400 коли жоден з filter-ів не переданий", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/ai-memory-dlq/replay")
      .send({ dryRun: false });

    expect(res.status).toBe(400);
    expect(enqueueMemoryIngestMock).not.toHaveBeenCalled();
  });

  it("eventIds[] override-ить інші фільтри", async () => {
    listDlqRowsMock.mockResolvedValueOnce([sampleRow({ id: 99 })]);

    const app = await makeApp();
    await request(app)
      .post("/api/internal/ai-memory-dlq/replay")
      .send({ eventIds: [99], source: "finyk", dryRun: true });

    expect(listDlqRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [99] }),
    );
  });

  it("limit cap = 1000 (schema reject)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/ai-memory-dlq/replay")
      .send({ source: "finyk", limit: 5000 });

    expect(res.status).toBe(400);
  });
});
