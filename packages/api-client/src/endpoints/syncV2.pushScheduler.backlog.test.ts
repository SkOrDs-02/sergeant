import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSyncEnginePushScheduler,
  type SyncEnginePushSchedulerOptions,
} from "./syncV2.pushScheduler";
import type { SyncV2PushOp, SyncV2PushResponse } from "./syncV2";
import type {
  DrainedOutboxRowShape,
  SyncEnginePushDeps,
} from "./syncV2.pushLoop";

function queued(id: number): DrainedOutboxRowShape {
  return {
    id,
    table: "finyk_budgets",
    op: "insert",
    row: { id },
    clientTs: "2026-10-13T00:00:00.000Z",
    idempotencyKey: `backlog-${id}`,
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: "2026-10-13T00:00:00.000Z",
  };
}

function setup(
  count = 5,
  options: Partial<SyncEnginePushSchedulerOptions> = {},
) {
  const rows = Array.from({ length: count }, (_, i) => queued(i));
  const deps: SyncEnginePushDeps = {
    drain: vi.fn(async ({ limit }) => rows.slice(0, limit)),
    push: vi.fn(async (ops: readonly SyncV2PushOp[]) => ({
      accepted: ops.length,
      last_op_id: ops.length,
      results: ops.map((op) => ({
        idempotency_key: op.idempotency_key,
        status: "applied" as const,
      })),
    })),
    markSuccess: vi.fn(async (id) => {
      const i = rows.findIndex((row) => row.id === id);
      if (i >= 0) rows.splice(i, 1);
    }),
    markRetry: vi.fn(async () => {}),
    markRejected: vi.fn(async () => {}),
    now: () => new Date(),
    planRetry: () => ({
      status: "pending",
      attempts: 1,
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      lastError: "network",
    }),
  };
  const scheduler = createSyncEnginePushScheduler(
    {
      push: deps,
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (handle) =>
        clearInterval(handle as ReturnType<typeof setInterval>),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    { intervalMs: 30_000, limit: 2, catchUpDelayMs: 2_000, ...options },
  );
  return { scheduler, deps };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("push scheduler — bounded backlog catch-up", () => {
  it("continues a byte-limited partial batch and eventually sends every retained suffix row", async () => {
    const { scheduler, deps } = setup(5, { maxBodyBytes: 180 });
    scheduler.start();
    expect((await scheduler.flushNow()).hasMore).toBe(true);
    await vi.advanceTimersByTimeAsync(8_000);
    const calls = vi.mocked(deps.push).mock.calls;
    expect(calls.map(([ops]) => ops.length)).toEqual([1, 1, 1, 1, 1]);
    expect(
      new Set(calls.flatMap(([ops]) => ops.map((op) => op.idempotency_key)))
        .size,
    ).toBe(5);
    scheduler.stop();
  });

  it("stopping during an upload prevents its completion from scheduling more work", async () => {
    const { scheduler, deps } = setup();
    let release!: (value: SyncV2PushResponse) => void;
    vi.mocked(deps.push).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    scheduler.start();
    const pending = scheduler.flushNow();
    await vi.waitFor(() => expect(deps.push).toHaveBeenCalledTimes(1));
    scheduler.stop();
    release({
      accepted: 2,
      last_op_id: 2,
      results: [0, 1].map((id) => ({
        idempotency_key: `backlog-${id}`,
        status: "applied",
      })),
    });
    await pending;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.push).toHaveBeenCalledTimes(1);
  });

  it("continues a full acknowledged batch after the pacing delay and stops at a partial batch", async () => {
    const { scheduler, deps } = setup();
    scheduler.start();
    await scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(deps.push).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.push).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(deps.push).toHaveBeenCalledTimes(3);
    expect(vi.mocked(deps.push).mock.calls.map(([ops]) => ops.length)).toEqual([
      2, 2, 1,
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.push).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it("a transport retry leaves catch-up to the normal interval, instead of consuming more attempts", async () => {
    const { scheduler, deps } = setup();
    vi.mocked(deps.push).mockRejectedValueOnce(new Error("Failed to fetch"));
    scheduler.start();
    const result = await scheduler.flushNow();
    expect(result.retried).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.push).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("a missing receipt prevents fast continuation and does not delete unacknowledged data", async () => {
    const { scheduler, deps } = setup();
    vi.mocked(deps.push).mockResolvedValueOnce({
      accepted: 0,
      last_op_id: 0,
      results: [],
    });
    scheduler.start();
    await scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.markSuccess).not.toHaveBeenCalled();
    expect(deps.markRetry).toHaveBeenCalledTimes(2);
    expect(deps.push).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("stop cancels the scheduled continuation", async () => {
    const { scheduler, deps } = setup();
    scheduler.start();
    await scheduler.flushNow();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.push).toHaveBeenCalledTimes(1);
  });

  it("a manual flush replaces a waiting continuation without duplicating an upload", async () => {
    const { scheduler, deps } = setup();
    scheduler.start();
    await scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(1_000);
    await scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(deps.push).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(deps.push).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it("a one-off flush on a stopped scheduler never starts a background loop", async () => {
    const { scheduler, deps } = setup();
    await scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.push).toHaveBeenCalledTimes(1);
  });
});
