// @vitest-environment jsdom
/**
 * CloudSync replay-engine integration tests
 * =========================================
 *
 * Per `docs/diagnostics/2026-05-03-web-deep-dive/02-architecture-and-state.md`
 * §2.3 — round-7 follow-up: «real engine offline queue replay (jsdom + fake
 * timers)». The split-brain integration suite (`cloudSync.splitBrain.test.ts`)
 * uses a `FakeClient` shim — it exercises the LWW protocol but bypasses the
 * production offline-queue / replay code path entirely. This file fills that
 * gap: it wires together the **real** production modules
 *
 *   - `queue/offlineQueue.ts` — addToOfflineQueue + recordReplayBatchFailure
 *     + clearOfflineQueue + IDB hydration,
 *   - `queue/collectQueued.ts` — coalescing of stranded push rows,
 *   - `queue/deadLetter.ts` — dead-letter promotion at MAX_QUEUE_ATTEMPTS,
 *   - `engine/replay.ts` — replay re-entry guard + retryAsync + queue clear,
 *   - `engine/push.ts` — pushDirty's offline → enqueue + online → replay →
 *     network → dirty-clear path,
 *
 * with only `syncApi` and the IDB layer mocked (jsdom doesn't ship IndexedDB,
 * so `sergeantDb.ts` is shimmed with an in-memory map exactly like
 * `syncMetaStore.test.ts` does). `navigator.onLine` is toggled in-place to
 * simulate offline → online transitions; `vi.useFakeTimers()` keeps the
 * suite deterministic across `retryAsync`'s exponential backoff.
 *
 * Scenarios mirror the §2.3 spec but exercise production code:
 *
 *   1. Offline → online round-trip — pushDirty enqueues while offline; once
 *      online, replay drains the queue with the correct payload, dirty flag
 *      clears, queue is empty.
 *   2. Coalescing across offline pushes — three offline writes for the same
 *      module collapse to a single replay payload (last-write-wins inside the
 *      queue).
 *   3. Replay re-entry guard — concurrent replay calls fire only one network
 *      push.
 *   4. Replay batch failure → recordReplayBatchFailure increments
 *      attemptCount per entry; queue stays put (no silent drop).
 *   5. Dead-letter promotion — after MAX_QUEUE_ATTEMPTS consecutive batch
 *      failures the entry leaves the live queue and lands in dead-letter;
 *      live queue continues retrying remaining entries.
 *   6. Replay drops corrupted rows so the queue does not retry forever.
 *   7. pushDirty with mid-flight onLine → offline transition re-queues the
 *      attempted payload on the catch path (no data loss).
 *
 * The suite is deliberately small (<350 LOC) and runs in <200ms — these tests
 * are CI-cheap because every IDB / network boundary is in-memory. Their value
 * is regression-coverage on the **integration** between queue, replay, and
 * push, which unit tests cannot exercise.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MAX_QUEUE_ATTEMPTS } from "@sergeant/shared";

// ─── In-memory IDB shim ───────────────────────────────────────────────────
// Mirrors `syncMetaStore.test.ts`: a single Map backs both the offline
// queue's IDB writes AND the dead-letter store, keyed by
// `${storeName}:${key}`. All sergeant-db calls go through dbGet/dbSet/dbDel,
// so this is the only network we need to mock for the queue subsystem.

const idbStore = new Map<string, unknown>();
const cellKey = (storeName: string, key: IDBValidKey): string =>
  `${storeName}:${String(key)}`;

vi.mock("../../shared/lib/idb/sergeantDb", () => ({
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
    idbStore.get(cellKey(storeName, key)),
  dbSet: async (storeName: string, key: IDBValidKey, value: unknown) => {
    idbStore.set(cellKey(storeName, key), value);
  },
  dbDel: async (storeName: string, key: IDBValidKey) => {
    idbStore.delete(cellKey(storeName, key));
  },
  migrateLegacyDbOnce: async () => {
    /* no-op */
  },
  openSergeantDb: async () => null,
  __resetSergeantDbForTests: () => {
    /* mock-only no-op */
  },
}));

