// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// buildModulesPayload is mocked so we can simulate "nothing to push" without
// threading module-data collectors through the test setup.
vi.mock("./buildPayload", () => ({
  buildModulesPayload: vi.fn(),
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

vi.mock("../queue/offlineQueue", () => ({
  addToOfflineQueue: vi.fn(),
}));

vi.mock("./replay", () => ({
  replayOfflineQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../../observability/analytics")
  >("../../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

import { syncApi } from "@shared/api";
import { buildModulesPayload } from "./buildPayload";
import { addToOfflineQueue } from "../queue/offlineQueue";
import {
  clearAllDirty,
  markModuleDirty,
  getDirtyModules,
} from "../state/dirtyModules";
import { trackEvent, ANALYTICS_EVENTS } from "../../observability/analytics";
import { pushDirty, pushAll } from "./push";

const mockedTrackEvent = trackEvent as unknown as ReturnType<typeof vi.fn>;

const mockedBuild = buildModulesPayload as unknown as ReturnType<typeof vi.fn>;
const mockedPushAllApi = syncApi.pushAll as unknown as ReturnType<typeof vi.fn>;
const mockedEnqueue = addToOfflineQueue as unknown as ReturnType<typeof vi.fn>;

function makeArgs() {
  const onStart = vi.fn();
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const onSettled = vi.fn();
  return {
    args: {
      user: { id: "u1", email: "u@x" },
      onStart,
      onSuccess,
      onError,
      onSettled,
      onNeedMigration: vi.fn(),
    },
    onStart,
    onSuccess,
    onError,
    onSettled,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearAllDirty();
  vi.clearAllMocks();
  mockedBuild.mockReset();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  localStorage.clear();
  clearAllDirty();
});

describe("pushDirty", () => {
  it("early-returns without calling onStart when nothing is dirty", async () => {
    const { args, onStart, onSuccess, onError, onSettled } = makeArgs();
    await pushDirty(args);
    expect(onStart).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("calls onSuccess even when dirty modules produce an empty payload", async () => {
    // Regression: previously `clearAllDirty()` ran but `onSuccess` did not,
    // so the "last synced" indicator never advanced on this code path.
    // PR #030 retired `fizruk`, PR #034 retired `nutrition` and PR #039
    // retired `finyk` from SYNC_MODULES (storage-roadmap Stage 4); only
    // `profile` remains. Push tests use mocked `buildModulesPayload`,
    // so the dirty module name is just an opaque identifier — fixtures
    // here use `profile` (live) and `_legacy_finyk` (synthetic).
    markModuleDirty("profile");
    mockedBuild.mockReturnValueOnce({});

    const { args, onSuccess, onError, onSettled } = makeArgs();
    await pushDirty(args);

    expect(mockedBuild).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]![0]).toBeInstanceOf(Date);
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    // And the dirty bit is cleared on this path.
    expect(getDirtyModules()).toEqual({});
    // We never hit the network for an empty payload.
    expect(mockedPushAllApi).not.toHaveBeenCalled();
  });

  it("enqueues the payload offline and does not call onSuccess", async () => {
    markModuleDirty("profile");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const payload = {
      profile: { data: { a: 1 }, clientUpdatedAt: "2025-01-01T00:00:00.000Z" },
    };
    mockedBuild.mockReturnValueOnce(payload);

    const { args, onSuccess, onError, onSettled } = makeArgs();
    await pushDirty(args);

    expect(mockedEnqueue).toHaveBeenCalledWith({
      type: "push",
      modules: payload,
    });
    expect(mockedPushAllApi).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("re-queues the attempted payload when the server request fails", async () => {
    markModuleDirty("profile");
    const payload = {
      profile: { data: { a: 1 }, clientUpdatedAt: "2025-01-01T00:00:00.000Z" },
    };
    mockedBuild.mockReturnValueOnce(payload);
    mockedPushAllApi.mockRejectedValueOnce(new Error("boom"));

    const { args, onSuccess, onError } = makeArgs();
    await pushDirty(args);

    expect(mockedEnqueue).toHaveBeenCalledWith({
      type: "push",
      modules: payload,
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBe("boom");
  });
});

describe("pushAll", () => {
  it("calls onSuccess when no module produces any payload", async () => {
    // Regression: same class of bug as pushDirty — the empty-payload branch
    // in pushAll used to return without advancing "last synced" either.
    mockedBuild.mockReturnValueOnce({});
    const { args, onStart, onSuccess, onError, onSettled } = makeArgs();
    await pushAll(args);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]![0]).toBeInstanceOf(Date);
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(mockedPushAllApi).not.toHaveBeenCalled();
  });

  it("enqueues offline and skips onSuccess when navigator is offline", async () => {
    mockedBuild.mockReturnValueOnce({
      profile: { data: { a: 1 }, clientUpdatedAt: "2025-01-01T00:00:00.000Z" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const { args, onSuccess, onSettled } = makeArgs();
    await pushAll(args);

    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedPushAllApi).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("calls onSuccess and clears dirty state after a successful server push", async () => {
    markModuleDirty("profile");
    mockedBuild.mockReturnValueOnce({
      profile: { data: { a: 1 }, clientUpdatedAt: "2025-01-01T00:00:00.000Z" },
    });
    mockedPushAllApi.mockResolvedValueOnce({
      results: { profile: { ok: true, version: 42 } },
    });

    const { args, onSuccess, onError } = makeArgs();
    await pushAll(args);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(getDirtyModules()).toEqual({});
  });

  it("keeps conflict modules dirty (LWW loser) instead of silently dropping local changes", async () => {
    // Регресія: `clearAllDirty()` стирав dirty і для `{ ok: true, conflict: true }`,
    // після чого pull накатував cloud → локальні зміни гинули.
    markModuleDirty("profile");
    markModuleDirty("_legacy_finyk");
    mockedBuild.mockReturnValueOnce({
      profile: { data: { a: 1 }, clientUpdatedAt: "2025-01-01T00:00:00.000Z" },
      _legacy_finyk: {
        data: { b: 2 },
        clientUpdatedAt: "2025-01-01T00:00:00.000Z",
      },
    });
    mockedPushAllApi.mockResolvedValueOnce({
      results: {
        profile: { ok: true, version: 42 },
        _legacy_finyk: { ok: true, conflict: true, version: 7 },
      },
    });

    const { args, onSuccess, onError } = makeArgs();
    await pushAll(args);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    // profile — очищений, _legacy_finyk — лишився dirty до наступного push-у.
    expect(getDirtyModules()).toEqual({ _legacy_finyk: true });

    // PostHog sync_conflict_resolved фіксуємо рівно один раз з
    // правильним лічильником модулів (1) і kind="push" —
    // дашборди для виявлення regression-ів LWW-guard-а очікують саме цю форму.
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.SYNC_CONFLICT_RESOLVED,
      { kind: "push", modules: 1 },
    );
  });

  it("does not fire sync_conflict_resolved when all modules succeed cleanly", async () => {
    markModuleDirty("profile");
    mockedBuild.mockReturnValueOnce({
      profile: { data: { a: 1 }, clientUpdatedAt: "2025-01-01T00:00:00.000Z" },
    });
    mockedPushAllApi.mockResolvedValueOnce({
      results: { profile: { ok: true, version: 42 } },
    });

    const { args } = makeArgs();
    await pushAll(args);

    const conflictCalls = mockedTrackEvent.mock.calls.filter(
      (c) => c[0] === ANALYTICS_EVENTS.SYNC_CONFLICT_RESOLVED,
    );
    expect(conflictCalls).toHaveLength(0);
  });
});
