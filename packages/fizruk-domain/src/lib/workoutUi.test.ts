import { describe, expect, it, vi } from "vitest";

import type { Workout } from "../domain/types.js";
import {
  formatDurShort,
  formatRestClock,
  summarizeWorkoutForFinish,
} from "./workoutUi.js";

function workout(partial: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-01-05T10:00:00.000Z",
    endedAt: "2026-01-05T10:10:30.000Z",
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...partial,
  };
}

describe("fizruk-domain/workoutUi", () => {
  it("returns null for missing or invalid workout timestamps", () => {
    expect(summarizeWorkoutForFinish(null)).toBeNull();
    expect(summarizeWorkoutForFinish(undefined)).toBeNull();
    expect(summarizeWorkoutForFinish({})).toBeNull();
    expect(
      summarizeWorkoutForFinish(workout({ startedAt: "not-a-date" })),
    ).toBeNull();
    expect(
      summarizeWorkoutForFinish(
        workout({
          endedAt: "not-a-date",
        }),
      ),
    ).toBeNull();
  });

  it("summarizes duration, item count, and strength tonnage", () => {
    expect(
      summarizeWorkoutForFinish(
        workout({
          items: [
            {
              id: "bench",
              exerciseId: "bench",
              nameUk: "Bench",
              primaryGroup: "chest",
              musclesPrimary: [],
              musclesSecondary: [],
              type: "strength",
              sets: [
                { weightKg: 100, reps: 5 },
                { weightKg: 80, reps: 8 },
                { weightKg: Number.NaN, reps: 10 },
              ],
            },
            {
              id: "run",
              exerciseId: "run",
              nameUk: "Run",
              primaryGroup: "cardio",
              musclesPrimary: [],
              musclesSecondary: [],
              type: "distance",
              distanceM: 1000,
            },
          ],
        }),
      ),
    ).toEqual({
      durationSec: 630,
      items: 2,
      tonnageKg: 1140,
    });
  });

  it("uses Date.now for active workouts and clamps negative durations", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-01-05T10:05:00.000Z"),
    );

    expect(summarizeWorkoutForFinish(workout({ endedAt: null }))).toMatchObject(
      {
        durationSec: 300,
      },
    );
    expect(
      summarizeWorkoutForFinish(
        workout({
          startedAt: "2026-01-05T10:10:00.000Z",
          endedAt: "2026-01-05T10:00:00.000Z",
        }),
      ),
    ).toMatchObject({
      durationSec: 0,
    });

    vi.restoreAllMocks();
  });

  it("formats compact durations and rest clocks", () => {
    expect(formatDurShort(45).startsWith("45 ")).toBe(true);
    expect(formatDurShort(125).startsWith("2 ")).toBe(true);
    expect(formatRestClock(5)).toBe("00:05");
    expect(formatRestClock(125)).toBe("02:05");
  });
});
