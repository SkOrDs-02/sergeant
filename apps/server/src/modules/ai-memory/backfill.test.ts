import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock metrics + sentry + logger same way як ingestQueue.test.ts —
// тести перевіряють контракт, без живого Redis / Sentry / Prom.
vi.mock("../../obs/metrics.js", () => ({
  aiMemoryIngestEnqueuedTotal: { inc: vi.fn() },
  aiMemoryIngestProcessedTotal: { inc: vi.fn() },
  aiMemoryIngestDurationMs: { observe: vi.fn() },
  aiMemoryIngestQueueDepth: { reset: vi.fn(), set: vi.fn() },
}));

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  serializeError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
  redactKeyNames: [],
}));

vi.mock("../../sentry.js", () => ({
  Sentry: { captureMessage: vi.fn(), addBreadcrumb: vi.fn() },
}));

// Don't enqueue для реальної Redis; stub enqueueMemoryIngest.
vi.mock("./ingestQueue.js", () => ({
  enqueueMemoryIngest: vi.fn(async () => undefined),
}));

import {
  buildCandidatesPredicate,
  buildIngestPayload,
  estimateVoyageCostUsd,
  startBackfill,
  runBackfillBatch,
  finalizeBackfill,
} from "./backfill.js";
import { enqueueMemoryIngest } from "./ingestQueue.js";
import { Sentry } from "../../sentry.js";

const enqueueMock = enqueueMemoryIngest as unknown as ReturnType<typeof vi.fn>;
const breadcrumbMock = (
  Sentry as unknown as { addBreadcrumb: ReturnType<typeof vi.fn> }
).addBreadcrumb;

/**
 * Minimal `pg.Pool`-stub. Кожен тест задає `queryHandlers` як FIFO-чергу
 * відповідей; black-box-перевірка SQL — через текст-substring і кількість
 * params. Не використовуємо Testcontainers тут — backfill.integration.test.ts
 * (окремо) робить end-to-end з реальним Postgres.
 */
function makeFakePool(
  queryHandlers: Array<(sql: string, params?: unknown[]) => unknown>,
): {
  pool: { query: ReturnType<typeof vi.fn> };
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queue = [...queryHandlers];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    const next = queue.shift();
    if (!next) {
      throw new Error(`unexpected query #${calls.length}: ${sql.slice(0, 60)}`);
    }
    return next(sql, params);
  });
  return { pool: { query }, calls };
}

beforeEach(() => {
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue(undefined);
  breadcrumbMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estimateVoyageCostUsd", () => {
  it("returns 0 для пустих/негативних inputs", () => {
    expect(estimateVoyageCostUsd(0)).toBe(0);
    expect(estimateVoyageCostUsd(-1)).toBe(0);
  });

  it("обчислює як chars/4/1M*0.02", () => {
    // 1M chars → 250k tokens → $0.005
    expect(estimateVoyageCostUsd(1_000_000)).toBeCloseTo(0.005, 6);
    // 200k chars → 50k tokens → $0.001
    expect(estimateVoyageCostUsd(200_000)).toBeCloseTo(0.001, 6);
  });
});

describe("buildCandidatesPredicate", () => {
  it("базовий window — days + text<>''  + NOT EXISTS", () => {
    const p = buildCandidatesPredicate({ daysWindow: 30 });
    expect(p.whereClause).toContain(
      "sent_at > NOW() - ($1::int * INTERVAL '1 day')",
    );
    expect(p.whereClause).toContain("text <> ''");
    expect(p.whereClause).toContain("NOT EXISTS");
    expect(p.whereClause).toContain("ai_memories");
    expect(p.whereClause).toContain("source = 'cofounder'");
    expect(p.whereClause).toContain("'tg_archive:'");
    expect(p.params).toEqual([30]);
  });

  it("topic-filter додає ANY($N::text[])", () => {
    const p = buildCandidatesPredicate({
      daysWindow: 7,
      topicFilter: ["incidents", "ops"],
    });
    expect(p.whereClause).toContain("topic = ANY($2::text[])");
    expect(p.params).toEqual([7, ["incidents", "ops"]]);
  });
});

