// @vitest-environment jsdom
/**
 * Integration tests for the cloud-sync offline queue + replay-on-reconnect
 * flow. Covers:
 *   1. Offline → many writes → coalesce into a single push entry
 *   2. Reconnect replay (happy path) — queue drained, status events emitted
 *   3. Reconnect replay (server error) — queue preserved, retryable errors
 *   4. MAX_OFFLINE_QUEUE overflow — oldest entries dropped
 *
 * Stack: Vitest + jsdom. Server responses are mocked via vi.mock on syncApi
 * (same pattern as engine/push.test.ts). No MSW here because the replay
 * engine calls syncApi.pushAll directly — MSW would only intercept fetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError } from "@sergeant/api-client";

// --- mocks -----------------------------------------------------------
// Mock syncApi.pushAll — the only network call replay makes.
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    syncApi: {
      pullAll: vi.fn(),
      pushAll: vi.fn(),
      push: vi.fn(),
      pull: vi.fn(),
    },
  };
});

// Mock retryAsync so it calls fn() once without delays (avoids real timers).
// For error scenarios we let the error propagate so replay's catch-block runs.
vi.mock("../engine/retryAsync", () => ({
  retryAsync: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Silence debug logger and debug-state writes in test output.
vi.mock("../debugState", () => ({
  updateDebugSnapshot: vi.fn(),
  getDebugSnapshot: vi.fn(() => ({
    state: "idle",
    lastSyncAt: null,
    lastError: null,
    lastAction: null,
    syncId: 0,
  })),
  subscribeDebug: vi.fn(() => () => {}),
}));
vi.mock("../logger", () => ({
  syncLog: {
    enqueue: vi.fn(),
    scheduleSync: vi.fn(),
    syncStart: vi.fn(),
    syncSuccess: vi.fn(),
    syncError: vi.fn(),
    stateChange: vi.fn(),
    retry: vi.fn(),
    supersededCallback: vi.fn(),
  },
}));

import { syncApi } from "@shared/api";
import { addToOfflineQueue, getOfflineQueue } from "../queue/offlineQueue";
import { MAX_OFFLINE_QUEUE, OFFLINE_QUEUE_KEY } from "../config";
import { SYNC_STATUS_EVENT } from "../state/events";

// replay.ts has module-level `replaying` guard; we must get a fresh module
// for each test so the guard resets. Dynamic import after resetModules gives
// us that isolation.
async function freshReplay() {
  // Reset the module registry for replay only — other mocks stay.
  const mod = await import("../engine/replay");
  return mod.replayOfflineQueue;
}

const mockedPushAll = syncApi.pushAll as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockedPushAll.mockReset();
});
afterEach(() => {
  localStorage.clear();
});

// =========================================================================
// 1. Offline → many writes → coalesce
// =========================================================================
describe("Offline → many writes → coalesce", () => {
  it("consecutive pushDirty-style enqueues coalesce into a single push entry with merged modules", () => {
    // PR #026 retired 'routine' and PR #030 retired 'fizruk' from
    // SYNC_MODULES; the queue helper itself accepts any string but
    // we keep the fixture aligned with the post-retirement registry.
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { budgets: [100] },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        nutrition: {
          data: { log: ["lunch"] },
          clientUpdatedAt: "2025-01-01T00:01:00.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "sergeant" },
          clientUpdatedAt: "2025-01-01T00:02:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].type).toBe("push");
    expect(Object.keys(q[0].modules).sort()).toEqual([
      "finyk",
      "nutrition",
      "profile",
    ]);
    expect(q[0].modules.finyk.data).toEqual({ budgets: [100] });
    expect(q[0].modules.nutrition.data).toEqual({ log: ["lunch"] });
    expect(q[0].modules.profile.data).toEqual({ displayName: "sergeant" });
  });

  it("later write for the same module overwrites the earlier payload", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { budgets: [100] },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { budgets: [200, 300] },
          clientUpdatedAt: "2025-01-01T00:05:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.finyk.data).toEqual({ budgets: [200, 300] });
  });

  it("identical payloads are idempotent (no extra write/event)", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, listener);
    try {
      const payload = {
        finyk: {
          data: { v: "same" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      };
      addToOfflineQueue({ type: "push", modules: payload });
      const countAfterFirst = listener.mock.calls.length;

      addToOfflineQueue({ type: "push", modules: payload });
      // Second enqueue with identical payload should be a no-op
      expect(listener.mock.calls.length).toBe(countAfterFirst);
      expect(getOfflineQueue()).toHaveLength(1);
    } finally {
      window.removeEventListener(SYNC_STATUS_EVENT, listener);
    }
  });

  it("emits SYNC_STATUS_EVENT on each new coalesced write", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, listener);
    try {
      addToOfflineQueue({
        type: "push",
        modules: {
          finyk: {
            data: { a: 1 },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });
      addToOfflineQueue({
        type: "push",
        modules: {
          nutrition: {
            data: { b: 2 },
            clientUpdatedAt: "2025-01-01T00:01:00.000Z",
          },
        },
      });
      // Each new module payload triggers an event (2 distinct payloads)
      expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      window.removeEventListener(SYNC_STATUS_EVENT, listener);
    }
  });
});

// =========================================================================
// 2. Reconnect replay — happy path
// =========================================================================
describe("Reconnect replay (happy path)", () => {
  it("drains the queue and calls syncApi.pushAll with collected modules", async () => {
    const replayOfflineQueue = await freshReplay();
    // Seed the queue with a pre-populated entry. PR #030 retired
    // 'fizruk' from SYNC_MODULES, so we use 'nutrition' as the
    // second module here.
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { budgets: [100] },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
        nutrition: {
          data: { log: ["breakfast"] },
          clientUpdatedAt: "2025-01-01T00:01:00.000Z",
        },
      },
    });
    expect(getOfflineQueue()).toHaveLength(1);

    mockedPushAll.mockResolvedValueOnce({
      results: { finyk: { ok: true }, nutrition: { ok: true } },
    });

    await replayOfflineQueue();

    expect(mockedPushAll).toHaveBeenCalledTimes(1);
    const pushed = mockedPushAll.mock.calls[0][0];
    expect(pushed).toHaveProperty("finyk");
    expect(pushed).toHaveProperty("nutrition");
    // Queue should be cleared after successful push
    expect(getOfflineQueue()).toEqual([]);
  });

  it("clears queue even when multiple entries were coalesced before replay", async () => {
    const replayOfflineQueue = await freshReplay();
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        // PR #026 видалив 'routine' і PR #030 — 'fizruk' з
        // SYNC_MODULES (обидва тепер SQLite-only модулі). Тут
        // лишилися 'finyk' / 'nutrition' / 'profile' як три валідні
        // модулі для перевірки cross-module coalescing.
        profile: {
          data: { v: 2 },
          clientUpdatedAt: "2025-01-01T00:02:00.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        nutrition: {
          data: { v: 3 },
          clientUpdatedAt: "2025-01-01T00:03:00.000Z",
        },
      },
    });

    mockedPushAll.mockResolvedValueOnce({ results: {} });

    await replayOfflineQueue();

    expect(getOfflineQueue()).toEqual([]);
    const pushed = mockedPushAll.mock.calls[0][0];
    expect(Object.keys(pushed).sort()).toEqual([
      "finyk",
      "nutrition",
      "profile",
    ]);
  });

  it("is a no-op when the queue is empty", async () => {
    const replayOfflineQueue = await freshReplay();
    await replayOfflineQueue();

    expect(mockedPushAll).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });

  it("clears a queue that contains only corrupted entries", async () => {
    const replayOfflineQueue = await freshReplay();
    // Manually seed corrupt data via localStorage
    localStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([
        { type: "push", modules: null },
        { type: "unknown" },
        null,
      ]),
    );

    await replayOfflineQueue();

    // collectQueuedModules returns {} → clearOfflineQueue is called
    expect(mockedPushAll).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });
});

// =========================================================================
// 3. Reconnect replay — server error
// =========================================================================
describe("Reconnect replay (server error)", () => {
  it("preserves the queue when pushAll rejects with a 5xx ApiError", async () => {
    const replayOfflineQueue = await freshReplay();
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    mockedPushAll.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        message: "Internal Server Error",
        status: 500,
        url: "/api/v1/sync/push",
      }),
    );

    await replayOfflineQueue();

    // Queue must be preserved for retry later
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.finyk.data).toEqual({ v: 1 });
  });

  it("preserves the queue on network error", async () => {
    const replayOfflineQueue = await freshReplay();
    addToOfflineQueue({
      type: "push",
      modules: {
        // PR #030 — 'fizruk' retired; substitute 'nutrition'.
        nutrition: {
          data: { log: ["snack"] },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    mockedPushAll.mockRejectedValueOnce(
      new ApiError({
        kind: "network",
        message: "Failed to fetch",
        url: "/api/v1/sync/push",
      }),
    );

    await replayOfflineQueue();

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.nutrition.data).toEqual({ log: ["snack"] });
  });

  it("preserves the queue on a 503 Service Unavailable", async () => {
    const replayOfflineQueue = await freshReplay();
    addToOfflineQueue({
      type: "push",
      modules: {
        // PR #026 видалив 'routine' і PR #030 — 'fizruk' з
        // SYNC_MODULES; для цього 'queue must survive 503' тесту
        // достатньо будь-якого валідного модуля — використовую
        // 'profile'.
        profile: {
          data: { habits: ["meditate"] },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    mockedPushAll.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        message: "Service Unavailable",
        status: 503,
        url: "/api/v1/sync/push",
      }),
    );

    await replayOfflineQueue();

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.profile.data).toEqual({ habits: ["meditate"] });
  });

  it("does not crash the caller — replay swallows errors", async () => {
    const replayOfflineQueue = await freshReplay();
    addToOfflineQueue({
      type: "push",
      modules: {
        finyk: {
          data: { x: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    mockedPushAll.mockRejectedValueOnce(new Error("unexpected boom"));

    // Should resolve, not reject
    await expect(replayOfflineQueue()).resolves.toBeUndefined();
    expect(getOfflineQueue()).toHaveLength(1);
  });
});

// =========================================================================
// 4. MAX_OFFLINE_QUEUE overflow
// =========================================================================
describe("MAX_OFFLINE_QUEUE overflow", () => {
  it("drops oldest entries when queue exceeds MAX_OFFLINE_QUEUE", () => {
    // Push entries would coalesce, so use non-push entries to fill the queue.
    for (let i = 0; i < MAX_OFFLINE_QUEUE + 20; i++) {
      addToOfflineQueue({ type: `evt-${i}`, payload: i } as never);
    }

    const q = getOfflineQueue();
    expect(q.length).toBeLessThanOrEqual(MAX_OFFLINE_QUEUE);
    // Newest entries are preserved
    const lastEntry = q[q.length - 1];
    expect(lastEntry.type).toBe(`evt-${MAX_OFFLINE_QUEUE + 19}`);
    // Oldest entries are dropped
    const firstEntry = q[0];
    expect(firstEntry.type).toBe(`evt-${20}`);
  });

  it("exact boundary: MAX_OFFLINE_QUEUE entries are kept without drop", () => {
    for (let i = 0; i < MAX_OFFLINE_QUEUE; i++) {
      addToOfflineQueue({ type: `item-${i}` } as never);
    }

    const q = getOfflineQueue();
    expect(q).toHaveLength(MAX_OFFLINE_QUEUE);
    expect(q[0].type).toBe("item-0");
    expect(q[q.length - 1].type).toBe(`item-${MAX_OFFLINE_QUEUE - 1}`);
  });

  it("one over the limit drops exactly one oldest entry", () => {
    for (let i = 0; i < MAX_OFFLINE_QUEUE + 1; i++) {
      addToOfflineQueue({ type: `row-${i}` } as never);
    }

    const q = getOfflineQueue();
    expect(q).toHaveLength(MAX_OFFLINE_QUEUE);
    expect(q[0].type).toBe("row-1");
    expect(q[q.length - 1].type).toBe(`row-${MAX_OFFLINE_QUEUE}`);
  });

  it("coalescing prevents overflow for consecutive push entries", () => {
    // Even if we "write" many push entries, coalescing keeps the queue at 1
    for (let i = 0; i < MAX_OFFLINE_QUEUE + 50; i++) {
      addToOfflineQueue({
        type: "push",
        modules: {
          finyk: {
            data: { version: i },
            clientUpdatedAt: new Date(Date.now() + i * 1000).toISOString(),
          },
        },
      });
    }

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].type).toBe("push");
    // Last write wins
    expect(q[0].modules.finyk.data.version).toBe(MAX_OFFLINE_QUEUE + 49);
  });
});
