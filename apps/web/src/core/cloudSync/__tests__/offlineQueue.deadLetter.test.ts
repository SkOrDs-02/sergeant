// @vitest-environment jsdom
/**
 * PR #040 — dead-letter + crash-recovery tests for the cloud-sync
 * offline queue.
 *
 * Covers the three storage-roadmap Stage 5 acceptance criteria:
 *   1. Per-replay-batch attempt count is tracked on each queue entry
 *      and survives a process restart (cache reset + IDB hydrate).
 *   2. After `MAX_QUEUE_ATTEMPTS` consecutive failed batches the
 *      entry is moved out of the live queue into the dead-letter
 *      store and the live queue does not retry it forever.
 *   3. Crash recovery: kill the process mid-flight (drop the
 *      in-memory cache, then re-hydrate from IDB), the unsent push
 *      is still in the queue with its retry budget intact and the
 *      next replay sends it.
 *
 * Stack: Vitest + jsdom. The shared sergeant-db is mocked with an
 * in-memory map (same pattern as `syncMetaStore.test.ts`). syncApi
 * is mocked so we control the replay outcome; retryAsync is bypassed
 * to one inner attempt per call (we test the OUTER batch-level
 * retry policy, not the per-call exponential backoff which is its
 * own test in `engine/retryAsync.test.ts`).
 */
import { ApiError } from "@sergeant/api-client";
import { MAX_QUEUE_ATTEMPTS } from "@sergeant/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── mocks ───────────────────────────────────────────────────────────
// In-memory IDB shim shared by sergeantDb mock + dead-letter store.
const sharedStore = new Map<string, unknown>();
const cellKey = (storeName: string, key: IDBValidKey): string =>
  `${storeName}:${String(key)}`;

vi.mock("../../../shared/lib/idb/sergeantDb", () => ({
  SERGEANT_STORE: {
    RQ_CACHE: "rq_cache",
    SYNC_META: "sync_meta",
    NUTRITION_RECIPES: "nutrition_recipes",
    NUTRITION_FOODS: "nutrition_foods",
    NUTRITION_BARCODES: "nutrition_barcodes",
    NUTRITION_MEAL_THUMBS: "nutrition_meal_thumbs",
    MIGRATION_META: "migration_meta",
  },
  dbGet: async (storeName: string, key: IDBValidKey) =>
    sharedStore.get(cellKey(storeName, key)),
  dbSet: async (storeName: string, key: IDBValidKey, value: unknown) => {
    sharedStore.set(cellKey(storeName, key), value);
  },
  dbDel: async (storeName: string, key: IDBValidKey) => {
    sharedStore.delete(cellKey(storeName, key));
  },
  migrateLegacyDbOnce: async () => {
    /* no-op — covered by syncMetaStore.test.ts */
  },
  openSergeantDb: async () => null,
  __resetSergeantDbForTests: () => {
    /* mock-only no-op */
  },
}));

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

// retryAsync runs `fn()` once and re-throws — we want each outer batch
// to count as exactly one attempt regardless of inner retry budget.
vi.mock("../engine/retryAsync", () => ({
  retryAsync: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

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
    replayDeadLetter: vi.fn(),
    supersededCallback: vi.fn(),
  },
}));

import { syncApi } from "@shared/api";
import {
  __resetDeadLetterCacheForTests,
  clearDeadLetters,
  getDeadLetterCount,
  getDeadLetterEntries,
  hydrateDeadLetterFromDisk,
} from "../queue/deadLetter";
import {
  __resetOfflineQueueCacheForTests,
  addToOfflineQueue,
  getOfflineQueue,
  hydrateOfflineQueueFromDisk,
  recordReplayBatchFailure,
} from "../queue/offlineQueue";

const mockedPushAll = syncApi.pushAll as unknown as ReturnType<typeof vi.fn>;

async function freshReplay() {
  const mod = await import("../engine/replay");
  return mod.replayOfflineQueue;
}

beforeEach(() => {
  localStorage.clear();
  sharedStore.clear();
  __resetOfflineQueueCacheForTests();
  __resetDeadLetterCacheForTests();
  vi.clearAllMocks();
  mockedPushAll.mockReset();
});
afterEach(() => {
  localStorage.clear();
  sharedStore.clear();
  __resetOfflineQueueCacheForTests();
  __resetDeadLetterCacheForTests();
});

