/**
 * Integration-level tests for the replay pipeline: "network comes
 * back online → queue drains".
 *
 * We stub `syncApi.pushAll` so the test can assert on the exact
 * payload shape the server would receive, and drive the NetInfo mock
 * to flip `isConnected` from false to true the same way real
 * connectivity changes fire in production.
 */
import NetInfo from "@react-native-community/netinfo";

import {
  _resetOnlineForTest,
  onOnlineChange,
  startOnlineTracker,
} from "../net/online";
import { addToOfflineQueue, getOfflineQueue } from "../queue/offlineQueue";
import { replayOfflineQueue, _resetReplayGuardForTest } from "../engine/replay";
import type { ModulePayload } from "../types";

// Mock the api seam so `replayOfflineQueue` doesn't try a real network
// request. We capture every call's payload for assertions.
const mockPushAll = jest.fn();
jest.mock("../api", () => ({
  syncApi: {
    pushAll: (...args: unknown[]) => mockPushAll(...args),
    pullAll: jest.fn(),
  },
}));

function modules(mod: string, value: number): Record<string, ModulePayload> {
  return {
    [mod]: {
      data: { [`${mod}_key`]: value },
      clientUpdatedAt: new Date(2024, 0, 1, 12, 0, value).toISOString(),
    },
  };
}

type NetInfoTestApi = typeof NetInfo & {
  __setState: (next: {
    isConnected?: boolean;
    isInternetReachable?: boolean | null;
  }) => void;
  __reset: () => void;
};

beforeEach(() => {
  mockPushAll.mockReset();
  _resetReplayGuardForTest();
  (NetInfo as NetInfoTestApi).__reset();
  // Wipe any queue state left from prior tests.
  for (let i = 0; i < 100; i++) {
    if (getOfflineQueue().length === 0) break;
    // No direct public `clear` on the sync barrel — use the queue's own
    // export.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../queue/offlineQueue").clearOfflineQueue();
  }
});

describe("replayOfflineQueue", () => {
  it("no-ops when the queue is empty", async () => {
    mockPushAll.mockResolvedValue({});
    await replayOfflineQueue();
    expect(mockPushAll).not.toHaveBeenCalled();
  });

  it("flushes queued modules via syncApi.pushAll and clears on success", async () => {
    // PR #030 retired 'fizruk' from SYNC_MODULES, so
    // collectQueuedModules drops fizruk entries before they reach
    // pushAll. Use 'nutrition' as the second module here.
    mockPushAll.mockResolvedValue({
      results: { finyk: { ok: true }, nutrition: { ok: true } },
    });
    addToOfflineQueue({ type: "push", modules: modules("finyk", 1) });
    addToOfflineQueue({ type: "push", modules: modules("nutrition", 2) });

    await replayOfflineQueue();

    expect(mockPushAll).toHaveBeenCalledTimes(1);
    const payload = mockPushAll.mock.calls[0][0] as Record<
      string,
      ModulePayload
    >;
    expect(Object.keys(payload).sort()).toEqual(["finyk", "nutrition"]);
    expect(getOfflineQueue()).toEqual([]);
  });

  it("drops the retired fizruk module entries before push (PR #030)", async () => {
    mockPushAll.mockResolvedValue({ results: { finyk: { ok: true } } });
    addToOfflineQueue({ type: "push", modules: modules("finyk", 1) });
    addToOfflineQueue({ type: "push", modules: modules("fizruk", 2) });

    await replayOfflineQueue();

    expect(mockPushAll).toHaveBeenCalledTimes(1);
    const payload = mockPushAll.mock.calls[0][0] as Record<
      string,
      ModulePayload
    >;
    expect(Object.keys(payload)).toEqual(["finyk"]);
    expect(payload).not.toHaveProperty("fizruk");
    expect(getOfflineQueue()).toEqual([]);
  });

  it("keeps the queue for later when push fails", async () => {
    mockPushAll.mockRejectedValue(
      Object.assign(new Error("Network down"), {
        name: "ApiError",
        kind: "network",
      }),
    );
    addToOfflineQueue({ type: "push", modules: modules("finyk", 1) });

    await replayOfflineQueue();

    // Queue must survive a failed replay so a later online event can
    // retry the same payload.
    expect(getOfflineQueue()).toHaveLength(1);
  });

  it("drops a queue that contains only corrupted / unknown entries", async () => {
    // Push an entry whose only module is unknown — collectQueuedModules
    // will return `{}` and replay should drop the queue instead of
    // retrying forever.
    addToOfflineQueue({
      type: "push",
      modules: {
        unknownModule: {
          data: { k: 1 },
          clientUpdatedAt: new Date().toISOString(),
        },
      } as unknown as Record<string, ModulePayload>,
    });
    await replayOfflineQueue();
    expect(mockPushAll).not.toHaveBeenCalled();
    expect(getOfflineQueue()).toEqual([]);
  });

  it("is re-entry-safe: concurrent callers share one in-flight replay", async () => {
    let resolvePush: ((v: unknown) => void) | undefined;
    mockPushAll.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePush = resolve;
        }),
    );
    addToOfflineQueue({ type: "push", modules: modules("finyk", 1) });

    const a = replayOfflineQueue();
    const b = replayOfflineQueue();

    // Second call must return without triggering another pushAll.
    await Promise.resolve();
    expect(mockPushAll).toHaveBeenCalledTimes(1);

    resolvePush?.({});
    await Promise.all([a, b]);
  });
});

describe("online-event integration", () => {
  it("collecting the queue snapshot observes NetInfo → online transitions", async () => {
    // This test exercises the wiring between NetInfo and the online
    // adapter — it does not re-invoke `replayOfflineQueue` via the
    // hook (that's a separate integration test that needs React
    // rendering). The goal here is to prove the adapter emits on
    // offline → online so the hook will trigger replay.
    _resetOnlineForTest(false);

    const net = NetInfo as NetInfoTestApi;
    // Seed the tracker while offline so `online = false` is committed.
    net.__setState({ isConnected: false, isInternetReachable: false });

    const onlineObserver = jest.fn();
    const unsubListener = onOnlineChange(onlineObserver);
    const unsubTracker = startOnlineTracker();

    // Force adapter to mark offline explicitly (startOnlineTracker
    // kicks off NetInfo.fetch async, so we also push a sync tick).
    net.__setState({ isConnected: false, isInternetReachable: false });
    expect(onlineObserver).not.toHaveBeenCalled();

    // Flip online — adapter should fire exactly once.
    net.__setState({ isConnected: true, isInternetReachable: true });
    expect(onlineObserver).toHaveBeenCalledTimes(1);

    // Another tick while already online should NOT double-fire.
    net.__setState({ isConnected: true, isInternetReachable: true });
    expect(onlineObserver).toHaveBeenCalledTimes(1);

    unsubListener();
    unsubTracker();
  });
});
