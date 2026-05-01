import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("../../routes/internal/categorize.js", () => ({
  categorizeTransaction: vi.fn(),
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
}));

vi.mock("../../obs/metrics.js", () => ({
  monoEnrichmentQueueDepth: { set: vi.fn(), reset: vi.fn() },
  monoEnrichmentProcessedTotal: { inc: vi.fn() },
  monoEnrichmentDurationMs: { observe: vi.fn() },
}));

import { categorizeTransaction as _categorize } from "../../routes/internal/categorize.js";
import {
  monoEnrichmentProcessedTotal as _processed,
  monoEnrichmentQueueDepth as _depth,
} from "../../obs/metrics.js";
import {
  runEnrichmentTick,
  sampleEnrichmentQueueDepth,
  startMonoEnrichmentWorker,
} from "./enrichmentWorker.js";

const categorize = _categorize as unknown as Mock;
const processedInc = (_processed as unknown as { inc: Mock }).inc;
const depthSet = (_depth as unknown as { set: Mock }).set;
const depthReset = (_depth as unknown as { reset: Mock }).reset;

// ── Helpers ──────────────────────────────────────────────────

interface MockPool {
  query: Mock;
}

function makePool(): Pool {
  return { query: vi.fn() } as unknown as Pool;
}

// ── Tests ────────────────────────────────────────────────────

describe("runEnrichmentTick — empty queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("повертає picked=0, не викликає categorize, якщо PICK не повернув row-ів", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await runEnrichmentTick(pool as unknown as Pool, {
      batchSize: 5,
    });

    expect(result).toEqual({ picked: 0, ok: 0, failed: 0, missingTx: 0 });
    expect(categorize).not.toHaveBeenCalled();
    expect(processedInc).not.toHaveBeenCalled();
  });

  it("якщо сам PICK-запит впав — tick повертає zeros, не throw-ить", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockRejectedValueOnce(new Error("connection refused"));

    const result = await runEnrichmentTick(pool as unknown as Pool);

    expect(result).toEqual({ picked: 0, ok: 0, failed: 0, missingTx: 0 });
  });
});

describe("runEnrichmentTick — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("успішно категоризує row → пише ai_category_slug, помічає row як done", async () => {
    const pool = makePool() as unknown as MockPool;

    // PICK → 1 row
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          user_id: "u1",
          mono_tx_id: "tx_001",
          attempts: 0,
        },
      ],
    });

    // FETCH_TX → tx з description+amount+mcc
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          description: "Сільпо",
          amount: -12500,
          mcc: 5411,
        },
      ],
    });

    // WRITE_BACK
    pool.query.mockResolvedValueOnce({ rowCount: 1 });
    // MARK_DONE
    pool.query.mockResolvedValueOnce({ rowCount: 1 });

    categorize.mockResolvedValueOnce({
      category: "groceries",
      confidence: 0.92,
    });

    const result = await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
    });

    expect(result.picked).toBe(1);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);

    // categorize отримав acknowledged input
    expect(categorize).toHaveBeenCalledWith({
      description: "Сільпо",
      amount: -12500,
      mcc: 5411,
    });

    // WRITE_BACK SQL отримав правильні params
    const writeBackCall = pool.query.mock.calls[2];
    expect(writeBackCall[0]).toMatch(/UPDATE mono_transaction/);
    expect(writeBackCall[0]).toMatch(/ai_category_slug/);
    expect(writeBackCall[1]).toEqual(["u1", "tx_001", "groceries", 0.92]);

    // MARK_DONE отримав id
    const markDoneCall = pool.query.mock.calls[3];
    expect(markDoneCall[0]).toMatch(/SET status = 'done'/);
    expect(markDoneCall[1]).toEqual([42]);

    expect(processedInc).toHaveBeenCalledWith({ outcome: "ok" });
  });

  it("якщо tx відсутня у mono_transaction (видалена) — closes row як done з outcome=missing_tx", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 7, user_id: "u1", mono_tx_id: "ghost", attempts: 0 }],
    });
    pool.query.mockResolvedValueOnce({ rows: [] }); // FETCH_TX → empty
    pool.query.mockResolvedValueOnce({ rowCount: 1 }); // MARK_DONE

    const result = await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
    });

    expect(result).toEqual({ picked: 1, ok: 0, failed: 0, missingTx: 1 });
    expect(categorize).not.toHaveBeenCalled();
    expect(processedInc).toHaveBeenCalledWith({ outcome: "missing_tx" });
  });

  it("якщо tx має порожній description — closes row як done з outcome=skipped", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 8, user_id: "u1", mono_tx_id: "tx_blank", attempts: 0 }],
    });
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "   ", amount: -100, mcc: null }],
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1 }); // MARK_DONE

    const result = await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
    });

    expect(result.ok).toBe(0);
    expect(result.failed).toBe(0);
    expect(categorize).not.toHaveBeenCalled();
    expect(processedInc).toHaveBeenCalledWith({ outcome: "skipped" });
  });
});