describe("buildIngestPayload", () => {
  it("source = 'cofounder', source_ref = 'tg_archive:<id>'", () => {
    const payload = buildIngestPayload(
      {
        id: 42,
        text: "Alert: PR-19 ingest activated",
        topic: "incidents",
        source: "alert",
        sent_at: new Date("2026-05-01T10:00:00Z"),
      },
      "user-f1",
    );
    expect(payload.userId).toBe("user-f1");
    expect(payload.source).toBe("cofounder");
    expect(payload.sourceRef).toBe("tg_archive:42");
    expect(payload.content).toBe("Alert: PR-19 ingest activated");
    expect(payload.metadata).toMatchObject({
      backfill: true,
      tg_topic_archive_id: 42,
      tg_archive_source: "alert",
      tg_topic: "incidents",
      sent_at: "2026-05-01T10:00:00.000Z",
    });
  });
});

describe("startBackfill", () => {
  it("dry_run=true → status='dry_run_completed', counts populated", async () => {
    const { pool, calls } = makeFakePool([
      // COUNT query
      () => ({ rows: [{ total: 1234, total_chars: "5000000" }] }),
      // INSERT state
      () => ({ rows: [{ id: 7 }] }),
    ]);
    const out = await startBackfill(pool as unknown as import("pg").Pool, {
      founderUserId: "user-f1",
      daysWindow: 90,
      sourceMode: "cofounder",
      batchSize: 100,
      dryRun: true,
    });
    expect(out.stateId).toBe(7);
    expect(out.totalCandidates).toBe(1234);
    // 5M chars → 1.25M tokens → $0.025
    expect(out.estimatedCostUsd).toBeCloseTo(0.025, 4);
    expect(out.status).toBe("dry_run_completed");
    expect(calls[0]?.sql).toContain("SELECT COUNT(*)");
    expect(calls[1]?.sql).toContain("INSERT INTO ai_memory_backfill_state");
  });

  it("execute з cost ≤ budget → status='running'", async () => {
    const { pool } = makeFakePool([
      () => ({ rows: [{ total: 10, total_chars: "1000" }] }),
      () => ({ rows: [{ id: 1 }] }),
    ]);
    const out = await startBackfill(pool as unknown as import("pg").Pool, {
      founderUserId: "user-f1",
      daysWindow: 30,
      sourceMode: "cofounder",
      batchSize: 50,
      dryRun: false,
    });
    expect(out.status).toBe("running");
    expect(out.budgetExceeded).toBe(false);
  });

  it("execute з cost > VOYAGE_DAILY_BUDGET_USD_SOFT → status='aborted_budget'", async () => {
    // soft budget default = 1 USD. Згенеруємо 1B chars → ~$5.
    const { pool } = makeFakePool([
      () => ({ rows: [{ total: 1, total_chars: "1000000000" }] }),
      () => ({ rows: [{ id: 5 }] }),
    ]);
    const out = await startBackfill(pool as unknown as import("pg").Pool, {
      founderUserId: "user-f1",
      daysWindow: 365,
      sourceMode: "cofounder",
      batchSize: 100,
      dryRun: false,
    });
    expect(out.budgetExceeded).toBe(true);
    expect(out.status).toBe("aborted_budget");
    expect(breadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "ai-memory.backfill",
        level: "warning",
      }),
    );
  });

  it("invalid input → throw", async () => {
    const { pool } = makeFakePool([]);
    await expect(
      startBackfill(pool as unknown as import("pg").Pool, {
        founderUserId: "u",
        daysWindow: 0,
        sourceMode: "cofounder",
        batchSize: 1,
        dryRun: false,
      }),
    ).rejects.toThrow(/daysWindow/);
    await expect(
      startBackfill(pool as unknown as import("pg").Pool, {
        founderUserId: "u",
        daysWindow: 7,
        sourceMode: "cofounder",
        batchSize: 0,
        dryRun: false,
      }),
    ).rejects.toThrow(/batchSize/);
    await expect(
      startBackfill(pool as unknown as import("pg").Pool, {
        founderUserId: "u",
        daysWindow: 7,
        sourceMode: "all",
        batchSize: 10,
        dryRun: false,
      }),
    ).rejects.toThrow(/sourceMode='all'/);
  });
});

