import { describe, expect, it } from "vitest";

import {
  computeProgressKpis,
  countExercisePRs,
  formatLatestWorkoutLabel,
  NO_LATEST_WORKOUT_LABEL,
} from "./progressKpis.js";

describe("countExercisePRs", () => {
  it("returns 0 for empty / null input", () => {
    expect(countExercisePRs(null)).toBe(0);
    expect(countExercisePRs(undefined)).toBe(0);
    expect(countExercisePRs([])).toBe(0);
  });

  it("counts distinct strength exercises with a positive 1RM", () => {
    const workouts = [
      {
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 60, reps: 8 }],
          },
          {
            exerciseId: "squat",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
      {
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 70, reps: 5 }],
          },
        ],
      },
    ];
    expect(countExercisePRs(workouts)).toBe(2);
  });

  it("ignores non-strength items and missing exerciseId", () => {
    const workouts = [
      {
        items: [
          { exerciseId: "run", type: "distance", sets: [] },
          {
            exerciseId: null,
            type: "strength",
            sets: [{ weightKg: 40, reps: 10 }],
          },
        ],
      },
    ];
    expect(countExercisePRs(workouts)).toBe(0);
  });

  it("ignores sets with zero weight or reps", () => {
    const workouts = [
      {
        items: [
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
    expect(countExercisePRs(workouts)).toBe(0);
  });

  it("handles missing item/set arrays and non-finite set values", () => {
    const workouts = [
      {},
      {
        items: [
          { exerciseId: "empty", type: "strength" },
          {
            exerciseId: "bad",
            type: "strength",
            sets: [
              { weightKg: null, reps: 5 },
              { weightKg: 50, reps: null },
              { weightKg: "abc", reps: 5 },
              { weightKg: 50, reps: Number.POSITIVE_INFINITY },
            ],
          },
          {
            exerciseId: "string-values",
            type: "strength",
            sets: [{ weightKg: "50", reps: "5" }],
          },
        ],
      },
    ];

    expect(countExercisePRs(workouts)).toBe(1);
  });
});

describe("computeProgressKpis", () => {
  it("returns zeros for empty input", () => {
    expect(computeProgressKpis([], 0)).toEqual({
      doneCount: 0,
      prsCount: 0,
      entriesCount: 0,
      latestWorkoutIso: null,
    });
  });

  it("computes doneCount / prsCount / latestWorkoutIso", () => {
    const workouts = [
      {
        startedAt: "2026-01-10T10:00:00Z",
        endedAt: "2026-01-10T11:00:00Z",
        items: [
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 60, reps: 5 }],
          },
        ],
      },
      {
        startedAt: "2026-02-01T10:00:00Z",
        endedAt: null,
        items: [],
      },
      {
        startedAt: "2026-01-20T10:00:00Z",
        endedAt: "2026-01-20T11:00:00Z",
        items: [
          {
            exerciseId: "squat",
            type: "strength",
            sets: [{ weightKg: 100, reps: 5 }],
          },
        ],
      },
    ];
    const kpis = computeProgressKpis(workouts, 3);
    expect(kpis.doneCount).toBe(2);
    expect(kpis.prsCount).toBe(2);
    expect(kpis.entriesCount).toBe(3);
    expect(kpis.latestWorkoutIso).toBe("2026-01-20T10:00:00Z");
  });

  it("clamps negative / fractional entries counts", () => {
    const kpis = computeProgressKpis([], -5);
    expect(kpis.entriesCount).toBe(0);
    const kpis2 = computeProgressKpis([], 2.7);
    expect(kpis2.entriesCount).toBe(2);
  });

  it("ignores completed workouts with invalid startedAt when picking the latest", () => {
    const workouts = [
      {
        startedAt: "not-a-date",
        endedAt: "2026-01-10T11:00:00Z",
        items: [],
      },
      {
        startedAt: "2026-01-05T10:00:00Z",
        endedAt: "2026-01-05T11:00:00Z",
        items: [],
      },
    ];
    const kpis = computeProgressKpis(workouts, 0);
    expect(kpis.latestWorkoutIso).toBe("2026-01-05T10:00:00Z");
  });

  it("ignores completed workouts with missing startedAt when picking latest", () => {
    const kpis = computeProgressKpis(
      [{ endedAt: "2026-01-10T11:00:00Z", items: [] }],
      0,
    );

    expect(kpis.doneCount).toBe(1);
    expect(kpis.latestWorkoutIso).toBeNull();
  });

  it("accepts nullish workout input and preserves NaN entry counts", () => {
    const kpis = computeProgressKpis(null, Number.NaN);
    expect(kpis.doneCount).toBe(0);
    expect(kpis.prsCount).toBe(0);
    expect(Number.isNaN(kpis.entriesCount)).toBe(true);
    expect(kpis.latestWorkoutIso).toBeNull();
  });
});

describe("formatLatestWorkoutLabel", () => {
  it("returns the em-dash sentinel for null / invalid input", () => {
    expect(formatLatestWorkoutLabel(null)).toBe(NO_LATEST_WORKOUT_LABEL);
    expect(formatLatestWorkoutLabel("")).toBe(NO_LATEST_WORKOUT_LABEL);
    expect(formatLatestWorkoutLabel("nope")).toBe(NO_LATEST_WORKOUT_LABEL);
  });

  it("formats a valid ISO timestamp with a locale date-like label", () => {
    const label = formatLatestWorkoutLabel("2026-04-15T00:00:00Z");
    expect(label).not.toBe(NO_LATEST_WORKOUT_LABEL);
    expect(label.length).toBeGreaterThan(0);
  });
});