describe("runEnrichmentTick — error / retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("на помилку categorize: status=pending, attempts++, available_at у майбутньому", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 99, user_id: "u1", mono_tx_id: "tx_fail", attempts: 0 }],
    });
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "ATB", amount: -500, mcc: 5411 }],
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1 }); // MARK_RETRY

    categorize.mockRejectedValueOnce(new Error("upstream timeout"));

    const before = Date.now();
    const result = await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
      maxAttempts: 5,
    });
    const after = Date.now();

    expect(result.failed).toBe(1);
    expect(result.ok).toBe(0);

    const markRetry = pool.query.mock.calls[2];
    expect(markRetry[0]).toMatch(/SET status = \$2/);
    // params: [id, status, lastError, availableAt]
    expect(markRetry[1][0]).toBe(99);
    expect(markRetry[1][1]).toBe("pending"); // не вичерпали attempts
    expect(markRetry[1][2]).toMatch(/upstream timeout/);
    const availableAt = markRetry[1][3] as Date;
    expect(availableAt.getTime()).toBeGreaterThan(before);
    expect(availableAt.getTime()).toBeGreaterThan(after); // backoff > 0

    expect(processedInc).toHaveBeenCalledWith({ outcome: "failed" });
  });

  it("на останню (5-у) спробу: status=failed (вичерпали attempts)", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [
        // attempts = 4, тож 4+1 >= maxAttempts(5) → giveUp = true
        { id: 100, user_id: "u1", mono_tx_id: "tx_dead", attempts: 4 },
      ],
    });
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "X", amount: -100, mcc: null }],
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1 });

    categorize.mockRejectedValueOnce(new Error("persistent error"));

    await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
      maxAttempts: 5,
    });

    const markRetry = pool.query.mock.calls[2];
    expect(markRetry[1][1]).toBe("failed"); // вичерпано
  });

  it("backoff експоненційний: attempts=0 → ~30s, attempts=2 → ~120s", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, user_id: "u1", mono_tx_id: "t1", attempts: 0 },
        { id: 2, user_id: "u1", mono_tx_id: "t2", attempts: 2 },
      ],
    });
    // tx1 fetch + retry update
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "x", amount: 1, mcc: null }],
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1 });
    // tx2 fetch + retry update
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "y", amount: 2, mcc: null }],
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1 });

    categorize.mockRejectedValue(new Error("boom"));

    const t0 = Date.now();
    await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
      maxAttempts: 10,
    });

    const retry1 = pool.query.mock.calls[2][1];
    const retry2 = pool.query.mock.calls[4][1];
    const dt1 = (retry1[3] as Date).getTime() - t0;
    const dt2 = (retry2[3] as Date).getTime() - t0;

    // attempts=0 → 30s × 2^0 = 30s; attempts=2 → 30s × 2^2 = 120s.
    // Допустимо 5-секундний дрейф через виконання тесту.
    expect(dt1).toBeGreaterThanOrEqual(30_000 - 1000);
    expect(dt1).toBeLessThan(35_000);
    expect(dt2).toBeGreaterThanOrEqual(120_000 - 1000);
    expect(dt2).toBeLessThan(130_000);
  });

  it("якщо MARK_RETRY теж впав — tick не падає, лог error, переходить далі", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, user_id: "u1", mono_tx_id: "tx", attempts: 0 },
        { id: 2, user_id: "u1", mono_tx_id: "tx2", attempts: 0 },
      ],
    });
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "x", amount: 1, mcc: null }],
    });
    // MARK_RETRY 1 → throws
    pool.query.mockRejectedValueOnce(new Error("DB unavailable"));
    // tx2 продовжує: FETCH + MARK_DONE
    pool.query.mockResolvedValueOnce({
      rows: [{ description: "y", amount: 2, mcc: null }],
    });
    pool.query.mockResolvedValueOnce({ rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rowCount: 1 });

    categorize.mockRejectedValueOnce(new Error("Anthropic error"));
    categorize.mockResolvedValueOnce({ category: "other", confidence: 0 });

    const result = await runEnrichmentTick(pool as unknown as Pool, {
      categorize,
    });

    expect(result.picked).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.ok).toBe(1);
  });
});

