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

  it("fires a retrospective insight when the last session was just below an earlier PR", () => {
    // Попередній рекорд 100 кг; останнє тренування 96 кг (≥ 95 %, < 100 %).
    const workouts = [
      strengthWorkout("w-recent", "2024-01-05T11:00:00Z", "bench", 96),
      strengthWorkout("w-old", "2024-01-01T11:00:00Z", "bench", 100),
    ];
    const { result } = renderHook(() =>
      usePrPendingInsight({ workouts, loaded: true, activeWorkoutId: null }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.id).toBe("fizruk-pr-pending");
    expect(result.current!.title).toBe("Рекорд близько");
    expect(result.current!.subtitle).toBe("Спробуй 102,5 кг: Жим лежачи");
  });

  it("stays silent after the very first workout: its own weight is not «close to» itself", () => {
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts: [
          strengthWorkout("w1", "2024-01-02T11:00:00Z", "bench", 62.5),
        ],
        loaded: true,
        activeWorkoutId: null,
      }),
    );
    expect(result.current).toBeNull();
  });

  it("stays silent when the last session matched or beat the earlier record", () => {
    for (const kg of [100, 105]) {
      const workouts = [
        strengthWorkout("w-recent", "2024-01-05T11:00:00Z", "bench", kg),
        strengthWorkout("w-old", "2024-01-01T11:00:00Z", "bench", 100),
      ];
      const { result } = renderHook(() =>
        usePrPendingInsight({ workouts, loaded: true, activeWorkoutId: null }),
      );
      expect(result.current).toBeNull();
    }
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