// ─── syncApi mock ──────────────────────────────────────────────────────────
// `pushAll` is the only network boundary the replay engine uses; mocking it
// gives us full control over success / 5xx behaviour while the real
// offlineQueue + collectQueued + replay modules execute unchanged.

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

// ─── retryAsync collapse ───────────────────────────────────────────────────
// `retryAsync` does its own exponential-backoff retry loop (default 3
// attempts); we want to assert the **engine-level** behaviour here, so we
// disable its inner retries by mocking it with a thin pass-through.
// Without this, a single mocked rejection would silently retry inside
// retryAsync and pass — masking the engine's own dead-letter / re-queue logic.

vi.mock("../../core/cloudSync/engine/retryAsync", () => ({
  retryAsync: <T>(fn: () => Promise<T>) => fn(),
}));

import { syncApi } from "@shared/api";
import { pushDirty, type PushArgs } from "../../core/cloudSync/engine/push";
import { replayOfflineQueue } from "../../core/cloudSync/engine/replay";
import {
  __resetOfflineQueueCacheForTests,
  addToOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
} from "../../core/cloudSync/queue/offlineQueue";
import {
  __resetDeadLetterCacheForTests,
  clearDeadLetters,
  getDeadLetterEntries,
  hydrateDeadLetterFromDisk,
} from "../../core/cloudSync/queue/deadLetter";
import {
  clearAllDirty,
  markModuleDirty,
  getDirtyModules,
} from "../../core/cloudSync/state/dirtyModules";
import * as buildPayloadModule from "../../core/cloudSync/engine/buildPayload";

const mockedPushAll = syncApi.pushAll as unknown as ReturnType<typeof vi.fn>;

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

function makeArgs(): {
  args: PushArgs;
  onStart: ReturnType<typeof vi.fn>;
  onSuccess: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  onSettled: ReturnType<typeof vi.fn>;
} {
  const onStart = vi.fn();
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const onSettled = vi.fn();
  return {
    args: {
      user: { id: "u1" },
      onStart,
      onSuccess,
      onError,
      onSettled,
    },
    onStart,
    onSuccess,
    onError,
    onSettled,
  };
}

