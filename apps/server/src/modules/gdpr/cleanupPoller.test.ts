/**
 * `GdprCleanupPoller` unit tests — дзеркало
 * `modules/webhooks/retentionPoller.test.ts`.
 *
 * Тестуємо поведінку polling-логіки (start/stop/idempotency/overlap/
 * disabled-state) через mocked `pg.Pool` та інʼєктований `processBatch` —
 * сам batch-worker має власні тести у `cleanupWorker.test.ts`, тут його
 * SQL-послідовність не ганяємо.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool } from "pg";
import {
  GdprCleanupPoller,
  getGdprCleanupWorkerStatus,
} from "./cleanupPoller.js";
import type { ProcessGdprCleanupQueueResult } from "./cleanupWorker.js";
import { gdprCleanupQueueDepth } from "../../obs/metrics.js";

const emptyBatchResult: ProcessGdprCleanupQueueResult = {
  processed: 0,
  completed: 0,
  waitingOnConfig: 0,
  failed: 0,
  exhausted: 0,
  purged: 0,
  deadlineExceeded: false,
};

/** Pool-mock для депт-семплу (один SELECT ... FILTER на tick). */
function mockPool(pending = 0, stuck = 0): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      // pg віддає COUNT(...)::bigint як string — навмисно стрінги, щоб
      // закріпити Hard Rule #1 coercion.
      rows: [{ pending: String(pending), stuck: String(stuck) }],
      rowCount: 1,
    }),
  } as unknown as Pool;
}

describe("GdprCleanupPoller", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("runOnce calls the batch worker with the configured limit and samples metrics", async () => {
    const pool = mockPool(3, 1);
    const processBatch = vi
      .fn()
      .mockResolvedValue({ ...emptyBatchResult, processed: 3, completed: 3 });
    const setSpy = vi.spyOn(gdprCleanupQueueDepth, "set");
    const poller = new GdprCleanupPoller({
      pool,
      intervalMs: 0, // disable auto-tick; runOnce викликаємо вручну
      batchLimit: 7,
      processBatch,
    });

    const result = await poller.runOnce();
    expect(result).toMatchObject({ processed: 3, completed: 3 });
    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(processBatch).toHaveBeenCalledWith(pool, { limit: 7 });

    // Депт-семпл: один SELECT з ADR-0016 предикатом.
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql] = queryFn.mock.calls[0] ?? [];
    expect(sql).toContain("FROM gdpr_cleanup_queue");
    expect(sql).toContain("attempts > 5");
    // bigint-string → number (Hard Rule #1).
    expect(setSpy).toHaveBeenCalledWith({ status: "pending" }, 3);
    expect(setSpy).toHaveBeenCalledWith({ status: "stuck" }, 1);
    setSpy.mockRestore();
  });

  it("runOnce is overlap-guarded — a concurrent call returns null without a second batch", async () => {
    let resolveBatch!: (v: ProcessGdprCleanupQueueResult) => void;
    const processBatch = vi.fn().mockReturnValue(
      new Promise<ProcessGdprCleanupQueueResult>((resolve) => {
        resolveBatch = resolve;
      }),
    );
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 0,
      processBatch,
    });

    const first = poller.runOnce();
    const second = await poller.runOnce();
    expect(second).toBeNull();
    expect(processBatch).toHaveBeenCalledTimes(1);

    resolveBatch(emptyBatchResult);
    await first;
  });

  it("start is idempotent — second start() does not double-schedule", () => {
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 1_000_000, // arbitrary, never actually ticks in test
      processBatch: vi.fn().mockResolvedValue(emptyBatchResult),
    });
    poller.start();
    poller.start();
    return poller.stop();
  });

  it("start does not schedule a timer when intervalMs <= 0", async () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 0,
      processBatch: vi.fn().mockResolvedValue(emptyBatchResult),
    });
    poller.start();
    expect(setInterval).not.toHaveBeenCalled();
    await poller.stop();
    setInterval.mockRestore();
  });

  it("scheduled tick triggers the batch worker — fake timers verify cron-behaviour", async () => {
    vi.useFakeTimers();
    const processBatch = vi.fn().mockResolvedValue(emptyBatchResult);
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 1000,
      processBatch,
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(processBatch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(processBatch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    await poller.stop();
  });

  it("a failing scheduled tick is caught and logged, cron keeps running", async () => {
    vi.useFakeTimers();
    const processBatch = vi.fn().mockRejectedValue(new Error("batch failed"));
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 1000,
      processBatch,
    });
    poller.start();
    // Не повинно кинути, хоч batch-worker і реджектить.
    await vi.advanceTimersByTimeAsync(1000);
    expect(processBatch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(processBatch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    await poller.stop();
  });

  it("stop() waits for an in-flight runOnce to finish before resolving", async () => {
    let resolveBatch!: (v: ProcessGdprCleanupQueueResult) => void;
    const processBatch = vi.fn().mockReturnValue(
      new Promise<ProcessGdprCleanupQueueResult>((resolve) => {
        resolveBatch = resolve;
      }),
    );
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 0,
      processBatch,
    });

    const runOncePromise = poller.runOnce();
    const stopPromise = poller.stop();
    // Даємо stop()-полінгу пару tick-ів реально почекати.
    await new Promise((r) => setTimeout(r, 50));
    resolveBatch(emptyBatchResult);

    await runOncePromise;
    await stopPromise;
    expect(processBatch).toHaveBeenCalledTimes(1);
  });
});

