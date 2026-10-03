// @vitest-environment jsdom
/**
 * Tests for `usePullToRefresh` — native-like pull-to-refresh gesture.
 *
 * We attach the hook to a real scroll container element and dispatch
 * native touch events (the hook binds raw `addEventListener` listeners,
 * not React synthetic handlers).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { usePullToRefresh } from "./usePullToRefresh";

function makeTouchEvent(type: string, clientY: number): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", {
    value: [{ clientY }],
    configurable: true,
  });
  return e;
}

function setScrollTop(el: HTMLElement, value: number): void {
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    writable: true,
    value,
  });
}

describe("usePullToRefresh", () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.appendChild(el);
    setScrollTop(el, 0);
  });

  afterEach(() => {
    el.remove();
    vi.restoreAllMocks();
  });

  function setup(opts: Partial<Parameters<typeof usePullToRefresh>[0]> = {}) {
    const onRefresh = opts.onRefresh ?? vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(() => {
      const ref = useRef<HTMLDivElement>(el);
      return usePullToRefresh({ onRefresh, scrollRef: ref, ...opts });
    });
    return { ...hook, onRefresh };
  }

  it("starts with an idle state", () => {
    const { result } = setup();
    expect(result.current).toEqual({
      isPulling: false,
      isRefreshing: false,
      pullDistance: 0,
      pullProgress: 0,
      canRefresh: false,
    });
  });

  it("tracks pull distance and progress on touchmove at scroll top", () => {
    const { result } = setup({ pullThreshold: 80 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 140)));
    expect(result.current.isPulling).toBe(true);
    expect(result.current.pullDistance).toBe(40);
    expect(result.current.pullProgress).toBeCloseTo(0.5, 5);
    expect(result.current.canRefresh).toBe(false);
  });

  it("marks canRefresh once the threshold is exceeded", () => {
    const { result } = setup({ pullThreshold: 80 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 200)));
    expect(result.current.canRefresh).toBe(true);
  });

  it("invokes onRefresh on release when threshold met, then resets", async () => {
    let resolveRefresh!: () => void;
    const onRefresh = vi.fn(
      () => new Promise<void>((r) => (resolveRefresh = r)),
    );
    const { result } = setup({ onRefresh, pullThreshold: 80 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 220)));
    await act(async () => {
      el.dispatchEvent(new Event("touchend"));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(true);
    await act(async () => {
      resolveRefresh();
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(result.current.pullDistance).toBe(0);
  });

  it("calls onError when onRefresh rejects", async () => {
    const onError = vi.fn();
    const onRefresh = vi.fn().mockRejectedValue(new Error("boom"));
    setup({ onRefresh, onError, pullThreshold: 80 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 220)));
    await act(async () => {
      el.dispatchEvent(new Event("touchend"));
    });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });

  it("does not refresh when released below threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = setup({ onRefresh, pullThreshold: 80 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 130)));
    await act(async () => {
      el.dispatchEvent(new Event("touchend"));
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it("resets without refreshing when the browser cancels the gesture", async () => {
    // Real devices fire `touchcancel` (not `touchend`) when their own
    // overscroll / native pull-to-refresh takes the gesture over. Before
    // the handler existed the state stayed frozen mid-pull and the
    // indicator hung forever.
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = setup({ onRefresh, pullThreshold: 80 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 220)));
    expect(result.current.canRefresh).toBe(true);
    await act(async () => {
      el.dispatchEvent(new Event("touchcancel"));
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      isPulling: false,
      isRefreshing: false,
      pullDistance: 0,
      pullProgress: 0,
      canRefresh: false,
    });
  });

  it("force-resets via the failsafe when onRefresh never settles", async () => {
    vi.useFakeTimers();
    try {
      // A consumer whose promise hangs forever (stalled invalidateQueries /
      // dead network). Without the failsafe the spinner would spin forever.
      const onRefresh = vi.fn(() => new Promise<void>(() => {}));
      const { result } = setup({
        onRefresh,
        pullThreshold: 80,
        refreshFailsafeMs: 5000,
      });
      act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
      act(() => el.dispatchEvent(makeTouchEvent("touchmove", 220)));
      await act(async () => {
        el.dispatchEvent(new Event("touchend"));
      });
      expect(result.current.isRefreshing).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.pullDistance).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores the gesture when not at the top of the scroll container", () => {
    setScrollTop(el, 50);
    const { result } = setup();
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 200)));
    expect(result.current.isPulling).toBe(false);
  });

  it("applies resistance past the threshold", () => {
    const { result } = setup({ pullThreshold: 80, resistance: 0.5 });
    act(() => el.dispatchEvent(makeTouchEvent("touchstart", 100)));
    // deltaY = 180 → overpull 100 * 0.5 = 50 → adjusted 130
    act(() => el.dispatchEvent(makeTouchEvent("touchmove", 280)));
    expect(result.current.pullDistance).toBe(120); // capped at maxPullDistance default
  });
});
