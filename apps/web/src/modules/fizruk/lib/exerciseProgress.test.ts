import { describe, expect, it } from "vitest";
import type { WorkoutItem } from "@sergeant/fizruk-domain";
import { dateKeyFromDate } from "@sergeant/fizruk-domain/domain/plan/calendar";

import {
  buildStrengthProgressData,
  startOfLocalIsoWeek,
} from "./exerciseProgress";

function strengthItem(
  sets: Array<{ weightKg: number; reps: number }>,
): WorkoutItem {
  return {
    id: "item-1",
    exerciseId: "bench",
    nameUk: "Bench",
    primaryGroup: "chest",
    musclesPrimary: ["chest"],
    musclesSecondary: [],
    type: "strength",
    sets,
  };
}

describe("exercise progress aggregation", () => {
  it("buckets early-Monday local workouts into the same local ISO week", () => {
    const monday = new Date(2026, 0, 5, 0, 30);
    const wednesday = new Date(2026, 0, 7, 18, 0);

    expect(dateKeyFromDate(startOfLocalIsoWeek(monday))).toBe("2026-01-05");

    const progress = buildStrengthProgressData([
      {
        workout: { startedAt: monday.toISOString() },
        item: strengthItem([{ weightKg: 100, reps: 5 }]),
      },
      {
        workout: { startedAt: wednesday.toISOString() },
        item: strengthItem([{ weightKg: 80, reps: 10 }]),
      },
    ]);

    expect(progress.rmPoints).toHaveLength(1);
    expect(progress.rmPoints[0]!.value).toBe(117);
    expect(progress.volPoints).toEqual([
      { dateLabel: progress.rmPoints[0]!.dateLabel, value: 1300 },
    ]);
  });
});
