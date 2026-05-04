/**
 * Regression test: when the signed-in user changes, `useCloudSync`
 * must wipe the previous user's sync-managed MMKV slice BEFORE
 * replaying the offline queue + pulling. Otherwise user A's queued
 * offline changes would be pushed under user B's auth, corrupting
 * user B's cloud state. Mirrors the web behaviour in
 * `apps/web/src/core/cloudSync/hook/useInitialSyncOnUser.ts`.
 */
import { act, renderHook } from "@testing-library/react-native";

import { useCloudSync } from "../hook/useCloudSync";
import { _resetOnlineForTest } from "../net/online";
import type { CurrentUser } from "../types";

const mockClearSyncManagedData = jest.fn();
const mockReplayOfflineQueue = jest.fn().mockResolvedValue(undefined);
const mockEngPullAll = jest.fn().mockResolvedValue(true);

jest.mock("../state/moduleData", () => ({
  clearSyncManagedData: (...args: unknown[]) =>
    mockClearSyncManagedData(...args),
  collectModuleData: jest.fn(() => ({})),
  applyModuleData: jest.fn(),
  hasLocalData: jest.fn(() => false),
}));

jest.mock("../engine/replay", () => ({
  replayOfflineQueue: (...args: unknown[]) => mockReplayOfflineQueue(...args),
  _resetReplayGuardForTest: jest.fn(),
}));

jest.mock("../engine/pull", () => ({
  pullAll: (...args: unknown[]) => mockEngPullAll(...args),
}));

jest.mock("../engine/push", () => ({
  pushAll: jest.fn().mockResolvedValue(undefined),
  pushDirty: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockClearSyncManagedData.mockReset();
  mockReplayOfflineQueue.mockClear();
  mockEngPullAll.mockClear();
  _resetOnlineForTest(true);
});

function userOf(id: string | null): CurrentUser | null {
  return id ? ({ id } as CurrentUser) : null;
}

describe("useCloudSync — user-id change", () => {
  it("does NOT wipe managed data on the very first sign-in", async () => {
    const { rerender } = renderHook(
      ({ user }: { user: CurrentUser | null }) => useCloudSync(user),
      { initialProps: { user: null as CurrentUser | null } },
    );

    await act(async () => {
      rerender({ user: userOf("user-a") });
      // Flush the effect's scheduled promise chain.
      await Promise.resolve();
    });

    expect(mockClearSyncManagedData).not.toHaveBeenCalled();
  });

  it("wipes managed data when switching from user A to user B", async () => {
    const { rerender } = renderHook(
      ({ user }: { user: CurrentUser | null }) => useCloudSync(user),
      { initialProps: { user: userOf("user-a") } },
    );

    // Baseline: first sign-in must not wipe.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClearSyncManagedData).not.toHaveBeenCalled();
    mockReplayOfflineQueue.mockClear();

    await act(async () => {
      rerender({ user: userOf("user-b") });
      await Promise.resolve();
    });

    expect(mockClearSyncManagedData).toHaveBeenCalledTimes(1);

    // Call order: clear must happen BEFORE the user-B replay so the
    // new user's session never sees the previous user's queued changes.
    const clearOrder = mockClearSyncManagedData.mock.invocationCallOrder[0]!;
    const replayOrder = mockReplayOfflineQueue.mock.invocationCallOrder[0]!;
    expect(clearOrder).toBeLessThan(replayOrder);
  });

  it("wipes managed data on sign-out (user becomes null after non-null)", async () => {
    const { rerender } = renderHook(
      ({ user }: { user: CurrentUser | null }) => useCloudSync(user),
      { initialProps: { user: userOf("user-a") } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    mockClearSyncManagedData.mockClear();
    mockEngPullAll.mockClear();

    await act(async () => {
      rerender({ user: null });
      await Promise.resolve();
    });

    expect(mockClearSyncManagedData).toHaveBeenCalledTimes(1);
    // But no pull for a signed-out state.
    expect(mockEngPullAll).not.toHaveBeenCalled();
  });
});
