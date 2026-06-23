// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const generate = vi.hoisted(() => vi.fn());
const loadDigest = vi.hoisted(() => vi.fn<(k: string) => unknown>(() => null));
const getWeekKey = vi.hoisted(() => vi.fn(() => "2026-W26"));

vi.mock("../../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({ generate }),
  loadDigest,
  getWeekKey,
}));

import { useMondayAutoDigest } from "./useMondayAutoDigest";
import { STORAGE_KEYS } from "@sergeant/shared";

// A Monday: 2026-06-22 is a Monday.
const MONDAY = new Date("2026-06-22T09:00:00");
// A Tuesday.
const TUESDAY = new Date("2026-06-23T09:00:00");

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  loadDigest.mockReturnValue(null);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function enable() {
  // safeReadLS JSON-parses, so the opt-in flag must be a JSON string literal.
  localStorage.setItem(
    STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO,
    JSON.stringify("1"),
  );
}

describe("useMondayAutoDigest", () => {
  it("does nothing when the opt-in flag is off", () => {
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(5000);
    expect(generate).not.toHaveBeenCalled();
  });

  it("does nothing on a non-Monday", () => {
    enable();
    vi.setSystemTime(TUESDAY);
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(5000);
    expect(generate).not.toHaveBeenCalled();
  });

  it("does nothing when a digest already exists for the week", () => {
    enable();
    vi.setSystemTime(MONDAY);
    loadDigest.mockReturnValue({ id: "existing" });
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(5000);
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates a digest after the 3s defer on Monday when enabled", () => {
    enable();
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    expect(generate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("skips generation if a digest lands during the defer window", () => {
    enable();
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    // a cross-tab write completes before the timer fires
    loadDigest.mockReturnValue({ id: "raced" });
    vi.advanceTimersByTime(3000);
    expect(generate).not.toHaveBeenCalled();
  });
});