describe("runBackfillBatch", () => {
  it("enqueues кожен row + bumps cursor + counters", async () => {
    const { pool, calls } = makeFakePool([
      // SELECT state
      () => ({
        rows: [
          {
            id: 7,
            days_window: 30,
            batch_size: 100,
            last_processed_id: "0",
            processed_count: 0,
            enqueued_count: 0,
            skipped_dedup_count: 0,
            dry_run: false,
            status: "running",
            metadata: {},
          },
        ],
      }),
      // SELECT batch
      () => ({
        rows: [
          {
            id: "1",
            text: "hello",
            topic: "ops",
            source: "alert",
            sent_at: new Date("2026-05-01T10:00:00Z"),
          },
          {
            id: "2",
            text: "world",
            topic: "ops",
            source: "alert",
            sent_at: new Date("2026-05-02T10:00:00Z"),
          },
        ],
      }),
      // UPDATE state
      () => ({ rows: [] }),
    ]);

    const out = await runBackfillBatch(pool as unknown as import("pg").Pool, {
      stateId: 7,
      founderUserId: "user-f1",
    });
    expect(out.processedInBatch).toBe(2);
    expect(out.enqueuedInBatch).toBe(2);
    expect(out.lastProcessedId).toBe(2);
    expect(out.hasMore).toBe(false); // 2 < batch_size=100
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "cofounder",
        sourceRef: "tg_archive:1",
      }),
    );
    expect(calls[2]?.sql).toContain("UPDATE ai_memory_backfill_state");
  });

  it("skipped_dedup_count++ для пустих text", async () => {
    const { pool } = makeFakePool([
      () => ({
        rows: [
          {
            id: 8,
            days_window: 7,
            batch_size: 50,
            last_processed_id: "10",
            processed_count: 5,
            enqueued_count: 4,
            skipped_dedup_count: 1,
            dry_run: false,
            status: "running",
            metadata: {},
          },
        ],
      }),
      () => ({
        rows: [
          {
            id: "11",
            text: "",
            topic: "ops",
            source: "alert",
            sent_at: new Date(),
          },
          {
            id: "12",
            text: "  ",
            topic: "ops",
            source: "alert",
            sent_at: new Date(),
          },
          {
            id: "13",
            text: "real text",
            topic: "ops",
            source: "alert",
            sent_at: new Date(),
          },
        ],
      }),
      () => ({ rows: [] }),
    ]);
    const out = await runBackfillBatch(pool as unknown as import("pg").Pool, {
      stateId: 8,
      founderUserId: "user-f1",
    });
    expect(out.processedInBatch).toBe(3);
    expect(out.enqueuedInBatch).toBe(1);
    expect(out.skippedDedupInBatch).toBe(2);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it("hasMore=true коли batch full", async () => {
    const { pool } = makeFakePool([
      () => ({
        rows: [
          {
            id: 9,
            days_window: 30,
            batch_size: 2,
            last_processed_id: "0",
            processed_count: 0,
            enqueued_count: 0,
            skipped_dedup_count: 0,
            dry_run: false,
            status: "running",
            metadata: {},
          },
        ],
      }),
      () => ({
        rows: [
          {
            id: "1",
            text: "a",
            topic: "ops",
            source: "alert",
            sent_at: new Date(),
          },
          {
            id: "2",
            text: "b",
            topic: "ops",
            source: "alert",
            sent_at: new Date(),
          },
        ],
      }),
      () => ({ rows: [] }),
    ]);
    const out = await runBackfillBatch(pool as unknown as import("pg").Pool, {
      stateId: 9,
      founderUserId: "user-f1",
    });
    expect(out.hasMore).toBe(true);
  });

  it("rejects якщо state не 'running'", async () => {
    const { pool } = makeFakePool([
      () => ({
        rows: [
          {
            id: 10,
            days_window: 30,
            batch_size: 50,
            last_processed_id: "0",
            processed_count: 0,
            enqueued_count: 0,
            skipped_dedup_count: 0,
            dry_run: true,
            status: "dry_run_completed",
            metadata: {},
          },
        ],
      }),
    ]);
    await expect(
      runBackfillBatch(pool as unknown as import("pg").Pool, {
        stateId: 10,
        founderUserId: "user-f1",
      }),
    ).rejects.toThrow(/status=dry_run_completed/);
  });
});

describe("finalizeBackfill", () => {
  it("UPDATE-ить status + emits Sentry breadcrumb (info на completed)", async () => {
    const { pool, calls } = makeFakePool([() => ({ rows: [] })]);
    await finalizeBackfill(pool as unknown as import("pg").Pool, {
      stateId: 11,
      founderUserId: "user-f1",
      status: "completed",
    });
    expect(calls[0]?.sql).toContain("UPDATE ai_memory_backfill_state");
    expect(breadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: "info" }),
    );
  });

  it("error path emits 'warning'-level breadcrumb", async () => {
    const { pool } = makeFakePool([() => ({ rows: [] })]);
    await finalizeBackfill(pool as unknown as import("pg").Pool, {
      stateId: 12,
      founderUserId: "user-f1",
      status: "aborted_error",
      error: "Voyage 500 streak",
    });
    expect(breadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warning" }),
    );
  });
});
