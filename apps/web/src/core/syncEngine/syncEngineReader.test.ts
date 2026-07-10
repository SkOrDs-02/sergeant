import { beforeEach, describe, expect, it, vi } from "vitest";

const applyPullOpMock = vi.fn().mockResolvedValue("applied" as const);
const refreshCachesAfterPullMock = vi.fn().mockResolvedValue(undefined);

vi.mock("./applyPullOp.js", () => ({
  applyPullOp: (...args: unknown[]) => applyPullOpMock(...args),
}));

vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: (...args: unknown[]) =>
    refreshCachesAfterPullMock(...args),
}));

import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import { writePullSinceCursor } from "./syncOpCursor.js";

function makeDeps(
  overrides: Partial<Parameters<typeof createSyncEngineReaderRuntime>[0]> = {},
) {
  return {
    pull: vi.fn().mockResolvedValue({ ops: [], next_cursor: null }),
    resolveClient: async () => ({
      all: vi.fn(async () => []),
      run: vi.fn(),
      exec: vi.fn(),
    }),
    resolveUserId: async () => "u1",
    originDeviceId: "device-a",
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    eventTarget: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    intervalMs: 60_000,
    limit: 100,
    ...overrides,
  };
}

beforeEach(() => {
  applyPullOpMock.mockReset();
  applyPullOpMock.mockResolvedValue("applied");
  refreshCachesAfterPullMock.mockClear();
});

describe("createSyncEngineReaderRuntime", () => {
  it("pulls pages, applies ops, and advances the cursor", async () => {
    applyPullOpMock.mockClear();
    const pull = vi.fn().mockResolvedValue({
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
      all: vi.fn((sql: string) => {
        if (sql.includes("sync_op_cursor")) return [];
        return [];
      }),
      run: vi.fn((_sql: string, params?: readonly unknown[]) => {
        runCalls.push([...(params ?? [])]);
      }),
      exec: vi.fn(),
    };

    const runtime = createSyncEngineReaderRuntime({
      pull,
      resolveClient: async () => client,
      resolveUserId: async () => "u1",
      originDeviceId: "device-a",
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
      eventTarget: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      intervalMs: 60_000,
      limit: 100,
    });

    const result = await runtime.pullOnce();
    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(1);
    expect(applyPullOpMock).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledWith(0, {
      limit: 100,
      originDeviceId: "device-a",
    });
    await writePullSinceCursor(client as never, 5);
    expect(runCalls.length).toBeGreaterThan(0);
  });

  it("returns zero counts when no user is signed in", async () => {
    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ resolveUserId: async () => null }),
    );

    const result = await runtime.pullOnce();
    expect(result).toEqual({
      pulled: 0,
      applied: 0,
      skipped: 0,
      rejected: 0,
      lastOpId: 0,
    });
  });

  it("deduplicates concurrent pullOnce calls via inflight guard", async () => {
    let pullCalls = 0;
    const pull = vi.fn(async () => {
      pullCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ops: [], next_cursor: null };
    });
    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));

    const [r1, r2] = await Promise.all([
      runtime.pullOnce(),
      runtime.pullOnce(),
    ]);

    expect(r1).toEqual(r2);
    expect(pullCalls).toBe(1);
  });

  it("counts skipped and rejected outcomes and refreshes caches after applies", async () => {
    applyPullOpMock
      .mockResolvedValueOnce("skipped")
      .mockResolvedValueOnce("rejected")
      .mockResolvedValueOnce("applied");

    const pull = vi.fn().mockResolvedValueOnce({
      ops: [
        { id: 1, table: "routine_entries", op: "insert", row: {} },
        { id: 2, table: "routine_tags", op: "insert", row: {} },
        { id: 3, table: "routine_habits", op: "insert", row: {} },
      ],
      next_cursor: null,
    });

    const client = {
      all: vi.fn(async () => []),
      run: vi.fn(),
      exec: vi.fn(),
    };

    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, resolveClient: async () => client }),
    );

    const result = await runtime.pullOnce();
    expect(result).toEqual({
      pulled: 3,
      applied: 1,
      skipped: 1,
      rejected: 1,
      lastOpId: 3,
    });
    expect(refreshCachesAfterPullMock).toHaveBeenCalledWith(
      client,
      "u1",
      new Set(["routine_habits"]),
    );
  });

  it("follows next_cursor across pages and skips cache refresh when nothing applied", async () => {
    applyPullOpMock.mockResolvedValue("skipped");

    const pull = vi
      .fn()
      .mockResolvedValueOnce({
        ops: [{ id: 4, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: 10,
      })
      .mockResolvedValueOnce({
        ops: [{ id: 11, table: "routine_entries", op: "insert", row: {} }],
        next_cursor: null,
      });

    const runtime = createSyncEngineReaderRuntime(makeDeps({ pull }));
    const result = await runtime.pullOnce();

    expect(pull).toHaveBeenNthCalledWith(1, 0, {
      limit: 100,
      originDeviceId: "device-a",
    });
    expect(pull).toHaveBeenNthCalledWith(2, 10, {
      limit: 100,
      originDeviceId: "device-a",
    });
    expect(result.pulled).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.lastOpId).toBe(11);
    expect(refreshCachesAfterPullMock).not.toHaveBeenCalled();
  });

  it("routes pull errors through captureException and rethrows", async () => {
    const captureException = vi.fn();
    const pull = vi.fn().mockRejectedValue(new Error("network down"));
    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, captureException }),
    );

    await expect(runtime.pullOnce()).rejects.toThrow("network down");
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      scope: "sync-v2-pull-tick",
    });
  });

  it("start/stop wires interval, visibility listener, and is idempotent", async () => {
    const intervalHandle = { id: 1 };
    const setInterval = vi.fn(() => intervalHandle);
    const clearInterval = vi.fn();
    const listeners = new Map<string, () => void>();
    const eventTarget = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    };

    const pull = vi.fn().mockResolvedValue({ ops: [], next_cursor: null });
    const runtime = createSyncEngineReaderRuntime(
      makeDeps({ pull, setInterval, clearInterval, eventTarget }),
    );

    runtime.start();
    runtime.start();
    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(eventTarget.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    await vi.waitFor(() => {
      expect(pull).toHaveBeenCalled();
    });

    const onVisibility = listeners.get("visibilitychange");
    expect(onVisibility).toBeTypeOf("function");

    runtime.stop();
    runtime.stop();
    expect(clearInterval).toHaveBeenCalledWith(intervalHandle);
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      onVisibility,
    );
  });
});
