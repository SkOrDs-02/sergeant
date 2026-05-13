/**
 * Status: Active.
 *
 * Unit tests для `runMccBatchTick` (PR-18 hourly batch fallback).
 * Перевіряє: empty buffer → no-op; happy path → write-back + MARK_DONE;
 * Anthropic-throw → ВСЕ у per-row queue через MARK_RETRY_SQL;
 * partial response → ok-items закриваються, missing-items повертаються
 * у буфер; idempotency.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";

vi.mock("../../env.js", () => ({
  env: {
    MCC_BATCH_MAX_SIZE: 100,
    MCC_BATCH_INTERVAL_MS: 3_600_000,
    ANTHROPIC_API_KEY: "test-key",
  },
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
  // sentry.ts imports redactKeyNames в module-scope; повертаємо [] як stub.
  redactKeyNames: [] as string[],
  redactPaths: [] as string[],
}));

vi.mock("../../obs/metrics.js", () => ({
  monoMccBatchProcessedTotal: { inc: vi.fn() },
  monoMccBatchSize: { observe: vi.fn() },
  monoMccBatchDurationMs: { observe: vi.fn() },
  monoMccBufferDepth: { set: vi.fn() },
}));

import {
  enqueueUnknownMcc,
  __resetForTests,
  currentBufferSize,
  type UnknownMccItem,
} from "../../lib/mcc/unknownQueue.js";
import { runMccBatchTick } from "./batchEnrichmentWorker.js";
import { monoMccBatchProcessedTotal } from "../../obs/metrics.js";

const processedInc = (monoMccBatchProcessedTotal as unknown as { inc: Mock })
  .inc;

function makePool(): Pool {
  return { query: vi.fn() } as unknown as Pool;
}

function mkItem(overrides: Partial<UnknownMccItem> = {}): UnknownMccItem {
  return {
    queueId: 1,
    userId: "u1",
    monoTxId: "tx_001",
    description: "shop",
    amount: -12500,
    mcc: 5499,
    enqueuedAt: 1_700_000_000_000,
    attempts: 0,
    ...overrides,
  };
}

describe("runMccBatchTick — empty buffer", () => {
  beforeEach(() => {
    __resetForTests();
    vi.clearAllMocks();
  });

  it("повертає zeros, не викликає Anthropic, не торкає БД", async () => {
    const pool = makePool();
    const anthropic = vi.fn();

    const result = await runMccBatchTick(pool, {
      anthropic: anthropic as never,
    });

    expect(result).toEqual({
      drained: 0,
      ok: 0,
      missing: 0,
      requeued: 0,
      failedTotal: 0,
    });
    expect(anthropic).not.toHaveBeenCalled();
    expect((pool.query as Mock).mock.calls).toHaveLength(0);
  });
});

describe("runMccBatchTick — happy path", () => {
  beforeEach(() => {
    __resetForTests();
    vi.clearAllMocks();
  });

  it("дренаж → Anthropic-виклик → write-back + MARK_DONE для ok-items", async () => {
    enqueueUnknownMcc(mkItem({ queueId: 11, monoTxId: "a" }), 100);
    enqueueUnknownMcc(mkItem({ queueId: 22, monoTxId: "b" }), 100);

    const pool = makePool();
    // 2 items × 2 queries (WRITE_BACK + MARK_DONE) = 4 successful UPDATE.
    (pool.query as Mock).mockResolvedValue({ rowCount: 1 });

    const anthropic = vi.fn().mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [
          {
            type: "text",
            text: '[{"i":0,"c":"groceries","conf":0.9},{"i":1,"c":"transport","conf":0.8}]',
          },
        ],
      },
    });

    const result = await runMccBatchTick(pool, {
      anthropic: anthropic as never,
    });

    expect(result.drained).toBe(2);
    expect(result.ok).toBe(2);
    expect(result.missing).toBe(0);
    expect(result.requeued).toBe(0);

    expect(anthropic).toHaveBeenCalledTimes(1);
    const [_apiKey, payload] = anthropic.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload["model"]).toBe("claude-haiku-4-5-20251001");

    // WRITE_BACK + MARK_DONE для item-1 (queueId=11)
    const calls = (pool.query as Mock).mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0]?.[0]).toMatch(/UPDATE mono_transaction/);
    expect(calls[0]?.[1]).toEqual(["u1", "a", "groceries", 0.9]);
    expect(calls[1]?.[0]).toMatch(/SET status = 'done'/);
    expect(calls[1]?.[1]).toEqual([11]);

    expect(calls[2]?.[1]).toEqual(["u1", "b", "transport", 0.8]);
    expect(calls[3]?.[1]).toEqual([22]);

    expect(processedInc).toHaveBeenCalledWith({ outcome: "ok" });
    expect(processedInc).toHaveBeenCalledTimes(2);

    // Буфер після ok-tick-у — пустий, items не повертаються.
    expect(currentBufferSize()).toBe(0);
  });
});

describe("runMccBatchTick — Anthropic fail → requeue all", () => {
  beforeEach(() => {
    __resetForTests();
    vi.clearAllMocks();
  });

  it("на Anthropic-throw — ВСЕ повертається у per-row queue через MARK_RETRY_SQL", async () => {
    enqueueUnknownMcc(mkItem({ queueId: 100 }), 100);
    enqueueUnknownMcc(mkItem({ queueId: 200 }), 100);

    const pool = makePool();
    (pool.query as Mock).mockResolvedValue({ rowCount: 1 });

    const anthropic = vi.fn().mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const result = await runMccBatchTick(pool, {
      anthropic: anthropic as never,
    });

    expect(result.drained).toBe(2);
    expect(result.ok).toBe(0);
    expect(result.requeued).toBe(2);

    // MARK_RETRY_SQL для обох queue.row-ів.
    const calls = (pool.query as Mock).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [sql, params] of calls) {
      expect(sql).toMatch(/SET status = 'pending'/);
      expect(sql).toMatch(/attempts \+ 1/);
      expect((params as unknown[])[1]).toMatch(/ETIMEDOUT/);
    }

    expect(processedInc).toHaveBeenCalledWith({ outcome: "requeued" });
    expect(processedInc).toHaveBeenCalledTimes(2);
    // Items не повертаються у буфер при full-batch-fail (вони пішли у per-row).
    expect(currentBufferSize()).toBe(0);
  });

  it("response.ok=false (5xx) — теж requeue all", async () => {
    enqueueUnknownMcc(mkItem(), 100);
    const pool = makePool();
    (pool.query as Mock).mockResolvedValue({ rowCount: 1 });
    const anthropic = vi.fn().mockResolvedValueOnce({
      response: { ok: false, status: 502 },
      data: null,
    });

    const result = await runMccBatchTick(pool, {
      anthropic: anthropic as never,
    });
    expect(result.requeued).toBe(1);
    expect(result.ok).toBe(0);
  });
});

describe("runMccBatchTick — partial response", () => {
  beforeEach(() => {
    __resetForTests();
    vi.clearAllMocks();
  });

  it("ok-items закриваються, missing-items повертаються у буфер з attempts++", async () => {
    enqueueUnknownMcc(mkItem({ queueId: 1, monoTxId: "a" }), 100);
    enqueueUnknownMcc(mkItem({ queueId: 2, monoTxId: "b" }), 100);
    enqueueUnknownMcc(mkItem({ queueId: 3, monoTxId: "c" }), 100);

    const pool = makePool();
    (pool.query as Mock).mockResolvedValue({ rowCount: 1 });

    // Claude поклав тільки index=0 і index=2 → index=1 (b) — missing.
    const anthropic = vi.fn().mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [
          {
            type: "text",
            text: '[{"i":0,"c":"groceries","conf":0.9},{"i":2,"c":"dining","conf":0.7}]',
          },
        ],
      },
    });

    const result = await runMccBatchTick(pool, {
      anthropic: anthropic as never,
    });

    expect(result.drained).toBe(3);
    expect(result.ok).toBe(2);
    expect(result.missing).toBe(1);
    expect(result.requeued).toBe(0);

    // Буфер тепер має 1 item (b з attempts=1).
    expect(currentBufferSize()).toBe(1);
  });

  it("item з attempts >= MAX_BUFFER_MISSED_TICKS-1 → redirect у per-row queue", async () => {
    enqueueUnknownMcc(mkItem({ queueId: 1, attempts: 2 }), 100);

    const pool = makePool();
    (pool.query as Mock).mockResolvedValue({ rowCount: 1 });

    // Anthropic відповідає нічим валідним для index=0
    const anthropic = vi.fn().mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "[]" }] },
    });

    const result = await runMccBatchTick(pool, {
      anthropic: anthropic as never,
    });

    expect(result.drained).toBe(1);
    expect(result.missing).toBe(0);
    expect(result.requeued).toBe(1);
    expect(currentBufferSize()).toBe(0);
  });
});

describe("runMccBatchTick — idempotency", () => {
  beforeEach(() => {
    __resetForTests();
    vi.clearAllMocks();
  });

  it("повторний tick з порожнім буфером — no-op (idempotent)", async () => {
    const pool = makePool();
    const anthropic = vi.fn();

    const a = await runMccBatchTick(pool, { anthropic: anthropic as never });
    const b = await runMccBatchTick(pool, { anthropic: anthropic as never });
    const c = await runMccBatchTick(pool, { anthropic: anthropic as never });

    for (const r of [a, b, c]) {
      expect(r).toEqual({
        drained: 0,
        ok: 0,
        missing: 0,
        requeued: 0,
        failedTotal: 0,
      });
    }
    expect(anthropic).not.toHaveBeenCalled();
  });
});
