// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { usePrPendingInsight } from "./usePrPendingInsight";

function strengthWorkout(
  id: string,
  endedAt: string | null,
  exerciseId: string,
  weightKg: number,
): Workout {
  return {
    id,
    startedAt: "2024-01-01T10:00:00Z",
    endedAt,
    items: [
      {
        id: `${id}-i1`,
        exerciseId,
        nameUk: "Жим лежачи",
        type: "strength",
        sets: [{ weightKg, reps: 5 }],
      },
    ],
  } as unknown as Workout;
}

describe("usePrPendingInsight", () => {
  it("returns null until loaded", () => {
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts: [strengthWorkout("w1", "2024-01-02T11:00:00Z", "bench", 100)],
        loaded: false,
        activeWorkoutId: null,
      }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when there are no completed strength PRs", () => {
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts: [],
        loaded: true,
        activeWorkoutId: null,
      }),
    );
    expect(result.current).toBeNull();
  });

  it("fires a retrospective insight when the last session was near PR", () => {
    // Best ever 100kg; the most recent completed session also hit ~96kg (>95%).
    const workouts = [
      strengthWorkout("w-old", "2024-01-01T11:00:00Z", "bench", 100),
      strengthWorkout("w-recent", "2024-01-05T11:00:00Z", "bench", 100),
    ];
    const { result } = renderHook(() =>
      usePrPendingInsight({ workouts, loaded: true, activeWorkoutId: null }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.id).toBe("fizruk-pr-pending");
    expect(result.current!.title).toContain("Жим лежачи");
    expect(result.current!.subtitle).toContain("102.5");
  });

  it("prefers the active workout when its weight is near PR", () => {
    const workouts = [
      strengthWorkout("w-hist", "2024-01-01T11:00:00Z", "squat", 200),
      strengthWorkout("w-active", null, "squat", 195),
    ];
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts,
        loaded: true,
        activeWorkoutId: "w-active",
      }),
    );
    expect(result.current).not.toBeNull();
  });

  it("returns null when current weight is well below PR", () => {
    // useWorkouts yields workouts sorted most-recent first; the fallback
    // candidate is therefore the recent low-weight session.
    const workouts = [
      strengthWorkout("w-recent", "2024-01-05T11:00:00Z", "bench", 50),
      strengthWorkout("w-old", "2024-01-01T11:00:00Z", "bench", 100),
    ];
    const { result } = renderHook(() =>
      usePrPendingInsight({ workouts, loaded: true, activeWorkoutId: null }),
    );
    expect(result.current).toBeNull();
  });
});
