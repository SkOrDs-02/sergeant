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

  it("skips falsy workout entries, non-string endedAt, and items with no exerciseId", () => {
    const workouts = [
      null,
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: 12345 as unknown as string, // non-string endedAt
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            // no exerciseId
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ];
    expect(computeTopPRs(workouts as never)).toEqual([]);
  });

  it("falls back to null nameUk when the item has no name", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ];
    const result = computeTopPRs(workouts);
    expect(result[0]!.nameUk).toBeNull();
  });

  it("handles completed workouts with missing items and strength items with missing sets", () => {
    const workouts = [
      {
        startedAt: "2026-04-09T10:00:00Z",
        endedAt: "2026-04-09T11:00:00Z",
      },
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [{ exerciseId: "bench", type: "strength" }],
      },
    ];

    expect(computeTopPRs(workouts)).toEqual([]);
  });

  it("does not replace an existing PR with a lower 1RM set", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [
              { weightKg: 100, reps: 5 },
              { weightKg: 80, reps: 5 },
            ],
          },
        ],
      },
    ];

    expect(computeTopPRs(workouts)[0]!.weightKg).toBe(100);
  });

  it("on a tie in 1RM, the more recent workout wins", () => {
    const workouts = [
      {
        startedAt: "2026-04-01T10:00:00Z",
        endedAt: "2026-04-01T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }], // 1RM = 116.67
          },
        ],
      },
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }], // same 1RM, later date
          },
        ],
      },
    ];
    const result = computeTopPRs(workouts);
    expect(result[0]!.atIso).toBe("2026-04-10T11:00:00Z");
  });

  it("keeps the earlier PR when a later workout ties but is not chronologically newer", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
      {
        startedAt: "2026-04-01T10:00:00Z",
        endedAt: "2026-04-01T11:00:00Z", // earlier than the first
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }], // same 1RM
          },
        ],
      },
    ];
    const result = computeTopPRs(workouts);
    expect(result[0]!.atIso).toBe("2026-04-10T11:00:00Z");
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

  it("ignores blank and non-finite set values", () => {
    const workouts = [
      {
        startedAt: "2026-04-10T10:00:00Z",
        endedAt: "2026-04-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [
              { weightKg: "", reps: 5 },
              { weightKg: 50, reps: "abc" },
              { weightKg: "60", reps: "5" },
            ],
          },
        ],
      },
    ];

    const result = computeTopPRs(workouts);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      exerciseId: "bench",
      weightKg: 60,
      reps: 5,
    });
  });

  it("keeps insertion order for equal PRs when one PR date is invalid", () => {
    const workouts = [
      {
        startedAt: "2026-04-01T10:00:00Z",
        endedAt: "not-a-date",
        items: [
          {
            exerciseId: "invalid-date",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
      {
        startedAt: "2026-04-02T10:00:00Z",
        endedAt: "2026-04-02T11:00:00Z",
        items: [
          {
            exerciseId: "dated",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ];

    expect(computeTopPRs(workouts).map((item) => item.exerciseId)).toEqual([
      "invalid-date",
      "dated",
    ]);
  });
});
