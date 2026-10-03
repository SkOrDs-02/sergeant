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

  it("skips workouts with a non-string / empty endedAt or missing startedAt", () => {
    const workouts = [
      { startedAt: "2026-04-20T10:00:00Z", endedAt: "", items: [] },
      { startedAt: "2026-04-20T10:00:00Z", endedAt: 123, items: [] },
      { endedAt: "2026-04-20T11:00:00Z", items: [] }, // no startedAt
      { startedAt: "", endedAt: "2026-04-20T11:00:00Z", items: [] }, // empty startedAt
    ];
    expect(listRecentCompletedWorkouts(workouts as never)).toEqual([]);
  });

  it("returns durationSec 0 for unparsable start/end timestamps", () => {
    const workouts = [
      { startedAt: "not-a-date", endedAt: "also-not-a-date", items: [] },
    ];
    const rows = listRecentCompletedWorkouts(workouts);
    expect(rows[0]!.durationSec).toBe(0);
  });

  it("clamps negative durations to 0", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T12:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: [],
      },
    ];

    expect(listRecentCompletedWorkouts(workouts)[0]!.durationSec).toBe(0);
  });

  it("falls back to the first item's name when the note is blank/whitespace", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        note: "   ",
        items: [
          { exerciseId: "x", nameUk: "  ", type: "strength", sets: [] },
          { exerciseId: "bench", nameUk: "Жим", type: "strength", sets: [] },
        ],
      },
    ];
    const rows = listRecentCompletedWorkouts(workouts);
    expect(rows[0]!.label).toBe("Жим");
  });

  it("excludes zero/negative weight or rep sets from tonnage", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [
              { weightKg: 0, reps: 10 },
              { weightKg: 50, reps: 0 },
              { weightKg: -5, reps: 5 },
            ],
          },
          {
            exerciseId: "run",
            type: "distance",
            sets: [{ weightKg: 100, reps: 100 }],
          },
        ],
      },
    ];
    const rows = listRecentCompletedWorkouts(workouts);
    expect(rows[0]!.tonnageKg).toBe(0);
  });

  it("ignores blank / non-finite tonnage inputs but accepts numeric strings", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [
              { weightKg: "", reps: 10 },
              { weightKg: 50, reps: "abc" },
              { weightKg: "60", reps: "5" },
            ],
          },
        ],
      },
    ];

    expect(listRecentCompletedWorkouts(workouts)[0]!.tonnageKg).toBe(300);
  });

  it("sorts invalid endedAt values behind valid dates", () => {
    const workouts = [
      { startedAt: "2026-04-20T10:00:00Z", endedAt: "not-a-date", items: [] },
      {
        startedAt: "2026-04-19T10:00:00Z",
        endedAt: "2026-04-19T11:00:00Z",
        items: [],
      },
    ];

    expect(listRecentCompletedWorkouts(workouts)[0]!.endedAt).toBe(
      "2026-04-19T11:00:00Z",
    );
  });

  it("counts itemsCount as 0 when items is not an array", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: undefined,
      },
    ];
    const rows = listRecentCompletedWorkouts(workouts as never);
    expect(rows[0]!.itemsCount).toBe(0);
  });
});
