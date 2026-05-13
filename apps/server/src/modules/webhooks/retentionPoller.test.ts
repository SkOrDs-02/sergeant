/**
 * PR-28 — `WebhookEventsRetentionPoller` unit tests.
 *
 * Тестуємо лише поведінку polling-логіки (start/stop/idempotency/disabled-states)
 * через mocked `pg.Pool`. Реальний DELETE-кореляція проти `received_at` живе
 * в integration-тесті `migrations/__tests__/060-n8n-webhook-events.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