describe("getGdprCleanupWorkerStatus", () => {
  it("returns coerced counts (bigint strings → numbers) and enabled from env default", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ pending: "4", stuck: "2", completed: "10", total: "14" }],
        rowCount: 1,
      }),
    } as unknown as Pool;
    const status = await getGdprCleanupWorkerStatus(pool);
    // Default env: GDPR_CLEANUP_POLL_INTERVAL_MS = 1 година → enabled.
    expect(status.enabled).toBe(true);
    expect(status.intervalMs).toBeGreaterThan(0);
    expect(status.queueDepth).toEqual({
      pending: 4,
      stuck: 2,
      completed: 10,
      total: 14,
    });
    expect(status.errorCode).toBeUndefined();
  });

  it("returns queueDepth=null + errorCode when the SQL fails, without throwing", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValue(
          Object.assign(
            new Error(
              'password authentication failed for user "sergeant_app" at 10.0.0.12:5432',
            ),
            { code: "28P01" },
          ),
        ),
    } as unknown as Pool;
    const status = await getGdprCleanupWorkerStatus(pool);
    expect(status.queueDepth).toBeNull();
    // Назовні — лише SQLSTATE-клас. Ані імʼя DB-користувача, ані внутрішній
    // хост не мають лишитись у відповіді анонімного `/health/workers`.
    expect(status.errorCode).toBe("28P01");
    expect(JSON.stringify(status)).not.toContain("sergeant_app");
    expect(JSON.stringify(status)).not.toContain("10.0.0.12");
  });
});

/**
 * rel-19 (аудит 2026-10-01): полер мав лише `setInterval`, тож перший тік
 * наставав через ГОДИНУ після старту процесу, а контейнер рестартує на кожен
 * деплой. Без стартового тіку тут 0 викликів після `startDelayMs`.
 */
describe("GdprCleanupPoller - стартовий тік (rel-19)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("після start() і startDelayMs (< intervalMs) batch викликано рівно один раз", async () => {
    vi.useFakeTimers();
    const processBatch = vi.fn().mockResolvedValue(emptyBatchResult);
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 3_600_000,
      startDelayMs: 60_000,
      processBatch,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(processBatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(processBatch).toHaveBeenCalledTimes(1);
    // До першого інтервального тіку ще далеко - стартовий тік одноразовий.
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(processBatch).toHaveBeenCalledTimes(1);

    await poller.stop();
  });

  it("без startDelayMs стартовий тік має jitter у межах 30-90 с", async () => {
    vi.useFakeTimers();
    const processBatch = vi.fn().mockResolvedValue(emptyBatchResult);
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 3_600_000,
      processBatch,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(processBatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(processBatch).toHaveBeenCalledTimes(1);

    await poller.stop();
  });

  it("stop() до стартового тіку гасить його", async () => {
    vi.useFakeTimers();
    const processBatch = vi.fn().mockResolvedValue(emptyBatchResult);
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 3_600_000,
      startDelayMs: 60_000,
      processBatch,
    });

    poller.start();
    await poller.stop();
    await vi.advanceTimersByTimeAsync(3_600_000 * 2);
    expect(processBatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("startDelayMs: 0 вимикає стартовий тік, інтервальний лишається", async () => {
    vi.useFakeTimers();
    const processBatch = vi.fn().mockResolvedValue(emptyBatchResult);
    const poller = new GdprCleanupPoller({
      pool: mockPool(),
      intervalMs: 3_600_000,
      startDelayMs: 0,
      processBatch,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(processBatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(processBatch).toHaveBeenCalledTimes(1);

    await poller.stop();
  });
});
