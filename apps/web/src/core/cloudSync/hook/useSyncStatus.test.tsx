// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

import { getSyncEngineWriter } from "../../syncEngine/singleton";

import { SYNC_STATUS_POLL_MS, useSyncStatus } from "./useSyncStatus";

vi.mock("../../syncEngine/singleton", () => ({
  getSyncEngineWriter: vi.fn(),
}));

const mockedGetSyncEngineWriter = vi.mocked(getSyncEngineWriter);

function makeWrapper(config?: QueryClientConfig) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    ...config,
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeRuntime(
  getStatus: ReturnType<typeof vi.fn>,
  recoverAllDeadLetters: ReturnType<typeof vi.fn> = vi.fn(),
) {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    flushNow: vi.fn(),
    notifyEnqueued: vi.fn(),
    getStatus,
    recoverAllDeadLetters,
  } as unknown as NonNullable<ReturnType<typeof getSyncEngineWriter>>;
}

describe("useSyncStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  });

  it("returns zeroed counts and reports online when the runtime is not booted", async () => {
    mockedGetSyncEngineWriter.mockReturnValue(null);

    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncV2PendingCount).toBe(0);
    });

    expect(result.current).toMatchObject({
      isOnline: true,
      syncV2PendingCount: 0,
      syncV2RejectedCount: 0,
      syncV2DeadLetterCount: 0,
    });
    expect(typeof result.current.retrySyncV2DeadLetters).toBe("function");
  });

  it("surfaces outbox counts from getStatus()", async () => {
    const getStatus = vi.fn().mockResolvedValue({
      pending: 3,
      rejected: 1,
      dead_letter: 2,
    });
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus));

    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncV2PendingCount).toBe(3);
    });

    expect(result.current).toMatchObject({
      isOnline: true,
      syncV2PendingCount: 3,
      syncV2RejectedCount: 1,
      syncV2DeadLetterCount: 2,
    });
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("polls getStatus() every 30 s while online (closes audit P2-D)", async () => {
    const getStatus = vi.fn().mockResolvedValue({
      pending: 0,
      rejected: 0,
      dead_letter: 0,
    });
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus));

    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderHook(() => useSyncStatus(), { wrapper: makeWrapper() });

    // Flush microtasks so the initial fetch settles before we start
    // advancing the 30 s polling clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getStatus).toHaveBeenCalledTimes(1);

    // Advance to the first scheduled refetch (refetchInterval = 30 s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_STATUS_POLL_MS);
    });
    expect(getStatus).toHaveBeenCalledTimes(2);

    // …and one more interval tick to confirm the polling repeats.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_STATUS_POLL_MS);
    });
    expect(getStatus).toHaveBeenCalledTimes(3);
  });

  it("invalidates the query on online/offline transitions", async () => {
    const getStatus = vi.fn().mockResolvedValue({
      pending: 0,
      rejected: 0,
      dead_letter: 0,
    });
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus));

    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(1);
    });
    expect(result.current.isOnline).toBe(true);

    await act(async () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
    });
    await waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
    });
    await waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(3);
    });
  });

  it("does not schedule background polling when offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    const getStatus = vi.fn().mockResolvedValue({
      pending: 0,
      rejected: 0,
      dead_letter: 0,
    });
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus));

    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderHook(() => useSyncStatus(), { wrapper: makeWrapper() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getStatus).toHaveBeenCalledTimes(1);

    // Advance well past two intervals — no new fetch should fire because
    // `refetchInterval` is `false` when offline.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_STATUS_POLL_MS * 2 + 1_000);
    });

    expect(getStatus).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("falls back to empty counts when getStatus() rejects", async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error("sqlite locked"));
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus));

    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(getStatus).toHaveBeenCalled();
    });

    expect(result.current).toMatchObject({
      syncV2PendingCount: 0,
      syncV2RejectedCount: 0,
      syncV2DeadLetterCount: 0,
    });
  });

  it("returns a referentially stable object across re-renders when counts are unchanged", async () => {
    const getStatus = vi.fn().mockResolvedValue({
      pending: 2,
      rejected: 0,
      dead_letter: 1,
    });
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus));

    const { result, rerender } = renderHook(() => useSyncStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.syncV2PendingCount).toBe(2);
    });

    const first = result.current;
    rerender();
    rerender();

    // Same count values → same object reference. An unstable object literal
    // here is exactly what fed the `Maximum update depth exceeded` loop on
    // the hub home (regression guard).
    expect(result.current).toBe(first);
    expect(result.current.retrySyncV2DeadLetters).toBe(
      first.retrySyncV2DeadLetters,
    );
  });

  it("retrySyncV2DeadLetters proxies to the runtime", async () => {
    const recover = vi.fn().mockResolvedValue({ recovered: 0, failed: 0 });
    const getStatus = vi.fn().mockResolvedValue({
      pending: 0,
      rejected: 0,
      dead_letter: 0,
    });
    mockedGetSyncEngineWriter.mockReturnValue(makeRuntime(getStatus, recover));

    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(getStatus).toHaveBeenCalled();
    });

    await result.current.retrySyncV2DeadLetters();
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
