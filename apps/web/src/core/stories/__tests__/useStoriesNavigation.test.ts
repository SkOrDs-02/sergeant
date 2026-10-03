// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoriesNavigation } from "../hooks/useStoriesNavigation";

describe("useStoriesNavigation", () => {
  it("starts at index 0", () => {
    const { result } = renderHook(() => useStoriesNavigation({ total: 3 }));
    expect(result.current.index).toBe(0);
  });

  it("next() advances the index", () => {
    const { result } = renderHook(() => useStoriesNavigation({ total: 3 }));
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
  });

  it("next() on the last slide calls onExhausted and does not overflow", () => {
    const onExhausted = vi.fn();
    const { result } = renderHook(() =>
      useStoriesNavigation({ total: 2, onExhausted }),
    );
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it("composes two next() calls batched into a single render", () => {
    // Both calls read the same `index` from the render that queued them, so a
    // direct `setIndex(index + 1)` would collapse them onto one advance. The
    // functional updater keeps each queued transition. Not reachable from the
    // current call-sites (autoplay guards itself, taps and key presses land in
    // separate ticks) — pinned so a future batched caller cannot regress it.
    const { result } = renderHook(() => useStoriesNavigation({ total: 4 }));
    act(() => {
      result.current.next();
      result.current.next();
    });
    expect(result.current.index).toBe(2);
  });

  it("prev() decrements but never goes below 0", () => {
    const { result } = renderHook(() => useStoriesNavigation({ total: 3 }));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    // already at 0 — stays
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
  });

  it("goto() jumps to a valid index and ignores out-of-range inputs", () => {
    const { result } = renderHook(() => useStoriesNavigation({ total: 4 }));
    act(() => result.current.goto(2));
    expect(result.current.index).toBe(2);
    act(() => result.current.goto(99));
    expect(result.current.index).toBe(2);
    act(() => result.current.goto(-1));
    expect(result.current.index).toBe(2);
  });

  it("clamps index down when total shrinks", () => {
    const { result, rerender } = renderHook(
      ({ total }) => useStoriesNavigation({ total }),
      { initialProps: { total: 5 } },
    );
    act(() => result.current.goto(4));
    expect(result.current.index).toBe(4);
    rerender({ total: 3 });
    expect(result.current.index).toBe(2);
  });

  it("does not call onExhausted purely from clamping", () => {
    const onExhausted = vi.fn();
    const { result, rerender } = renderHook(
      ({ total }) => useStoriesNavigation({ total, onExhausted }),
      { initialProps: { total: 5 } },
    );
    act(() => result.current.goto(4));
    rerender({ total: 3 });
    expect(result.current.index).toBe(2);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it("reset() returns to index 0", () => {
    const { result } = renderHook(() => useStoriesNavigation({ total: 3 }));
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.reset());
    expect(result.current.index).toBe(0);
  });
});