describe("runEnrichmentTick — SQL invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PICK-запит використовує FOR UPDATE SKIP LOCKED і фільтрує по available_at", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({ rows: [] });

    await runEnrichmentTick(pool as unknown as Pool, { batchSize: 7 });

    const pickSql = pool.query.mock.calls[0][0] as string;
    expect(pickSql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(pickSql).toMatch(/available_at <= NOW\(\)/);
    expect(pickSql).toMatch(/status IN \('pending', 'failed'\)/);
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
  });
});

describe("sampleEnrichmentQueueDepth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("семплить depth по статусу і скидає попередні label-и через reset()", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockResolvedValueOnce({
      rows: [
        { status: "pending", count: 12 },
        { status: "processing", count: 0 },
        { status: "failed", count: 3 },
      ],
    });

    await sampleEnrichmentQueueDepth(pool as unknown as Pool);

    expect(depthReset).toHaveBeenCalledTimes(1);
    expect(depthSet).toHaveBeenCalledWith({ status: "pending" }, 12);
    expect(depthSet).toHaveBeenCalledWith({ status: "processing" }, 0);
    expect(depthSet).toHaveBeenCalledWith({ status: "failed" }, 3);
  });

  it("на помилку SQL — не throw-ить", async () => {
    const pool = makePool() as unknown as MockPool;
    pool.query.mockRejectedValueOnce(new Error("conn lost"));

    await expect(
      sampleEnrichmentQueueDepth(pool as unknown as Pool),
    ).resolves.toBeUndefined();
  });
});

// Регресія для бага, який Devin Review знайшов у PR #1251:
// `setInterval` пере-затирав `inflight` під час повільного tick-у, і stop()
// awaitив тільки ОСТАННЮ promise. Тепер scheduling зроблено через self-
// scheduling `setTimeout`-loop, який гарантовано не overlap-ить.
describe("startMonoEnrichmentWorker — non-overlapping ticks + graceful stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("не запускає наступний tick поки попередній не завершився, і stop() ловить in-flight tick", async () => {
    const pool = makePool() as unknown as MockPool;
    // Розрізняємо два запити одного `pool.query`-mock-а:
    //  - PICK (runEnrichmentTick): WITH next_batch AS … FOR UPDATE SKIP LOCKED.
    //  - SAMPLE (sampleEnrichmentQueueDepth): GROUP BY status.
    // PICK ми затримуємо (контрольовано через `releasePick`); SAMPLE віддає
    // одразу, щоб не плутати лічильник.
    let releasePick: (() => void) | null = null;
    let pickCallCount = 0;
    pool.query.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("GROUP BY status")) {
        return Promise.resolve({ rows: [] });
      }
      pickCallCount += 1;
      return new Promise((resolve) => {
        releasePick = () => resolve({ rows: [] });
      });
    });

    const worker = startMonoEnrichmentWorker(pool as unknown as Pool, {
      intervalMs: 1_000,
    });

    // Перший прогін стартує одразу. Чекаємо microtask flush, щоб
    // pool.query був викликаний.
    await Promise.resolve();
    await Promise.resolve();
    expect(pickCallCount).toBe(1);

    // Прокручуємо далеко вперед — якби це був setInterval, він би вистрелив
    // 10 разів і pickCallCount став би 11. З self-scheduling setTimeout-ом
    // НАСТУПНИЙ tick зашедулиться тільки після завершення попереднього,
    // тож рахунок має лишитися 1.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pickCallCount).toBe(1);

    // Завершуємо повільний tick — далі scheduleTick() поставить таймер на
    // intervalMs.
    if (!releasePick) throw new Error("releasePick not captured");
    (releasePick as () => void)();
    // Дочекатись fulfillment + scheduleTick.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    // Тепер вистрілив другий tick.
    expect(pickCallCount).toBe(2);

    // Робимо третій pick «in-flight» і викликаємо stop() — він має дочекатись.
    let stopResolved = false;
    const stopPromise = worker.stop().then(() => {
      stopResolved = true;
    });
    // stop() стрімить inflightTick → поки його не зарелізнуто, stop не resolve.
    await vi.advanceTimersByTimeAsync(0);
    expect(stopResolved).toBe(false);

    if (!releasePick) throw new Error("releasePick not captured");
    (releasePick as () => void)();
    await vi.advanceTimersByTimeAsync(0);
    await stopPromise;
    expect(stopResolved).toBe(true);

    vi.useRealTimers();
  });
});
