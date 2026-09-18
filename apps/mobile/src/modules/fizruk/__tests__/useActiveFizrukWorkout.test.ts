/**
 * Unit tests for `useActiveFizrukWorkout` + its component hooks
 * (Phase 6 · PR-B).
 *
 * Focus: the drift-resistant rest-timer state machine and the
 * MMKV persistence of `activeWorkoutId`. The `expo-keep-awake`
 * side-effect is covered via an injected adapter so we never touch
 * the native module in a jest environment.
 */

import { act, renderHook } from "@testing-library/react-native";

import {
  type KeepAwakeAdapter,
  useActiveFizrukWorkout,
  useElapsedSeconds,
  useRestTimer,
} from "../hooks/useActiveFizrukWorkout";

describe("useElapsedSeconds", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null when startedAt is missing", () => {
    const { result } = renderHook(() => useElapsedSeconds(null));
    expect(result.current).toBeNull();
  });

  it("returns null for unparseable startedAt", () => {
    const { result } = renderHook(() =>
      useElapsedSeconds("not-an-iso-date", () => 10_000),
    );
    expect(result.current).toBeNull();
  });

  it("derives elapsed from wall clock, drift-resistant", () => {
    let now = 10_000;
    const getNow = () => now;
    const startedAt = new Date(0).toISOString();

    const { result } = renderHook(() => useElapsedSeconds(startedAt, getNow));
    expect(result.current).toBe(10);

    // Simulate the JS loop stalling for 30s while the tick would
    // normally have fired 30 times — when it resumes we should read
    // 40s, not 11s.
    now = 40_000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(40);
  });
});

describe("useRestTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at total and counts down each second", () => {
    let now = 1_000_000;
    const { result } = renderHook(() => useRestTimer(() => now));

    act(() => {
      result.current.startRestTimer(3);
    });
    expect(result.current.restTimer).toEqual({ total: 3, remaining: 3 });

    now += 1000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer).toEqual({ total: 3, remaining: 2 });

    now += 1000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer).toEqual({ total: 3, remaining: 1 });
  });

  it("flips justFinishedNaturally exactly once on natural completion", () => {
    let now = 0;
    const { result } = renderHook(() => useRestTimer(() => now));

    act(() => {
      result.current.startRestTimer(2);
    });
    expect(result.current.justFinishedNaturally).toBe(false);

    now = 2500;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer).toBeNull();
    expect(result.current.justFinishedNaturally).toBe(true);

    act(() => {
      result.current.clearJustFinished();
    });
    expect(result.current.justFinishedNaturally).toBe(false);
  });

  it("does NOT flip justFinishedNaturally on explicit cancel", () => {
    let now = 0;
    const { result } = renderHook(() => useRestTimer(() => now));

    act(() => {
      result.current.startRestTimer(10);
    });

    now = 3000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer?.remaining).toBe(7);

    act(() => {
      result.current.cancelRestTimer();
    });
    expect(result.current.restTimer).toBeNull();
    expect(result.current.justFinishedNaturally).toBe(false);
  });

  it("is drift-resistant: long JS stalls still produce correct remaining", () => {
    let now = 0;
    const { result } = renderHook(() => useRestTimer(() => now));

    act(() => {
      result.current.startRestTimer(60);
    });

    // Simulate a 45s background stall.
    now = 45_000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer?.remaining).toBe(15);

    // And one more second.
    now = 46_000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer?.remaining).toBe(14);
  });

  it("floors negative totals to 0 and resolves immediately", () => {
    const now = 0;
    const { result } = renderHook(() => useRestTimer(() => now));

    act(() => {
      result.current.startRestTimer(-5);
    });
    expect(result.current.restTimer).toEqual({ total: 0, remaining: 0 });

    // Clock does not need to advance — first tick finds remaining<=0.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.restTimer).toBeNull();
    expect(result.current.justFinishedNaturally).toBe(true);
  });
});

describe("useActiveFizrukWorkout", () => {
  let keepAwakeCalls: Array<{ op: "activate" | "deactivate"; tag: string }>;
  let keepAwake: KeepAwakeAdapter;

  beforeEach(() => {
    jest.useFakeTimers();
    keepAwakeCalls = [];
    keepAwake = {
      activate: (tag: string) => keepAwakeCalls.push({ op: "activate", tag }),
      deactivate: (tag: string) =>
        keepAwakeCalls.push({ op: "deactivate", tag }),
    };
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("round-trips activeWorkoutId through MMKV and toggles keep-awake", () => {
    const { result, unmount } = renderHook(() =>
      useActiveFizrukWorkout({ keepAwake }),
    );

    expect(result.current.activeWorkoutId).toBeNull();
    expect(keepAwakeCalls).toEqual([]);

    act(() => {
      result.current.setActiveWorkoutId("wk-123");
    });
    expect(result.current.activeWorkoutId).toBe("wk-123");
    expect(keepAwakeCalls).toEqual([
      { op: "activate", tag: "sergeant.fizruk.active-workout" },
    ]);

    act(() => {
      result.current.clearActiveWorkout();
    });
    expect(result.current.activeWorkoutId).toBeNull();
    expect(keepAwakeCalls).toEqual([
      { op: "activate", tag: "sergeant.fizruk.active-workout" },
      { op: "deactivate", tag: "sergeant.fizruk.active-workout" },
    ]);

    unmount();
  });

  it("derives elapsedSec only while there is an active workout", () => {
    let now = 10_000;
    const startedAt = new Date(0).toISOString();

    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useActiveFizrukWorkout({
          keepAwake,
          now: () => now,
          startedAt: active ? startedAt : null,
        }),
      { initialProps: { active: false } },
    );

    expect(result.current.elapsedSec).toBeNull();

    act(() => {
      result.current.setActiveWorkoutId("wk-1");
    });
    rerender({ active: true });
    expect(result.current.elapsedSec).toBe(10);

    now = 25_000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.elapsedSec).toBe(25);

    act(() => {
      result.current.clearActiveWorkout();
    });
    rerender({ active: false });
    expect(result.current.elapsedSec).toBeNull();
  });
});
