import { describe, expect, it } from "vitest";

import { listRecentCompletedWorkouts } from "./recentWorkouts.js";

describe("listRecentCompletedWorkouts", () => {
  it("returns [] for empty / null / zero-limit inputs", () => {
    expect(listRecentCompletedWorkouts(null)).toEqual([]);
    expect(listRecentCompletedWorkouts([])).toEqual([]);
    expect(listRecentCompletedWorkouts([{ endedAt: null } as never])).toEqual(
      [],
    );
    expect(
      listRecentCompletedWorkouts(
        [
          {
            startedAt: "2026-04-20T10:00:00Z",
            endedAt: "2026-04-20T11:00:00Z",
            items: [],
          },
        ],
        { limit: 0 },
      ),
    ).toEqual([]);
  });

  it("returns the newest completed workouts first and computes duration/tonnage", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T10:45:00Z",
        note: "Light day",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
          },
        ],
      },
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: [
          {
            exerciseId: "squat",
            nameUk: "Присід",
            type: "strength",
            sets: [
              { weightKg: 100, reps: 5 },
              { weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
      {
        startedAt: "2026-04-05T10:00:00Z",
        endedAt: null,
        items: [],
      },
    ];

    const rows = listRecentCompletedWorkouts(workouts, { limit: 5 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      startedAt: "2026-04-20T10:00:00Z",
      endedAt: "2026-04-20T11:00:00Z",
      durationSec: 3600,
      itemsCount: 1,
      tonnageKg: 1000,
      label: "Присід",
    });
    expect(rows[1]).toMatchObject({
      startedAt: "2026-04-10T10:00:00Z",
      endedAt: "2026-04-10T10:45:00Z",
      durationSec: 2700,
      tonnageKg: 600,
      label: "Light day",
    });
  });

  it("applies the limit", () => {
    const workouts = Array.from({ length: 5 }, (_, i) => ({
      startedAt: `2026-04-1${i}T10:00:00Z`,
      endedAt: `2026-04-1${i}T11:00:00Z`,
      items: [],
    }));
    const rows = listRecentCompletedWorkouts(workouts, { limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it("falls back to 'Тренування' label when no note / exercise name is available", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: [],
      },
    ];
    const rows = listRecentCompletedWorkouts(workouts);
    expect(rows[0]!.label).toBe("Тренування");
  });
});
