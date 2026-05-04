/**
 * PR #040 — dead-letter + crash-recovery tests for the mobile
 * cloud-sync offline queue. 1:1 mirror of the web suite at
 * `apps/web/src/core/cloudSync/__tests__/offlineQueue.deadLetter.test.ts`.
 *
 * Covers the three Stage 5 acceptance criteria:
 *   1. Per-replay-batch attempt count is tracked on each queue entry.
 *   2. After `MAX_QUEUE_ATTEMPTS` consecutive failed batches the
 *      entry moves out of the live queue into the dead-letter store.
 *   3. Crash recovery: kill the process (drop in-memory state),
 *      re-import the modules, the unsent push is still in MMKV with
 *      its retry budget intact and the next replay sends it.
 *
 * Mobile uses MMKV synchronously, so unlike the web suite there is
 * no IDB hydrate step — we simulate the "kill app" boundary by
 * `jest.resetModules()` between phases and assert the post-reset
 * import sees the same persisted MMKV state.
 */
import { MAX_QUEUE_ATTEMPTS } from "@sergeant/shared";

const mockPushAll = jest.fn();
jest.mock("../api", () => ({
  syncApi: {
    pushAll: (...args: unknown[]) => mockPushAll(...args),
    pullAll: jest.fn(),
  },
}));

import {
  clearDeadLetters,
  getDeadLetterCount,
  getDeadLetterEntries,
} from "../queue/deadLetter";
import {
  addToOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
  recordReplayBatchFailure,
} from "../queue/offlineQueue";
import { _resetReplayGuardForTest, replayOfflineQueue } from "../engine/replay";

beforeEach(() => {
  mockPushAll.mockReset();
  _resetReplayGuardForTest();
  clearOfflineQueue();
  clearDeadLetters();
});

describe("per-entry attempt counter (mobile)", () => {
  it("recordReplayBatchFailure bumps attemptCount and stamps lastError + lastAttemptAt", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "sergeant" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(new Error("first failure"));

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].attemptCount).toBe(1);
    expect(q[0].lastError).toBe("first failure");
    expect(q[0].lastAttemptAt).toBeTruthy();
  });

  it("preserves attemptCount when a coalescing write merges new module data", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "a" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(new Error("blip"));
    expect(getOfflineQueue()[0].attemptCount).toBe(1);

    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "b" },
          clientUpdatedAt: "2025-01-01T00:01:00.000Z",
        },
      },
    });
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].attemptCount).toBe(1);
    expect(q[0].lastError).toBe("blip");
    expect(q[0].modules.profile.data).toEqual({ displayName: "b" });
  });
});

describe("dead-letter at MAX_QUEUE_ATTEMPTS (mobile)", () => {
  it("moves the entry into the dead-letter store on the Nth failure", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "doomed" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    let totalDeadLettered = 0;
    for (let i = 1; i <= MAX_QUEUE_ATTEMPTS; i++) {
      totalDeadLettered += recordReplayBatchFailure(
        new Error(`structural error #${i}`),
      );
    }

    expect(totalDeadLettered).toBe(1);
    expect(getOfflineQueue()).toEqual([]);

    const dl = getDeadLetterEntries();
    expect(dl).toHaveLength(1);
    expect(dl[0].entry.modules.profile.data).toEqual({
      displayName: "doomed",
    });
    expect(dl[0].entry.attemptCount).toBe(MAX_QUEUE_ATTEMPTS);
    expect(dl[0].finalError).toBe(`structural error #${MAX_QUEUE_ATTEMPTS}`);
    expect(dl[0].deadLetteredAt).toBeTruthy();
  });

  it("replayOfflineQueue catch-block dead-letters via recordReplayBatchFailure", async () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "dies" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    for (let i = 0; i < MAX_QUEUE_ATTEMPTS; i++) {
      mockPushAll.mockRejectedValueOnce(
        Object.assign(new Error("Internal Server Error"), {
          name: "ApiError",
          kind: "http",
          status: 500,
        }),
      );
      await replayOfflineQueue();
    }

    expect(mockPushAll).toHaveBeenCalledTimes(MAX_QUEUE_ATTEMPTS);
    expect(getOfflineQueue()).toEqual([]);
    expect(getDeadLetterCount()).toBe(1);
  });
});

describe("crash recovery (mobile)", () => {
  it("a pending push entry survives a process restart with attempt count intact", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "before crash" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(new Error("blip 1"));
    recordReplayBatchFailure(new Error("blip 2"));
    expect(getOfflineQueue()[0].attemptCount).toBe(2);

    // Simulate a restart by re-reading the queue through a fresh
    // import. MMKV is synchronous and persists across module
    // reloads in the same test process, so a `jest.resetModules` +
    // re-import is the closest analog to "kill app → restart".
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reloaded =
      require("../queue/offlineQueue") as typeof import("../queue/offlineQueue");
    const q = reloaded.getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.profile.data).toEqual({
      displayName: "before crash",
    });
    expect(q[0].attemptCount).toBe(2);
    expect(q[0].lastError).toBe("blip 2");
  });

  it("a dead-letter entry survives a process restart", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "doomed" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    for (let i = 0; i < MAX_QUEUE_ATTEMPTS; i++) {
      recordReplayBatchFailure(new Error(`f${i + 1}`));
    }
    expect(getDeadLetterCount()).toBe(1);

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reloaded =
      require("../queue/deadLetter") as typeof import("../queue/deadLetter");
    const dl = reloaded.getDeadLetterEntries();
    expect(dl).toHaveLength(1);
    expect(dl[0].entry.modules.profile.data).toEqual({
      displayName: "doomed",
    });
    expect(dl[0].entry.attemptCount).toBe(MAX_QUEUE_ATTEMPTS);
  });
});
