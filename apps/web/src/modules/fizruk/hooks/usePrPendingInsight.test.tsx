// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { usePrPendingInsight } from "./usePrPendingInsight";

function strengthWorkout(
  id: string,
  endedAt: string | null,
  exerciseId: string,
  weightKg: number,
  startedAt = "2024-01-01T10:00:00Z",
): Workout {
  return {
    id,
    startedAt,
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
  // Режим повернення залежить від «зараз»: без фіксованого часу дані 2024
  // року були б паузою в кілька років.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-06T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null until loaded", () => {
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts: [strengthWorkout("w1", "2024-01-02T11:00:00Z", "bench", 100)],
        loaded: false,
        activeWorkoutId: null,
        injuryMarks: [],
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
        injuryMarks: [],
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
      usePrPendingInsight({
        workouts,
        loaded: true,
        activeWorkoutId: null,
        injuryMarks: [],
      }),
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
        injuryMarks: [],
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
        usePrPendingInsight({
          workouts,
          loaded: true,
          activeWorkoutId: null,
          injuryMarks: [],
        }),
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
        injuryMarks: [],
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
      usePrPendingInsight({
        workouts,
        loaded: true,
        activeWorkoutId: null,
        injuryMarks: [],
      }),
    );
    expect(result.current).toBeNull();
  });

  // Канон §6: у режимі повернення порівняння з піком ховаємо, вагу не
  // підвищуємо. «Спробуй рекорд + 2,5 кг» — рівно таке порівняння (аудит
  // 2026-11-17, §3.4).
  it("мовчить, коли позначку травми на зоні вправи щойно знято", () => {
    const workouts = [
      strengthWorkout(
        "w-recent",
        "2024-01-05T11:00:00Z",
        "bench_press_barbell",
        96,
      ),
      strengthWorkout(
        "w-old",
        "2024-01-01T11:00:00Z",
        "bench_press_barbell",
        100,
      ),
    ];
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts,
        loaded: true,
        activeWorkoutId: null,
        injuryMarks: [
          {
            id: "inj_1",
            site: "shoulder",
            startedAt: "2023-12-20T10:00:00Z",
            clearedAt: "2024-01-03T10:00:00Z",
          },
        ],
      }),
    );
    expect(result.current).toBeNull();
  });

  it("мовчить після довгої паузи: остання сесія понад 4 тижні тому", () => {
    vi.setSystemTime(new Date("2024-05-10T09:00:00Z"));
    const workouts = [
      strengthWorkout(
        "w-recent",
        "2024-01-05T11:00:00Z",
        "bench",
        96,
        "2024-01-05T10:00:00Z",
      ),
      strengthWorkout("w-old", "2024-01-01T11:00:00Z", "bench", 100),
    ];
    const { result } = renderHook(() =>
      usePrPendingInsight({
        workouts,
        loaded: true,
        activeWorkoutId: null,
        injuryMarks: [],
      }),
    );
    expect(result.current).toBeNull();
  });
});