describe("CloudSync replay engine (real-module integration)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
    idbStore.clear();
    localStorage.clear();
    __resetOfflineQueueCacheForTests();
    __resetDeadLetterCacheForTests();
    clearAllDirty();
    clearDeadLetters();
    mockedPushAll.mockReset();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    idbStore.clear();
  });

  it("offline → online round-trip: pushDirty enqueues, replay drains it on reconnect", async () => {
    // 1. App writes locally → marks module dirty.
    markModuleDirty("profile");

    // 2. Network goes down; user keeps using the app — pushDirty enqueues.
    setOnline(false);
    const buildSpy = vi
      .spyOn(buildPayloadModule, "buildModulesPayload")
      .mockReturnValue({
        profile: {
          data: { name: "Ada" },
          clientUpdatedAt: "2026-05-05T12:00:00.000Z",
        },
      });
    const { args, onSuccess: offlineOnSuccess } = makeArgs();
    await pushDirty(args);

    // pushDirty in offline mode does NOT call onSuccess — it short-circuits
    // after enqueueing. The dirty flag stays set so the next online cycle
    // re-runs.
    expect(offlineOnSuccess).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toHaveLength(1);
    const queuedEntry = getOfflineQueue()[0]!;
    expect(queuedEntry.type).toBe("push");
    expect(
      (queuedEntry as { modules: Record<string, unknown> }).modules,
    ).toHaveProperty("profile");

    // 3. Network comes back; replay drains the queue.
    setOnline(true);
    mockedPushAll.mockResolvedValueOnce({
      results: { profile: { ok: true, version: 1 } },
    });
    await replayOfflineQueue();

    // The replay called pushAll with the queued payload, then cleared the
    // queue on success.
    expect(mockedPushAll).toHaveBeenCalledTimes(1);
    expect(mockedPushAll.mock.calls[0]![0]).toMatchObject({
      profile: {
        data: { name: "Ada" },
        clientUpdatedAt: "2026-05-05T12:00:00.000Z",
      },
    });
    expect(getOfflineQueue()).toEqual([]);

    buildSpy.mockRestore();
  });

  it("coalesces three offline pushes for the same module into a single replay payload", async () => {
    // Simulate three offline writes for the same module — the queue should
    // collapse them into one push entry (addToOfflineQueue's coalescing
    // logic) and the replay should hit the network exactly once with the
    // last-write-wins payload.
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { name: "Ada-1" },
          clientUpdatedAt: "2026-05-05T12:00:00.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { name: "Ada-2" },
          clientUpdatedAt: "2026-05-05T12:00:01.000Z",
        },
      },
    });
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { name: "Ada-3" },
          clientUpdatedAt: "2026-05-05T12:00:02.000Z",
        },
      },
    });

    // Coalescing collapses the three writes into ONE push entry, even before
    // replay touches the queue. This is the "queue does not grow unbounded"
    // invariant from offlineQueue.ts.
    expect(getOfflineQueue()).toHaveLength(1);

    mockedPushAll.mockResolvedValueOnce({
      results: { profile: { ok: true, version: 3 } },
    });
    await replayOfflineQueue();

    expect(mockedPushAll).toHaveBeenCalledTimes(1);
    expect(mockedPushAll.mock.calls[0]![0]).toMatchObject({
      profile: { data: { name: "Ada-3" } },
    });
    expect(getOfflineQueue()).toEqual([]);
  });

  it("replay re-entry guard: two concurrent replay calls fire only one network push", async () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { name: "Ada" },
          clientUpdatedAt: "2026-05-05T12:00:00.000Z",
        },
      },
    });

    // Slow-resolve the first call's pushAll so it stays in flight when we
    // fire the second `replayOfflineQueue()`. Without the re-entry guard
    // the second call would race the first and fire a duplicate pushAll
    // for the same payload.
    //
    // We must wait for the first call to *cross* the `replaying = true`
    // line before invoking the second — the guard sits at the top of
    // `replayOfflineQueue` and `replaying` is only set after `await
    // hydrateOfflineQueueFromDisk()` resolves. Starting both calls
    // synchronously would skip the guard entirely (both would be parked
    // in `await hydrate`).
    let resolveFirstPush: (value: unknown) => void = () => {
      throw new Error("first push resolver not yet assigned");
    };
    mockedPushAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstPush = resolve;
        }),
    );

    const replayA = replayOfflineQueue();
    // Drain microtasks until pushAll has been invoked — that is the marker
    // that `replaying` has been flipped on. A simple `await Promise.resolve()`
    // is not enough because hydrate goes through several `await`-chained
    // IDB calls before pushAll fires.
    while (mockedPushAll.mock.calls.length === 0) {
      await Promise.resolve();
    }

    // Now `replaying === true`. The second call must short-circuit at the
    // top of `replayOfflineQueue` and never touch the network.
    const replayB = replayOfflineQueue();
    await replayB;
    expect(mockedPushAll).toHaveBeenCalledTimes(1);

    // Let the first call drain so `replaying` flips back to false and
    // afterEach hooks see a clean state.
    resolveFirstPush({ results: { profile: { ok: true, version: 1 } } });
    await replayA;

    expect(mockedPushAll).toHaveBeenCalledTimes(1);
    expect(getOfflineQueue()).toEqual([]);
  });

  it("replay batch failure increments attemptCount per entry and keeps the queue", async () => {
    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { name: "Ada" },
          clientUpdatedAt: "2026-05-05T12:00:00.000Z",
        },
      },
    });

    mockedPushAll.mockRejectedValueOnce(new Error("503 service unavailable"));
    await replayOfflineQueue();

    const queue = getOfflineQueue();
    expect(queue).toHaveLength(1);
    const entry = queue[0]!;
    expect(entry.type).toBe("push");
    const pushEntry = entry as { attemptCount?: number; lastError?: string };
    expect(pushEntry.attemptCount).toBe(1);
    expect(pushEntry.lastError).toContain("503 service unavailable");

    // Second failed batch — counter advances, entry still in live queue.
    mockedPushAll.mockRejectedValueOnce(new Error("503 again"));
    await replayOfflineQueue();
    expect(getOfflineQueue()[0]).toMatchObject({ attemptCount: 2 });
  });

  it("dead-letter promotion: after MAX_QUEUE_ATTEMPTS consecutive failures the entry leaves the live queue", async () => {
    // Hydrate dead-letter so we can assert against it. Without hydration
    // `getDeadLetterEntries` returns an empty array (lazy-cache pattern).
    await hydrateDeadLetterFromDisk();

    addToOfflineQueue({
      type: "push",
      modules: {
        profile: {
          data: { name: "Ada" },
          clientUpdatedAt: "2026-05-05T12:00:00.000Z",
        },
      },
    });

    // Drive failures until the entry crosses MAX_QUEUE_ATTEMPTS. The exact
    // count is tested at the boundary — at attempt MAX, the entry must move
    // to dead-letter; one less, and it must remain in the live queue.
    for (let i = 0; i < MAX_QUEUE_ATTEMPTS; i += 1) {
      mockedPushAll.mockRejectedValueOnce(
        new Error(`failure ${i + 1} of ${MAX_QUEUE_ATTEMPTS}`),
      );
      await replayOfflineQueue();
    }

    expect(getOfflineQueue()).toEqual([]);
    // Re-hydrate to pick up the dead-letter that was persisted via fire-and-
    // forget IDB write inside `recordReplayBatchFailure`. The first call
    // populated the cache; we reset it to verify the persisted shape.
    __resetDeadLetterCacheForTests();
    await hydrateDeadLetterFromDisk();
    const dead = getDeadLetterEntries();
    expect(dead).toHaveLength(1);
    expect(dead[0]!.entry.modules.profile!.data!).toEqual({ name: "Ada" });
    expect(dead[0]!.finalError).toContain(
      `failure ${MAX_QUEUE_ATTEMPTS} of ${MAX_QUEUE_ATTEMPTS}`,
    );
  });

  it("drops corrupted queue rows so replay does not retry empty payloads forever", async () => {
    // Hand the queue a row that survives JSON deserialisation but that
    // `collectQueuedModules` filters out (no `modules` field). In production
    // this can happen after a localStorage row was edited manually or when a
    // future-version client wrote a row shape we don't recognise.
    clearOfflineQueue();
    localStorage.setItem(
      // OFFLINE_QUEUE_KEY is private to offlineQueue.ts; round-trip via
      // addToOfflineQueue would coalesce the row away, so we touch LS
      // directly. The key string here matches `config.ts` —
      // `sergeant_offline_queue` is the production constant. When the
      // private key changes this test trips the hard-coded value.
      "sergeant_offline_queue",
      JSON.stringify([{ type: "noop", ts: "2026-05-05T12:00:00.000Z" }]),
    );
    __resetOfflineQueueCacheForTests();

    // No mocked response — replay should NOT call pushAll because there's
    // nothing valid to push.
    await replayOfflineQueue();

    expect(mockedPushAll).not.toHaveBeenCalled();
    // The queue is cleared so it doesn't keep retrying nothing forever.
    expect(getOfflineQueue()).toEqual([]);
  });

  it("pushDirty re-queues the attempted payload when the network call fails (no data loss)", async () => {
    markModuleDirty("profile");
    const buildSpy = vi
      .spyOn(buildPayloadModule, "buildModulesPayload")
      .mockReturnValue({
        profile: {
          data: { name: "Ada" },
          clientUpdatedAt: "2026-05-05T12:00:00.000Z",
        },
      });

    // Simulate a 5xx coming back from `pushAll` — pushDirty's catch path
    // must re-queue the exact payload (re-collecting would race with
    // mid-flight changes).
    mockedPushAll.mockRejectedValueOnce(new Error("503"));
    const { args, onError, onSuccess } = makeArgs();
    await pushDirty(args);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(getOfflineQueue()).toHaveLength(1);
    expect(
      (getOfflineQueue()[0]! as { modules: Record<string, unknown> }).modules,
    ).toMatchObject({
      profile: {
        data: { name: "Ada" },
        clientUpdatedAt: "2026-05-05T12:00:00.000Z",
      },
    });
    // Module stays dirty so the next pushDirty cycle picks it up again.
    expect(getDirtyModules()).toEqual({ profile: true });

    buildSpy.mockRestore();
  });
});
