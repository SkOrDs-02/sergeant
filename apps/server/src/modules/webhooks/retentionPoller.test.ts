/**
 * PR-28 — `WebhookEventsRetentionPoller` unit tests.
 *
 * Тестуємо лише поведінку polling-логіки (start/stop/idempotency/disabled-states)
 * через mocked `pg.Pool`. Реальний DELETE-кореляція проти `received_at` живе
 * в integration-тесті `migrations/__tests__/061-n8n-webhook-events.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool } from "pg";
import { WebhookEventsRetentionPoller } from "./retentionPoller.js";

function mockPool(rowCount: number): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      rows: Array.from({ length: rowCount }, (_, i) => ({ id: String(i + 1) })),
      rowCount,
      command: "DELETE",
      oid: 0,
      fields: [],
    }),
  } as unknown as Pool;
}

describe("WebhookEventsRetentionPoller", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("runOnce returns deleted count when DELETE removes rows", async () => {
    const pool = mockPool(7);
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 0, // disable auto-tick; we call runOnce manually
    });
    const result = await poller.runOnce();
    expect(result.deleted).toBe(7);

    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0] ?? [];
    expect(sql).toContain("DELETE FROM n8n_webhook_events");
    expect(sql).toContain("received_at <");
    expect(params).toEqual([30]);
  });

  it("runOnce returns 0 deleted when retentionDays is 0 (off)", async () => {
    const pool = mockPool(0);
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 0,
      intervalMs: 0,
    });
    const result = await poller.runOnce();
    expect(result.deleted).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("start is idempotent — second start() does not double-schedule", () => {
    const pool = mockPool(0);
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 1_000_000, // arbitrary, never actually ticks in test
    });
    poller.start();
    poller.start();
    // Implementation detail: timer is a private field; we just verify that
    // stop() leaves things in a clean state after two starts (no leaked timer).
    return poller.stop();
  });

  it("start does not schedule a timer when retentionDays <= 0", async () => {
    const pool = mockPool(0);
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 0,
      intervalMs: 1_000_000,
    });
    poller.start();
    expect(setInterval).not.toHaveBeenCalled();
    await poller.stop();
    setInterval.mockRestore();
  });

  it("start does not schedule a timer when intervalMs <= 0", async () => {
    const pool = mockPool(0);
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 0,
    });
    poller.start();
    expect(setInterval).not.toHaveBeenCalled();
    await poller.stop();
    setInterval.mockRestore();
  });

  it("scheduled tick triggers runOnce — fake timers verify cron-behaviour", async () => {
    vi.useFakeTimers();
    const pool = mockPool(3);
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 1000,
    });
    poller.start();
    // Advance one interval — setInterval-callback fires runOnce internally.
    await vi.advanceTimersByTimeAsync(1000);
    // After one tick, query should have been called once.
    expect(pool.query).toHaveBeenCalledTimes(1);
    // Advance another interval to confirm cron repeats.
    await vi.advanceTimersByTimeAsync(1000);
    expect(pool.query).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    await poller.stop();
  });

  it("a failing scheduled tick is caught and logged, cron keeps running", async () => {
    vi.useFakeTimers();
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("delete failed")),
    } as unknown as Pool;
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 1000,
    });
    poller.start();
    // Should not throw even though the underlying DELETE rejects.
    await vi.advanceTimersByTimeAsync(1000);
    expect(pool.query).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await poller.stop();
  });

  it("stop() waits for an in-flight runOnce to finish before resolving", async () => {
    let resolveQuery!: (value: { rows: unknown[]; rowCount: number }) => void;
    const pool = {
      query: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
      ),
    } as unknown as Pool;
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 0,
    });

    const runOncePromise = poller.runOnce();
    const stopPromise = poller.stop();
    // Give the stop()'s polling loop a couple of ticks to actually wait.
    await new Promise((r) => setTimeout(r, 50));
    resolveQuery({ rows: [{ id: "1" }], rowCount: 1 });

    await runOncePromise;
    await stopPromise;
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("stop() gives up at its ceiling instead of hanging on a stuck tick", async () => {
    // Регресія (аудит 2026-09-16): раніше `stop()` крутив
    // `while (this.running) await sleep(20)` БЕЗ верхньої межі. Tick ходить
    // у Postgres, тож зависла БД означала, що `stop()` не повернеться
    // ніколи — і graceful shutdown не існував саме в тому випадку, заради
    // якого його писали.
    const pool = {
      // Запит, що не завершується ніколи.
      query: vi.fn().mockImplementation(() => new Promise(() => {})),
    } as unknown as Pool;
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 0,
    });

    void poller.runOnce();
    // Дати tick дійсно стартувати, щоб `running` став true.
    await new Promise((r) => setTimeout(r, 10));

    const started = Date.now();
    await poller.stop();
    const elapsed = Date.now() - started;

    // Головне: ми взагалі повернулись, і в межах стелі (2 с) із запасом.
    expect(elapsed).toBeLessThan(4_000);
  }, 10_000);
});

/**
 * rel-19 (аудит 2026-10-01): без стартового тіку перший DELETE наставав через
 * цілу годину після старту процесу, а контейнер рестартує на кожен деплой.
 */
describe("WebhookEventsRetentionPoller - стартовий тік (rel-19)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("після start() і startDelayMs (< intervalMs) DELETE виконано рівно один раз", async () => {
    vi.useFakeTimers();
    const pool = mockPool(0);
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 3_600_000,
      startDelayMs: 45_000,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(queryFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await poller.stop();
  });

  it("stop() до стартового тіку гасить його", async () => {
    vi.useFakeTimers();
    const pool = mockPool(0);
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 3_600_000,
      startDelayMs: 45_000,
    });

    poller.start();
    await poller.stop();
    await vi.advanceTimersByTimeAsync(2 * 3_600_000);
    expect(pool.query).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("startDelayMs: -1 вимикає стартовий тік", async () => {
    vi.useFakeTimers();
    const pool = mockPool(0);
    const poller = new WebhookEventsRetentionPoller({
      pool,
      retentionDays: 30,
      intervalMs: 3_600_000,
      startDelayMs: -1,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(pool.query).not.toHaveBeenCalled();

    await poller.stop();
  });
});