// =====================================================================
// 1. Per-entry attempt counter
// =====================================================================
describe("per-entry attempt counter", () => {
  it("starts implicitly at 0 (undefined) for a freshly enqueued entry", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "sergeant" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].attemptCount ?? 0).toBe(0);
    expect(q[0].lastError).toBeUndefined();
    expect(q[0].lastAttemptAt).toBeUndefined();
  });

  it("recordReplayBatchFailure bumps attemptCount by exactly 1 per call and stamps lastError + lastAttemptAt", () => {
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
    let q = getOfflineQueue();
    expect(q[0].attemptCount).toBe(1);
    expect(q[0].lastError).toBe("first failure");
    expect(q[0].lastAttemptAt).toBeTruthy();

    recordReplayBatchFailure(new Error("second failure"));
    q = getOfflineQueue();
    expect(q[0].attemptCount).toBe(2);
    expect(q[0].lastError).toBe("second failure");
  });

  it("returns 0 dead-letters before reaching MAX_QUEUE_ATTEMPTS", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    for (let i = 1; i < MAX_QUEUE_ATTEMPTS; i++) {
      const dl = recordReplayBatchFailure(new Error(`f${i}`));
      expect(dl).toBe(0);
    }
    // Still in the live queue, not yet dead-lettered.
    expect(getOfflineQueue()).toHaveLength(1);
    expect(getDeadLetterCount()).toBe(0);
  });

  it("preserves attemptCount when a coalescing write merges new module data into a stranded entry", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "a" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(new Error("transient blip"));
    expect(getOfflineQueue()[0].attemptCount).toBe(1);

    // New write — coalesces into the same entry. The retry budget
    // must NOT reset just because a fresh module payload arrived.
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
    expect(q[0].lastError).toBe("transient blip");
    expect(q[0].modules.profile.data).toEqual({ displayName: "b" });
  });
});

// =====================================================================
// 2. Dead-letter after MAX_QUEUE_ATTEMPTS
// =====================================================================
describe("dead-letter at MAX_QUEUE_ATTEMPTS", () => {
  it("moves the entry into the dead-letter store on the Nth failure and removes it from the live queue", () => {
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

    // Exactly one entry was dead-lettered, on the Nth failure.
    expect(totalDeadLettered).toBe(1);
    expect(getOfflineQueue()).toEqual([]);

    const dl = getDeadLetterEntries();
    expect(dl).toHaveLength(1);
    expect(dl[0].type).toBe("dead-letter");
    expect(dl[0].entry.modules.profile.data).toEqual({ displayName: "doomed" });
    expect(dl[0].entry.attemptCount).toBe(MAX_QUEUE_ATTEMPTS);
    expect(dl[0].finalError).toBe(`structural error #${MAX_QUEUE_ATTEMPTS}`);
    expect(dl[0].deadLetteredAt).toBeTruthy();
  });

  it("clearDeadLetters wipes the dead-letter store", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    for (let i = 0; i < MAX_QUEUE_ATTEMPTS; i++) {
      recordReplayBatchFailure(new Error("nope"));
    }
    expect(getDeadLetterCount()).toBe(1);

    clearDeadLetters();
    expect(getDeadLetterCount()).toBe(0);
    expect(getDeadLetterEntries()).toEqual([]);
  });

  it("replayOfflineQueue catch-block dead-letters via recordReplayBatchFailure (integration)", async () => {
    const replay = await freshReplay();
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "dies" },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    // Simulate `MAX_QUEUE_ATTEMPTS` consecutive replay batches that all
    // fail with retryable 5xx — the outer batch counts each call as 1.
    for (let i = 0; i < MAX_QUEUE_ATTEMPTS; i++) {
      mockedPushAll.mockRejectedValueOnce(
        new ApiError({
          kind: "http",
          message: "Internal Server Error",
          status: 500,
          url: "/api/v1/sync/push",
        }),
      );
      await replay();
    }

    expect(mockedPushAll).toHaveBeenCalledTimes(MAX_QUEUE_ATTEMPTS);
    expect(getOfflineQueue()).toEqual([]);
    expect(getDeadLetterCount()).toBe(1);
    const dl = getDeadLetterEntries()[0];
    expect(dl.entry.modules.profile.data).toEqual({ displayName: "dies" });
    expect(dl.entry.attemptCount).toBe(MAX_QUEUE_ATTEMPTS);
    expect(dl.finalError).toContain("Internal Server Error");
  });
});

