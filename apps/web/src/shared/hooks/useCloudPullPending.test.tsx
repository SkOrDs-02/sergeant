/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, render, act, cleanup } from "@testing-library/react";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import {
  emitCloudPullComplete,
  requestCloudPull,
  __resetCloudPullPendingForTests,
} from "@shared/lib/modules/cloudPullRequest";
import { useCloudPullPending } from "./useCloudPullPending";

beforeEach(() => {
  __resetCloudPullPendingForTests();
});

afterEach(() => {
  cleanup();
  __resetCloudPullPendingForTests();
});

describe("useCloudPullPending", () => {
  it("returns false initially when no cloud-pull is in flight", () => {
    const { result } = renderHook(() => useCloudPullPending());
    expect(result.current).toBe(false);
  });

  it("flips to true while requestCloudPull is in flight and back to false on completion", async () => {
    const { result } = renderHook(() => useCloudPullPending());
    expect(result.current).toBe(false);

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = requestCloudPull(5000);
    });
    expect(result.current).toBe(true);

    await act(async () => {
      emitCloudPullComplete();
      await pending;
    });
    expect(result.current).toBe(false);
  });

  it("stays true while overlapping requests are in flight and falls only after the last settles", async () => {
    const { result } = renderHook(() => useCloudPullPending());

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = requestCloudPull(5000);
    });
    act(() => {
      second = requestCloudPull(5000);
    });
    expect(result.current).toBe(true);

    // A single `PULL_COMPLETE_EVENT` settles every listener at once, so
    // both requests resolve from one emit. The pending counter must
    // return to 0 (not stick at +1 or go negative).
    await act(async () => {
      emitCloudPullComplete();
      await Promise.all([first, second]);
    });
    expect(result.current).toBe(false);
  });

  it("falls back to false after the timeout when no listener responds", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useCloudPullPending());

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = requestCloudPull(150);
      });
      expect(result.current).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(200);
        await pending;
      });
      expect(result.current).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useCloudPullPending — PullToRefresh integration", () => {
  function Harness({ onRefresh }: { onRefresh: () => Promise<void> | void }) {
    const pending = useCloudPullPending();
    return (
      <PullToRefresh onRefresh={onRefresh} enabled={!pending}>
        <p data-testid="ptr-child">x</p>
      </PullToRefresh>
    );
  }

  it("detaches PTR touch listeners while a cloud-pull is pending (PTR is a no-op)", async () => {
    const addSpy = vi.spyOn(HTMLDivElement.prototype, "addEventListener");
    const removeSpy = vi.spyOn(HTMLDivElement.prototype, "removeEventListener");

    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);

    const touchTypes = ["touchstart", "touchmove", "touchend"];
    const initialAttached = touchTypes.filter((t) =>
      addSpy.mock.calls.some(([type]) => type === t),
    );
    // Precondition: when no pull is in flight, PTR attaches all three
    // gesture listeners so a user pull would normally trigger onRefresh.
    expect(initialAttached.sort()).toEqual(touchTypes.slice().sort());

    addSpy.mockClear();
    removeSpy.mockClear();

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = requestCloudPull(5000);
    });

    // While pending: existing listeners were removed (cleanup ran) and
    // no fresh touch listeners were re-attached — PTR cannot fire
    // onRefresh until the cloud-pull resolves.
    const removedAfterPending = touchTypes.filter((t) =>
      removeSpy.mock.calls.some(([type]) => type === t),
    );
    expect(removedAfterPending.sort()).toEqual(touchTypes.slice().sort());
    const reAttachedDuringPending = addSpy.mock.calls.filter(([type]) =>
      touchTypes.includes(String(type)),
    );
    expect(reAttachedDuringPending).toHaveLength(0);
    expect(onRefresh).not.toHaveBeenCalled();

    addSpy.mockClear();
    removeSpy.mockClear();

    await act(async () => {
      emitCloudPullComplete();
      await pending;
    });

    // After the cloud-pull settles, listeners come back so the next
    // user gesture can trigger a refresh normally.
    const reAttachedAfterSettle = touchTypes.filter((t) =>
      addSpy.mock.calls.some(([type]) => type === t),
    );
    expect(reAttachedAfterSettle.sort()).toEqual(touchTypes.slice().sort());

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
