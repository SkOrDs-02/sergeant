// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { ACTIVE_WORKOUT_KEY, type Workout } from "@sergeant/fizruk-domain";
import {
  useActiveWorkoutIdPersistence,
  useLiveWorkoutTick,
  useRestTimerCountdown,
  useStaleActiveWorkoutCleanup,
} from "./useWorkoutsLifecycle";
import type { RestTimerState } from "./useFizrukRestSound";
import { startRestTimerState } from "../lib/restTimer";

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

  // 02-A — `routeOwnsWorkoutId` suppresses the two "home" behaviours that
  // used to fight the route: auto-adopting an unfinished workout, and
  // clearing the id the moment the routed workout ends (which is exactly
  // what wiped out the finished-workout summary right after «Завершити»).
  describe("routeOwnsWorkoutId", () => {
    it("does NOT clear the id when the routed workout has just ended", () => {
      const setId = vi.fn();
      renderHook(() =>
        useStaleActiveWorkoutCleanup(
          true,
          [{ id: "w1", endedAt: "2026-01-01T00:00:00Z" } as Workout],
          "w1",
          setId,
          { routeOwnsWorkoutId: true },
        ),
      );
      expect(setId).not.toHaveBeenCalled();
    });

    // Було «still clears the id when the routed workout genuinely does not
    // exist». Виявилось, що «взагалі немає» і «ще не приїхало» тут одне й те
    // саме: `workoutsLoaded` каже про факт прогріву кеша, не про його вміст.
    // З базою в OPFS прогрів встигає після монтування маршруту, і занулення
    // ховало щойно створену сесію назавжди — авто-підхоплення під тим самим
    // прапорцем вимкнене. Картку «не знайдено» малює `activeWorkout === null`,
    // тож видалена сесія читається так само; різниця лише в оборотності.
    it("не забирає id маршруту, якщо сесії ще немає у списку", () => {
      const setId = vi.fn();
      renderHook(() =>
        useStaleActiveWorkoutCleanup(true, [], "ghost", setId, {
          routeOwnsWorkoutId: true,
        }),
      );
      expect(setId).not.toHaveBeenCalled();
    });

    it("id маршруту доживає до появи сесії у кеші", () => {
      const setId = vi.fn();
      const { rerender } = renderHook(
        ({ workouts }: { workouts: Workout[] }) =>
          useStaleActiveWorkoutCleanup(true, workouts, "w1", setId, {
            routeOwnsWorkoutId: true,
          }),
        { initialProps: { workouts: [] as Workout[] } },
      );
      rerender({ workouts: [{ id: "w1", endedAt: null } as Workout] });
      expect(setId).not.toHaveBeenCalled();
    });

    it("без прапорця неіснуючий id досі чиститься", () => {
      const setId = vi.fn();
      renderHook(() => useStaleActiveWorkoutCleanup(true, [], "ghost", setId));
      expect(setId).toHaveBeenCalledWith(null);
    });

    it("does not auto-adopt an unfinished workout when no id is selected", () => {
      const setId = vi.fn();
      renderHook(() =>
        useStaleActiveWorkoutCleanup(
          true,
          [{ id: "w1", endedAt: null } as Workout],
          null,
          setId,
          { routeOwnsWorkoutId: true },
        ),
      );
      expect(setId).not.toHaveBeenCalled();
    });

    it("without the flag, still clears an ended workout (home behaviour unchanged)", () => {
      const setId = vi.fn();
      renderHook(() =>
        useStaleActiveWorkoutCleanup(
          true,
          [{ id: "w1", endedAt: "2026-01-01T00:00:00Z" } as Workout],
          "w1",
          setId,
        ),
      );
      expect(setId).toHaveBeenCalledWith(null);
    });
  });
});

