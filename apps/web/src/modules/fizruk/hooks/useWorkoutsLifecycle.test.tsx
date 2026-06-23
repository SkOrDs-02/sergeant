// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ACTIVE_WORKOUT_KEY, type Workout } from "@sergeant/fizruk-domain";
import type { WorkoutsView } from "../pages/Workouts.types";
import {
  useActiveWorkoutIdPersistence,
  useLiveWorkoutTick,
  useRestTimerCountdown,
  useStaleActiveWorkoutCleanup,
  useWorkoutsViewFromSession,
} from "./useWorkoutsLifecycle";

describe("useActiveWorkoutIdPersistence", () => {
  beforeEach(() => localStorage.clear());

  it("writes and clears the active workout id", () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useActiveWorkoutIdPersistence(id),
      { initialProps: { id: "w1" as string | null } },
    );
    expect(localStorage.getItem(ACTIVE_WORKOUT_KEY)).toBe("w1");
    rerender({ id: null });
    expect(localStorage.getItem(ACTIVE_WORKOUT_KEY)).toBeNull();
  });
});

describe("useStaleActiveWorkoutCleanup", () => {
  it("clears an id that matches no workout once loaded", () => {
    const setId = vi.fn();
    renderHook(() => useStaleActiveWorkoutCleanup(true, [], "ghost", setId));
    expect(setId).toHaveBeenCalledWith(null);
  });

  it("keeps an id that matches a workout", () => {
    const setId = vi.fn();
    renderHook(() =>
      useStaleActiveWorkoutCleanup(
        true,
        [{ id: "w1" } as Workout],
        "w1",
        setId,
      ),
    );
    expect(setId).not.toHaveBeenCalled();
  });

  it("no-ops while not loaded", () => {
    const setId = vi.fn();
    renderHook(() => useStaleActiveWorkoutCleanup(false, [], "x", setId));
    expect(setId).not.toHaveBeenCalled();
  });
});

describe("useWorkoutsViewFromSession", () => {
  beforeEach(() => sessionStorage.clear());

  it("consumes a templates flag and clears it", () => {
    sessionStorage.setItem("fizruk_workouts_mode", "templates");
    const setView = vi.fn();
    renderHook(() => useWorkoutsViewFromSession(setView));
    expect(setView).toHaveBeenCalledWith("templates");
    expect(sessionStorage.getItem("fizruk_workouts_mode")).toBeNull();
  });

  it("ignores an unknown flag", () => {
    sessionStorage.setItem("fizruk_workouts_mode", "bogus");
    const setView = vi.fn<(v: WorkoutsView) => void>();
    renderHook(() => useWorkoutsViewFromSession(setView));
    expect(setView).not.toHaveBeenCalled();
  });
});

describe("useRestTimerCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("decrements remaining each second", () => {
    const setRestTimer = vi.fn();
    const mark = vi.fn();
    renderHook(() =>
      useRestTimerCountdown({ remaining: 3, total: 3 }, setRestTimer, mark),
    );
    act(() => vi.advanceTimersByTime(1000));
    const updater = setRestTimer.mock.calls[0]![0] as (
      r: { remaining: number; total: number } | null,
    ) => unknown;
    expect(updater({ remaining: 3, total: 3 })).toEqual({
      remaining: 2,
      total: 3,
    });
  });

  it("fires markCompletedNaturally and returns null on the final tick", () => {
    const setRestTimer = vi.fn();
    const mark = vi.fn();
    renderHook(() =>
      useRestTimerCountdown({ remaining: 1, total: 3 }, setRestTimer, mark),
    );
    act(() => vi.advanceTimersByTime(1000));
    const updater = setRestTimer.mock.calls[0]![0] as (
      r: { remaining: number; total: number } | null,
    ) => unknown;
    expect(updater({ remaining: 1, total: 3 })).toBeNull();
    expect(mark).toHaveBeenCalled();
  });

  it("no-ops for a null or finished timer", () => {
    const setRestTimer = vi.fn();
    renderHook(() => useRestTimerCountdown(null, setRestTimer, vi.fn()));
    act(() => vi.advanceTimersByTime(2000));
    expect(setRestTimer).not.toHaveBeenCalled();
  });
});

describe("useLiveWorkoutTick", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ticks while a workout is unfinished", () => {
    const setNow = vi.fn();
    renderHook(() =>
      useLiveWorkoutTick({ id: "w1", endedAt: null } as Workout, setNow),
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(setNow).toHaveBeenCalled();
  });

  it("does not tick once the workout has ended", () => {
    const setNow = vi.fn();
    renderHook(() =>
      useLiveWorkoutTick(
        { id: "w1", endedAt: "2024-01-01" } as Workout,
        setNow,
      ),
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(setNow).not.toHaveBeenCalled();
  });
});
