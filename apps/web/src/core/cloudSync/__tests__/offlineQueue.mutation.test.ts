// @vitest-environment jsdom
/**
 * Mutation-targeted assertions for the cloud-sync offline queue.
 *
 * Existing suites (`offlineQueue.replay.test.ts`,
 * `offlineQueue.deadLetter.test.ts`, `collectQueued.test.ts`) cover the
 * happy paths and acceptance criteria. Stryker's `cloudSyncQueue` config
 * was reporting ~64% mutation score before this file because several
 * boundary/edge mutations on `offlineQueue.ts` were not killed:
 *
 *   - `normalizePushEntries` line `pushIndices.length <= 1` (≤/<, ≤/>)
 *     was only exercised through the inline-coalesce path, which always
 *     leaves the queue with at most one push entry. We now seed the
 *     queue with **two** stranded push entries directly via the LS
 *     dual-write side and assert that normalization merges them.
 *   - `recordReplayBatchFailure` non-push survivors pass-through
 *     (`if (!isPushEntryWithModules(entry)) survivors.push(entry)`)
 *     was never asserted — mixed queues lost their non-push rows
 *     silently under mutation.
 *   - `coalesceIsNoop` short-circuit preserves `attemptCount` /
 *     `lastError` / `lastAttemptAt` on the existing row (no reset
 *     when an identical-payload retry coalesces in).
 *   - `normalizePushEntries` MAX-attempt aggregation
 *     (`if (a > maxAttempts)`) — needs two stranded pushes with
 *     different `attemptCount` values to verify the larger one wins
 *     **and** carries its `lastError` / `lastAttemptAt`.
 *   - `MAX_OFFLINE_QUEUE` strict-greater check — assert that exactly
 *     `MAX + 1` entries trim to `MAX` (not `MAX + 1`).
 *   - `recordReplayBatchFailure(error)` early-return on empty queue —
 *     returns `0` and emits no status event.
 *
 * Each test below is single-purpose and minimal — designed to kill a
 * specific mutation, not to re-cover behavior already asserted elsewhere.
 */
import { ApiError } from "@sergeant/api-client";
import { MAX_QUEUE_ATTEMPTS } from "@sergeant/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory IDB shim so dead-letter persistence works in jsdom — same
// shape as `offlineQueue.deadLetter.test.ts`.
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
  migrateLegacyDbOnce: async () => {},
  openSergeantDb: async () => null,
  __resetSergeantDbForTests: () => {},
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
import { MAX_OFFLINE_QUEUE, OFFLINE_QUEUE_KEY } from "../config";
import {
  __resetDeadLetterCacheForTests,
  getDeadLetterCount,
  getDeadLetterEntries,
} from "../queue/deadLetter";
import {
  __resetOfflineQueueCacheForTests,
  addToOfflineQueue,
  getOfflineQueue,
  recordReplayBatchFailure,
} from "../queue/offlineQueue";
import { SYNC_STATUS_EVENT } from "../state/events";
import type { QueueEntry, QueuePushEntry } from "../types";