describe("useRestTimerCountdown", () => {
  const T0 = new Date("2026-10-08T10:00:00Z").getTime();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  /** Хост зі справжнім станом: updater-и setRestTimer виконуються. */
  function setup(sec: number, mark = vi.fn()) {
    const hook = renderHook(() => {
      const [restTimer, setRestTimer] = useState<RestTimerState | null>(() =>
        startRestTimerState(sec),
      );
      useRestTimerCountdown(restTimer, setRestTimer, mark);
      return { restTimer, setRestTimer };
    });
    return { ...hook, mark };
  }

  it("counts down by wall-clock on each tick", () => {
    const { result } = setup(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.restTimer?.remaining).toBe(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.restTimer?.remaining).toBe(1);
  });

  it("recomputes from endsAt after the clock jumped without any tick (locked screen)", () => {
    // Регресія logic-10: інтервал не тікав (екран заблоковано), а
    // годинник пішов уперед на 60 с. Без фіксу `remaining - 1` давав 89.
    const { result } = setup(90);
    act(() => {
      vi.setSystemTime(T0 + 60_000);
    });
    // Жодного тіку ще не було — стан досі «90».
    expect(result.current.restTimer?.remaining).toBe(90);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.restTimer?.remaining).toBe(30);
  });

  it("recomputes on pageshow", () => {
    const { result } = setup(90);
    act(() => {
      vi.setSystemTime(T0 + 45_000);
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(result.current.restTimer?.remaining).toBe(45);
  });

  it("recomputes on the next tick without visibilitychange", () => {
    const { result } = setup(90);
    act(() => {
      vi.setSystemTime(T0 + 60_000);
    });
    act(() => vi.advanceTimersByTime(1000));
    // 60 с стрибка + 1 с тіку (фейкові таймери зсувають годинник на
    // 1000 мс поверх setSystemTime): ceil(29) = 29. Без фіксу було б 89.
    expect(result.current.restTimer?.remaining).toBe(29);
  });

  it("fires the end-cue exactly once and clears the timer when the clock jumps past the end", () => {
    const { result, mark } = setup(90);
    act(() => {
      vi.setSystemTime(T0 + 200_000);
      // Усе, що може спрацювати разом: подія видимості, pageshow і тік.
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow"));
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(mark).toHaveBeenCalledTimes(1);
    expect(result.current.restTimer).toBeNull();
  });

  it("fires markCompletedNaturally once when the countdown reaches 0 on its own", () => {
    const { result, mark } = setup(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(mark).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(mark).toHaveBeenCalledTimes(1);
    expect(result.current.restTimer).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("keeps updaters pure: the end-cue is not called inside the setRestTimer updater", () => {
    const mark = vi.fn();
    const setRestTimer = vi.fn();
    const timer = startRestTimerState(5);
    renderHook(() => useRestTimerCountdown(timer, setRestTimer, mark));
    act(() => vi.advanceTimersByTime(1000));
    const updater = setRestTimer.mock.calls[0]![0] as (
      r: RestTimerState | null,
    ) => unknown;
    // Двічі, як у StrictMode — побічних ефектів немає.
    updater(timer);
    updater(timer);
    expect(mark).not.toHaveBeenCalled();
  });

  it("removes its listeners and interval on unmount", () => {
    const removeDoc = vi.spyOn(document, "removeEventListener");
    const removeWin = vi.spyOn(window, "removeEventListener");
    const { unmount, mark } = setup(5);
    unmount();
    expect(removeDoc).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeWin).toHaveBeenCalledWith("pageshow", expect.any(Function));
    act(() => {
      vi.setSystemTime(T0 + 60_000);
      vi.advanceTimersByTime(3000);
    });
    expect(mark).not.toHaveBeenCalled();
  });

  it("no-ops for a null timer", () => {
    const setRestTimer = vi.fn();
    renderHook(() => useRestTimerCountdown(null, setRestTimer, vi.fn()));
    act(() => {
      vi.advanceTimersByTime(2000);
      document.dispatchEvent(new Event("visibilitychange"));
    });
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
