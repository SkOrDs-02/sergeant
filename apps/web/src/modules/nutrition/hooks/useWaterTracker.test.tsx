// @vitest-environment jsdom
/**
 * Unit tests for useWaterTracker.
 *
 * The hook wraps the pure water-storage helpers with React state, so
 * testing it exercises both the hook wiring and the localStorage round-trip.
 * Fake timers pin "today" to a fixed date so all add/subtract/reset
 * operations land on the same known key.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWaterTracker } from "./useWaterTracker";
import { WATER_LOG_KEY } from "../lib/waterStorage";

// 2026-06-04 12:00 UTC — a safe mid-day UTC instant that resolves to the
// same local calendar date regardless of host timezone.
const FIXED_NOW = new Date("2026-06-04T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("useWaterTracker", () => {
  it("starts at 0 ml when storage is empty", () => {
    const { result } = renderHook(() => useWaterTracker());
    expect(result.current.todayMl).toBe(0);
  });

  it("add() increases todayMl by the given amount", () => {
    const { result } = renderHook(() => useWaterTracker());

    act(() => {
      result.current.add(250);
    });
    expect(result.current.todayMl).toBe(250);

    act(() => {
      result.current.add(300);
    });
    expect(result.current.todayMl).toBe(550);
  });

  it("subtract() decreases todayMl without going below zero", () => {
    const { result } = renderHook(() => useWaterTracker());

    act(() => {
      result.current.add(500);
    });
    act(() => {
      result.current.subtract(200);
    });
    expect(result.current.todayMl).toBe(300);

    // subtract more than available — floor at 0
    act(() => {
      result.current.subtract(9999);
    });
    expect(result.current.todayMl).toBe(0);
  });

  it("reset() zeros today's water", () => {
    const { result } = renderHook(() => useWaterTracker());

    act(() => {
      result.current.add(750);
    });
    expect(result.current.todayMl).toBe(750);

    act(() => {
      result.current.reset();
    });
    expect(result.current.todayMl).toBe(0);
  });

  it("persists state to localStorage so a re-mount rehydrates correctly", () => {
    const { result: first } = renderHook(() => useWaterTracker());
    act(() => {
      first.current.add(400);
    });
    // Confirm the key exists in localStorage after the effect flushes.
    const raw = localStorage.getItem(WATER_LOG_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(Object.values(parsed).some((v) => v === 400)).toBe(true);

    // New hook instance picks up the persisted value.
    const { result: second } = renderHook(() => useWaterTracker());
    expect(second.current.todayMl).toBe(400);
  });
});
