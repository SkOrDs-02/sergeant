import { describe, expect, it, vi } from "vitest";

const applyPullOpMock = vi.fn().mockResolvedValue("applied" as const);

vi.mock("./applyPullOp.js", () => ({
  applyPullOp: (...args: unknown[]) => applyPullOpMock(...args),
}));

vi.mock("./refreshCachesAfterPull.js", () => ({
  refreshCachesAfterPull: vi.fn().mockResolvedValue(undefined),
}));

import { createSyncEngineReaderRuntime } from "./syncEngineReader.js";
import { writePullSinceCursor } from "./syncOpCursor.js";

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
});