const mockedPushAll = syncApi.pushAll as unknown as ReturnType<typeof vi.fn>;

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
// 1. normalizePushEntries — multi-stranded coalesce (kills `<= 1`
//    boundary mutations on the early-return guard).
// =====================================================================
describe("normalizePushEntries — multi-stranded coalesce", () => {
  it("collapses two stranded push entries seeded directly into LS into one", () => {
    // Bypass the inline coalesce by writing the queue to LS directly.
    // The cache hydrates lazily from LS on first sync read, so we can
    // pre-seed two stranded push rows that the runtime API would never
    // produce on its own.
    const seeded: QueueEntry[] = [
      {
        type: "push",
        modules: {
          profile: {
            data: { displayName: "first" },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
      },
      {
        type: "push",
        modules: {
          profile: {
            data: { displayName: "second" },
            clientUpdatedAt: "2025-01-01T00:01:00.000Z",
          },
        },
        ts: "2025-01-01T00:01:00.000Z",
      },
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(seeded));

    // Trigger normalization via a third coalescing write. After this,
    // the queue must contain exactly **one** push row (not three, not
    // two) — proving `pushIndices.length <= 1` is a real boundary.
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { displayName: "third" },
          clientUpdatedAt: "2025-01-01T00:02:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0]!.type).toBe("push");
    // Last write wins — `third` is the merged module payload.
    expect(q[0]!.modules.profile!.data).toEqual({ displayName: "third" });
  });

  it("does not touch a queue with exactly one push row (≤1 short-circuit)", () => {
    const seeded: QueueEntry[] = [
      {
        type: "push",
        modules: {
          profile: {
            data: { v: 1 },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
        attemptCount: 3,
        lastError: "earlier 500",
        lastAttemptAt: "2025-01-01T00:00:30.000Z",
      },
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(seeded));

    // Coalesce-noop write — same payload, normalize sees one push row
    // and short-circuits. Retry-tracking fields must remain pristine.
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0]!.attemptCount).toBe(3);
    expect(q[0]!.lastError).toBe("earlier 500");
  });

  it("preserves a non-push survivor when normalizing 2+ stranded push rows around it", () => {
    // Mixed queue — non-push between two stranded pushes. The normalize
    // loop must (a) collapse the pushes into one tail entry and
    // (b) keep the non-push in its original slot. Mutating
    // `for (let i = 0; i < queue.length; i++)` to a no-op or
    // `if (!isPushEntryWithModules) next.push(...)` to a no-op
    // would drop the non-push row.
    const seeded: QueueEntry[] = [
      {
        type: "push",
        modules: {
          profile: {
            data: { v: "first" },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
      },
      { type: "telemetry", payload: { evt: "boot" } } as never,
      {
        type: "push",
        modules: {
          profile: {
            data: { v: "second" },
            clientUpdatedAt: "2025-01-01T00:01:00.000Z",
          },
        },
        ts: "2025-01-01T00:01:00.000Z",
      },
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(seeded));

    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: "third" },
          clientUpdatedAt: "2025-01-01T00:02:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    // Exactly 2 entries: telemetry survivor + single coalesced push.
    expect(q).toHaveLength(2);
    expect(q[0]!.type).toBe("telemetry");
    expect((q[0] as { payload?: { evt?: string } }).payload?.evt).toBe("boot");
    const merged = q[1] as QueuePushEntry;
    expect(merged.type).toBe("push");
    expect(merged.modules.profile!.data).toEqual({ v: "third" });
  });

  it("does NOT add an attemptCount field when no stranded entry had one", () => {
    // Two stranded pushes, neither with an attemptCount. The
    // `maxAttempts > 0 ? { attemptCount: maxAttempts } : {}` ternary
    // must take the empty-spread branch so the merged row has no
    // attemptCount key. Mutating `> 0` to `>= 0` would inject
    // `attemptCount: 0` and fail this.
    const seeded: QueueEntry[] = [
      {
        type: "push",
        modules: {
          profile: {
            data: { v: 1 },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
      },
      {
        type: "push",
        modules: {
          profile: {
            data: { v: 2 },
            clientUpdatedAt: "2025-01-01T00:01:00.000Z",
          },
        },
        ts: "2025-01-01T00:01:00.000Z",
      },
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(seeded));

    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 3 },
          clientUpdatedAt: "2025-01-01T00:02:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    // `attemptCount` should not be present (not just === 0; the field
    // is conditionally spread, so `in` is the right assertion).
    expect("attemptCount" in q[0]!).toBe(false);
    expect("lastError" in q[0]!).toBe(false);
    expect("lastAttemptAt" in q[0]!).toBe(false);
  });

  it("propagates MAX(attemptCount) and the corresponding lastError when collapsing stranded pushes", () => {
    // Two stranded push rows with different attempt budgets — picking
    // MAX (not MIN, not first, not last) is what keeps dead-letter
    // pressure across normalization. Mutating `a > maxAttempts` to
    // `a < maxAttempts` or removing the assignment must fail this.
    const seeded: QueueEntry[] = [
      {
        type: "push",
        modules: {
          profile: {
            data: { v: "early" },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
        attemptCount: 7,
        lastError: "high-water mark",
        lastAttemptAt: "2025-01-01T00:00:30.000Z",
      },
      {
        type: "push",
        modules: {
          profile: {
            data: { v: "late" },
            clientUpdatedAt: "2025-01-01T00:01:00.000Z",
          },
        },
        ts: "2025-01-01T00:01:00.000Z",
        attemptCount: 2,
        lastError: "low-water mark",
        lastAttemptAt: "2025-01-01T00:00:45.000Z",
      },
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(seeded));

    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: "trigger" },
          clientUpdatedAt: "2025-01-01T00:02:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    const merged = q[0] as QueuePushEntry;
    expect(merged.attemptCount).toBe(7);
    expect(merged.lastError).toBe("high-water mark");
    expect(merged.lastAttemptAt).toBe("2025-01-01T00:00:30.000Z");
  });
});

// =====================================================================
// 2. recordReplayBatchFailure — non-push pass-through
//    (kills mutations on `if (!isPushEntryWithModules(entry))` branch).
// =====================================================================
describe("recordReplayBatchFailure — non-push survivors", () => {
  it("preserves non-push entries untouched while bumping push attemptCount", () => {
    // Use a single non-push survivor so the queue at the bump site is
    // [non-push, push]. Mutating the survivor pass-through (e.g.
    // `survivors.push(entry)` removed, `continue` removed) drops the
    // non-push row and fails this test.
    const seeded: QueueEntry[] = [
      { type: "ping", payload: { source: "diagnostic" } } as never,
      {
        type: "push",
        modules: {
          profile: {
            data: { displayName: "sergeant" },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
        ts: "2025-01-01T00:00:00.000Z",
      } as QueuePushEntry,
    ];
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(seeded));

    const dl = recordReplayBatchFailure(new Error("network"));
    expect(dl).toBe(0);

    const q = getOfflineQueue();
    expect(q).toHaveLength(2);
    // Non-push survivor unchanged — no attemptCount stamped on it.
    expect(q[0]!.type).toBe("ping");
    expect(q[0]!.attemptCount).toBeUndefined();
    expect(q[0]!.lastError).toBeUndefined();
    // Push entry got the bump.
    const push = q[1] as QueuePushEntry;
    expect(push.type).toBe("push");
    expect(push.attemptCount).toBe(1);
    expect(push.lastError).toBe("network");
  });

  it("returns 0 dead-letters and emits no status event when the queue is empty", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, listener);
    try {
      const dl = recordReplayBatchFailure(new Error("anything"));
      expect(dl).toBe(0);
      // Early-return path — no persistQueue, no status event.
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SYNC_STATUS_EVENT, listener);
    }
  });
});

// =====================================================================
// 3. coalesceIsNoop — short-circuit preserves attempt-tracking fields
// =====================================================================
describe("coalesceIsNoop — preserves attemptCount on identical-payload retry", () => {
  it("an identical-payload re-enqueue does not reset attemptCount/lastError", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(new Error("transient 503"));
    expect(getOfflineQueue()[0]!.attemptCount).toBe(1);
    expect(getOfflineQueue()[0]!.lastError).toBe("transient 503");

    // Re-enqueue the identical payload (typical retry-loop pattern:
    // `pushDirty.catch` re-pushes same modules every backoff). The
    // coalesce-noop short-circuit must NOT reset the retry budget.
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0]!.attemptCount).toBe(1);
    expect(q[0]!.lastError).toBe("transient 503");
  });

  it("does not emit a status event on identical-payload re-enqueue", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    const listener = vi.fn();
    window.addEventListener(SYNC_STATUS_EVENT, listener);
    try {
      addToOfflineQueue({
        type: "push",
        modules: {
          profile: {
            data: { v: 1 },
            clientUpdatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });
      // Coalesce-noop short-circuit returns before persistQueue +
      // emitStatusEvent — so listener gets zero calls for this write.
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(SYNC_STATUS_EVENT, listener);
    }
  });

  it("recognises a missing key in prev as not-a-noop and merges into the existing row", () => {
    // First write: only `profile`.
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    // Second write: a brand-new key `_legacy`. `coalesceIsNoop` must
    // return `false` (because `_legacy` is not in prev) so the merge
    // happens instead of short-circuiting. Mutating `if (!(k in prev))`
    // to `if ((k in prev))` would short-circuit here and lose the new
    // module from the merged row.
    addToOfflineQueue({
      type: "push",
      modules: {
        _legacy: {
          data: { v: 2 },
          clientUpdatedAt: "2025-01-01T00:01:00.000Z",
        },
      },
    });

    const q = getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(Object.keys(q[0]!.modules).sort()).toEqual(["_legacy", "profile"]);
    expect(q[0]!.modules._legacy!.data).toEqual({ v: 2 });
  });
});

// =====================================================================
// 4. MAX_OFFLINE_QUEUE — strict-greater-than slice boundary
// =====================================================================
describe("MAX_OFFLINE_QUEUE — strict boundary semantics", () => {
  it("trims to MAX exactly when one extra non-push row pushes over", () => {
    // Push entries coalesce, so use distinct non-push types.
    for (let i = 0; i < MAX_OFFLINE_QUEUE; i++) {
      addToOfflineQueue({ type: `evt-${i}` } as never);
    }
    expect(getOfflineQueue()).toHaveLength(MAX_OFFLINE_QUEUE);

    // The (MAX+1)-th write trips the slice — exactly the oldest row
    // is dropped, not zero, not two.
    addToOfflineQueue({ type: "evt-overflow" } as never);
    const q = getOfflineQueue();
    expect(q).toHaveLength(MAX_OFFLINE_QUEUE);
    // Newest survives at the tail …
    expect(q[q.length - 1]!.type).toBe("evt-overflow");
    // … and the oldest (`evt-0`) is gone — `evt-1` is now first.
    expect(q[0]!.type).toBe("evt-1");
  });
});

// =====================================================================
// 5. recordReplayBatchFailure — boundary at MAX_QUEUE_ATTEMPTS
//    (kills `>=` → `>` and `>=` → `==` mutations on the dead-letter
//    threshold check, complementing offlineQueue.deadLetter.test.ts).
// =====================================================================
describe("recordReplayBatchFailure — exact threshold boundary", () => {
  it("dead-letters on the call where attemptCount transitions from N-1 to N (not before)", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });

    // First N-1 calls — no dead-letters; entry stays in live queue.
    for (let i = 1; i <= MAX_QUEUE_ATTEMPTS - 1; i++) {
      const dl = recordReplayBatchFailure(new Error(`f${i}`));
      expect(dl).toBe(0);
      expect(getOfflineQueue()).toHaveLength(1);
      expect(getOfflineQueue()[0]!.attemptCount).toBe(i);
      expect(getDeadLetterCount()).toBe(0);
    }

    // The Nth call is what trips dead-letter — assert exact count to
    // distinguish `>= MAX` from `> MAX` (off-by-one).
    const dl = recordReplayBatchFailure(new Error("final"));
    expect(dl).toBe(1);
    expect(getOfflineQueue()).toEqual([]);
    expect(getDeadLetterCount()).toBe(1);
    expect(getDeadLetterEntries()[0]!.entry.attemptCount).toBe(
      MAX_QUEUE_ATTEMPTS,
    );
    expect(getDeadLetterEntries()[0]!.finalError).toBe("final");
  });

  it("attemptCount bumps from undefined to 1 on the very first failure (?? 0 fallback)", () => {
    // Entry seeded without an explicit `attemptCount`. The
    // `(entry.attemptCount ?? 0) + 1` expression must yield `1` —
    // mutating `?? 0` to `?? 1` would land at `2` and fail this.
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    expect(getOfflineQueue()[0]!.attemptCount).toBeUndefined();

    recordReplayBatchFailure(new Error("first"));
    expect(getOfflineQueue()[0]!.attemptCount).toBe(1);
  });
});

// =====================================================================
// 6. Replay-engine integration — error-message stamped on entry
// =====================================================================
describe("recordReplayBatchFailure — error message stamping", () => {
  it("stamps Error.message verbatim, not the toString form", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(new Error("plain message"));
    expect(getOfflineQueue()[0]!.lastError).toBe("plain message");
  });

  it("stamps non-Error throwables via String() coercion", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure({ kind: "weird-throw" });
    expect(getOfflineQueue()[0]!.lastError).toBe("[object Object]");
  });

  it("stamps ApiError.message on dead-letter via the replay catch-block boundary", () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { v: 1 },
          clientUpdatedAt: "2025-01-01T00:00:00.000Z",
        },
      },
    });
    recordReplayBatchFailure(
      new ApiError({
        kind: "http",
        message: "Service Unavailable",
        status: 503,
        url: "/api/v1/sync/push",
      }),
    );
    expect(getOfflineQueue()[0]!.lastError).toBe("Service Unavailable");
  });
});
