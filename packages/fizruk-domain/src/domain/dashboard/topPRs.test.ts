import { describe, expect, it } from "vitest";

import { computeTopPRs } from "./topPRs.js";

describe("computeTopPRs", () => {
  it("returns an empty list for empty / null inputs", () => {
    expect(computeTopPRs(null)).toEqual([]);
    expect(computeTopPRs(undefined)).toEqual([]);
    expect(computeTopPRs([])).toEqual([]);
  });

  it("skips workouts without endedAt (incomplete sessions)", () => {
    const workouts = [
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: null,
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ];
    expect(computeTopPRs(workouts)).toEqual([]);
  });

  it("picks the best 1RM per exercise and sorts desc", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            nameUk: "Жим лежачи",
            type: "strength",
            sets: [
              { weightKg: 60, reps: 10 }, // 1RM ≈ 80
              { weightKg: 80, reps: 5 }, // 1RM ≈ 93.3
            ],
          },
          {
            exerciseId: "squat",
            nameUk: "Присід",
            type: "strength",
            sets: [{ weightKg: 120, reps: 5 }], // 1RM = 140
          },
        ],
      },
      {
        startedAt: "2026-04-20T10:00:00Z",
        endedAt: "2026-04-20T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            nameUk: "Жим лежачи",
            type: "strength",
            sets: [{ weightKg: 90, reps: 3 }], // 1RM = 99
          },
        ],
      },
    ];

    const result = computeTopPRs(workouts, { limit: 3 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      exerciseId: "squat",
      nameUk: "Присід",
      weightKg: 120,
      reps: 5,
    });
    expect(result[0]!.oneRmKg).toBeCloseTo(140, 1);
    expect(result[1]).toMatchObject({
      exerciseId: "bench",
      nameUk: "Жим лежачи",
      weightKg: 90,
      reps: 3,
      atIso: "2026-04-20T11:00:00Z",
    });
    expect(result[1]!.oneRmKg).toBeCloseTo(99, 1);
  });

  it("honours the limit option", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "a",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
          {
            exerciseId: "b",
            type: "strength",
            sets: [{ weightKg: 90, reps: 5 }],
          },
          {
            exerciseId: "c",
            type: "strength",
            sets: [{ weightKg: 80, reps: 5 }],
          },
        ],
      },
    ];
    expect(computeTopPRs(workouts, { limit: 2 })).toHaveLength(2);
  });

  it("ignores zero-weight / zero-rep sets and non-strength items", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "run",
            type: "distance",
            sets: [{ weightKg: 100, reps: 100 }],
          },
          {
            exerciseId: "bench",
            type: "strength",
            sets: [
              { weightKg: 0, reps: 5 },
              { weightKg: 50, reps: 0 },
            ],
          },
        ],
      },
    ];
    expect(computeTopPRs(workouts)).toEqual([]);
  });
});
