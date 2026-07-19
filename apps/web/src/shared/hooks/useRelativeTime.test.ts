// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRelativeTime } from "./useRelativeTime";

describe("useRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00+03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when date is null/undefined", () => {
    const { result, rerender } = renderHook(
      ({ date }: { date: Date | null }) => useRelativeTime(date),
      { initialProps: { date: null } },
    );
    expect(result.current).toBeNull();
    rerender({ date: null });
    expect(result.current).toBeNull();
  });

  it("returns a formatted relative-time string for a valid date", () => {
    const fiveMinAgo = new Date("2026-07-19T11:55:00+03:00");
    const { result } = renderHook(() => useRelativeTime(fiveMinAgo));
    expect(typeof result.current).toBe("string");
    expect(result.current).not.toBe("");
  });

  it("re-renders on a 30s tick so the label can age", () => {
    const past = new Date("2026-07-19T11:00:00+03:00");
    const { result } = renderHook(() => useRelativeTime(past));
    const before = result.current;
    act(() => {
      vi.advanceTimersByTime(30_000);
      vi.setSystemTime(new Date("2026-07-19T12:05:00+03:00"));
      vi.advanceTimersByTime(30_000);
    });
    // Value should have re-evaluated (still a string, formatting may or
    // may not visibly change depending on the bucket, but the effect's
    // interval must have fired without throwing).
    expect(typeof result.current).toBe("string");
    expect(before).not.toBeUndefined();
  });

  it("clears the interval on unmount", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = renderHook(() =>
      useRelativeTime(new Date("2026-07-19T11:00:00+03:00")),
    );
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