// =====================================================================
// 3. Crash recovery (kill app → restart → unsent ops reach server)
// =====================================================================
describe("crash recovery", () => {
  it("a pending push entry survives a process restart (cache wipe + IDB hydrate) with attempt count intact", async () => {
    // Boot 1 — user goes offline, makes a write, replay fails twice.
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

    // Wait a tick so the fire-and-forget IDB writes from the bumps
    // settle — `setSyncMeta` returns a Promise that's not awaited
    // by the queue helper (intentional, see `persistQueue`).
    await Promise.resolve();
    await Promise.resolve();

    // Simulate a crash: drop the in-memory caches AND drop the LS
    // dual-write so the only surviving copy is in IDB. This is the
    // worst-case crash boundary — LS could be wiped by Safari Private
    // Browsing or a version upgrade between boots.
    __resetOfflineQueueCacheForTests();
    __resetDeadLetterCacheForTests();
    localStorage.clear();

    // Boot 2 — hydrate from IDB and confirm the queue is intact.
    await hydrateOfflineQueueFromDisk();
    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].modules.profile.data).toEqual({
      displayName: "before crash",
    });
    expect(q[0].attemptCount).toBe(2);
    expect(q[0].lastError).toBe("blip 2");

    // A subsequent successful replay drains the queue, confirming
    // the unsent op did reach the server post-restart (AC: kill app
    // → restart → unsent ops дойдуть).
    const replay = await freshReplay();
    mockedPushAll.mockResolvedValueOnce({
      results: { profile: { ok: true } },
    });
    await replay();
    expect(mockedPushAll).toHaveBeenCalledTimes(1);
    const pushed = mockedPushAll.mock.calls[0][0];
    expect(pushed.profile.data).toEqual({ displayName: "before crash" });
    expect(getOfflineQueue()).toEqual([]);
  });

  it("a dead-letter entry survives a process restart and stays accessible via getDeadLetterEntries", async () => {
    // Boot 1 — drive an entry to dead-letter.
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

    // Wait for IDB writes to flush.
    await Promise.resolve();
    await Promise.resolve();

    // Simulate a crash and a fresh boot — caches wiped, no LS state.
    __resetOfflineQueueCacheForTests();
    __resetDeadLetterCacheForTests();
    localStorage.clear();

    // Boot 2 — hydrate dead-letter from IDB.
    await hydrateDeadLetterFromDisk();
    const dl = getDeadLetterEntries();
    expect(dl).toHaveLength(1);
    expect(dl[0].entry.modules.profile.data).toEqual({
      displayName: "doomed",
    });
    expect(dl[0].entry.attemptCount).toBe(MAX_QUEUE_ATTEMPTS);
    expect(dl[0].finalError).toBe(`f${MAX_QUEUE_ATTEMPTS}`);
  });

  it("first replay after restart sends the unsent payload to the server", async () => {
    // Pre-seed IDB directly with a stranded queue entry (one that
    // existed before the simulated process started). This is the
    // exact scenario the AC describes: "kill app → restart →
    // unsent ops дойдуть".
    sharedStore.set("sync_meta:offline_queue", [
      {
        type: "push",
        modules: {
          profile: {
            data: { displayName: "from previous run" },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
        attemptCount: 0,
      },
    ]);

    const replay = await freshReplay();
    mockedPushAll.mockResolvedValueOnce({
      results: { profile: { ok: true } },
    });

    await replay();

    // The replay engine must have hydrated from IDB itself
    // (`hydrateOfflineQueueFromDisk` is called before reading the
    // queue) and successfully drained the pre-existing entry.
    expect(mockedPushAll).toHaveBeenCalledTimes(1);
    const pushed = mockedPushAll.mock.calls[0][0];
    expect(pushed.profile.data).toEqual({ displayName: "from previous run" });
    expect(getOfflineQueue()).toEqual([]);
  });
});
