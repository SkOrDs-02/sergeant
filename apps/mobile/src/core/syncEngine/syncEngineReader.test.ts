/**
 * Mobile tests for the sync v2 reader runtime.
 *
 * Mirrors `apps/web/src/core/syncEngine/syncEngineReader.test.ts` adapted for
 * the Jest runtime: `jest.mock()` replaces `vi.mock()`, `jest.fn()` replaces
 * `vi.fn()`, and imports omit the `.js` extensions that the web Vitest suite
 * needs.
 */

// Prefixed with `mock` so Jest's hoisting transform allows the reference
// inside the jest.mock() factory.
const mockApplyPullOp = jest.fn().mockResolvedValue("applied" as const);

jest.mock("./applyPullOp", () => ({
  applyPullOp: (...args: unknown[]) => mockApplyPullOp(...args),
}));

jest.mock("./refreshCachesAfterPull", () => ({
  refreshCachesAfterPull: jest.fn().mockResolvedValue(undefined),
}));

import { createSyncEngineReaderRuntime } from "./syncEngineReader";

describe("createSyncEngineReaderRuntime (mobile)", () => {
  beforeEach(() => {
    mockApplyPullOp.mockClear();
    mockApplyPullOp.mockResolvedValue("applied" as const);
  });

  it("pulls pages, applies ops, and advances the cursor", async () => {
    const pull = jest.fn().mockResolvedValue({
      ops: [
        {
          id: 5,
          table: "routine_entries",
          op: "insert",
          row: { id: "h1", user_id: "u1", name: "Run" },
          client_ts: "2026-07-10T08:00:00.000Z",
          server_ts: "2026-07-10T08:00:01.000Z",
          origin_device_id: "device-b",
        },
      ],
      next_cursor: null,
    });

    const runCalls: unknown[][] = [];
    const client = {
      all: jest.fn((sql: string) => {
        if (sql.includes("sync_op_cursor")) return [];
        return [];
      }),
      run: jest.fn((_sql: string, params?: readonly unknown[]) => {
        runCalls.push([...(params ?? [])]);
      }),
      exec: jest.fn(),
    };

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      eventTarget: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const result = await runtime.pullOnce();
    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toBe(0);
    expect(mockApplyPullOp).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledWith(0, {
      limit: 100,
      originDeviceId: "device-a",
    });
  });

  it("returns zero counts when userId is not resolved", async () => {
    const pull = jest.fn();
    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () =>
        ({ all: jest.fn(() => []), run: jest.fn(), exec: jest.fn() }) as never,
      resolveUserId: async () => null,
      originDeviceId: "device-a",
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      eventTarget: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const result = await runtime.pullOnce();
    expect(result.pulled).toBe(0);
    expect(result.applied).toBe(0);
    expect(pull).not.toHaveBeenCalled();
  });

  it("coalesces concurrent pullOnce calls into a single in-flight promise", async () => {
    const pull = jest.fn().mockResolvedValue({ ops: [], next_cursor: null });
    const client = {
      all: jest.fn(() => []),
      run: jest.fn(),
      exec: jest.fn(),
    };

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      eventTarget: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const [r1, r2] = await Promise.all([
      runtime.pullOnce(),
      runtime.pullOnce(),
    ]);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it("start/stop registers and removes eventTarget listener", () => {
    const pull = jest.fn().mockResolvedValue({ ops: [], next_cursor: null });
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    const setInterval = jest.fn();
    const clearInterval = jest.fn();

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () =>
        ({ all: jest.fn(() => []), run: jest.fn(), exec: jest.fn() }) as never,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval,
      clearInterval,
      eventTarget: { addEventListener, removeEventListener },
      intervalMs: 60_000,
      limit: 100,
    });

    runtime.start();
    expect(addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(setInterval).toHaveBeenCalledTimes(1);

    runtime.stop();
    expect(removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it("start is idempotent — registers listener only once", () => {
    const addEventListener = jest.fn();
    const runtime = createSyncEngineReaderRuntime({
      pull: jest.fn().mockResolvedValue({ ops: [], next_cursor: null }),
      resolveClient: async () =>
        ({ all: jest.fn(() => []), run: jest.fn(), exec: jest.fn() }) as never,
      resolveUserId: async () => null,
      originDeviceId: "device-a",
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      eventTarget: {
        addEventListener,
        removeEventListener: jest.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    runtime.start();
    runtime.start();
    expect(addEventListener).toHaveBeenCalledTimes(1);
  });

  it("paginates through multiple pages until next_cursor is null", async () => {
    const pull = jest
      .fn()
      .mockResolvedValueOnce({
        ops: [
          {
            id: 1,
            table: "routine_entries",
            op: "insert",
            row: { id: "e1", user_id: "u1" },
            client_ts: "2026-07-10T08:00:00.000Z",
            server_ts: "2026-07-10T08:00:00.000Z",
            origin_device_id: "device-b",
          },
        ],
        next_cursor: 1,
      })
      .mockResolvedValueOnce({
        ops: [
          {
            id: 2,
            table: "routine_entries",
            op: "insert",
            row: { id: "e2", user_id: "u1" },
            client_ts: "2026-07-10T09:00:00.000Z",
            server_ts: "2026-07-10T09:00:00.000Z",
            origin_device_id: "device-b",
          },
        ],
        next_cursor: null,
      });

    const client = {
      all: jest.fn(() => []),
      run: jest.fn(),
      exec: jest.fn(),
    };

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      eventTarget: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const result = await runtime.pullOnce();
    expect(pull).toHaveBeenCalledTimes(2);
    expect(result.pulled).toBe(2);
    expect(result.applied).toBe(2);
  });

  it("forwards captureException on pull failure", async () => {
    const pull = jest.fn().mockRejectedValue(new Error("network error"));
    const captureException = jest.fn();

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () =>
        ({ all: jest.fn(() => []), run: jest.fn(), exec: jest.fn() }) as never,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
      eventTarget: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
      captureException,
    });

    await expect(runtime.pullOnce()).rejects.toThrow("network error");
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-pull-tick",
    });
  });
});
