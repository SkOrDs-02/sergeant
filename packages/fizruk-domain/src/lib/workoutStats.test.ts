import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareIsoDesc,
  completedWorkoutsCount,
  countCompletedInCurrentWeek,
  formatCompactKg,
  getExercisePR,
  personalRecordsExerciseCount,
  suggestNextSet,
  totalCompletedVolumeKg,
  workoutDurationSec,
  workoutTonnageKg,
  weeklyVolumeSeriesNow,
} from "./workoutStats";

describe("workoutTonnageKg", () => {
  it("sums strength sets", () => {
    const w = {
      items: [
        {
          type: "strength",
          sets: [
            { weightKg: 50, reps: 10 },
            { weightKg: 50, reps: 8 },
          ],
        },
      ],
    };
    expect(workoutTonnageKg(w)).toBe(50 * 10 + 50 * 8);
  });

  it("returns 0 for empty", () => {
    expect(workoutTonnageKg({ items: [] })).toBe(0);
  });
});

describe("workoutDurationSec", () => {
  it("returns 0 without startedAt", () => {
    expect(workoutDurationSec({})).toBe(0);
  });

  it("returns 0 for null/undefined workout", () => {
    expect(workoutDurationSec(null)).toBe(0);
    expect(workoutDurationSec(undefined)).toBe(0);
  });

  it("returns 0 when startedAt is unparsable", () => {
    expect(workoutDurationSec({ startedAt: "not-a-date" })).toBe(0);
  });

  it("computes elapsed seconds between startedAt and endedAt", () => {
    expect(
      workoutDurationSec({
        startedAt: "2026-01-01T10:00:00Z",
        endedAt: "2026-01-01T10:01:30Z",
      }),
    ).toBe(90);
  });

  it("falls back to Date.now() when endedAt is missing (in-progress workout)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:05:00Z"));
    expect(workoutDurationSec({ startedAt: "2026-01-01T10:00:00Z" })).toBe(300);
    vi.useRealTimers();
  });
});

describe("personalRecordsExerciseCount", () => {
  it("counts distinct exercises with strength sets", () => {
    const workouts = [
      {
        items: [
          {
            exerciseId: "a",
            type: "strength",
            sets: [{ weightKg: 50, reps: 10 }],
          },
          {
            exerciseId: "b",
            type: "strength",
            sets: [{ weightKg: 50, reps: 5 }],
          },
        ],
      },
    ];
    expect(personalRecordsExerciseCount(workouts)).toBe(2);
  });
});

describe("weeklyVolumeSeriesNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 7 volume slots", () => {
    const { volumeKg } = weeklyVolumeSeriesNow([]);
    expect(volumeKg).toHaveLength(7);
  });

  function done(startedAt: string, weightKg: number, reps: number) {
    return {
      startedAt,
      endedAt: startedAt,
      items: [{ type: "strength", sets: [{ weightKg, reps }] }],
    };
  }

  // Domain invariant: week boundaries are Europe/Kyiv, not the host tz.
  // Mon 2026-06-08 00:00 Kyiv (EEST, UTC+3) = 2026-06-07T21:00:00Z.
  it("anchors the Mon..Sun week to Europe/Kyiv regardless of host tz", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z")); // Wed of that week

    const { weekStartMs, volumeKg } = weeklyVolumeSeriesNow([
      done("2026-06-07T20:30:00Z", 100, 1), // Sun 23:30 Kyiv → previous week
      done("2026-06-07T21:30:00Z", 60, 5), // Mon 00:30 Kyiv → idx 0
      done("2026-06-10T10:00:00Z", 40, 10), // Wed 13:00 Kyiv → idx 2
    ]);

    expect(weekStartMs).toBe(Date.parse("2026-06-07T21:00:00Z"));
    expect(volumeKg).toEqual([300, 0, 400, 0, 0, 0, 0]);
  });

  // DST week: Kyiv springs forward Sun 2026-03-29 03:00 EET → 04:00 EEST,
  // so the week Mon 2026-03-23 .. Sun 2026-03-29 is 167 hours long.
  it("buckets days correctly across the spring-forward DST week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z")); // Thu of DST week

    const { weekStartMs, volumeKg } = weeklyVolumeSeriesNow([
      done("2026-03-22T22:30:00Z", 60, 5), // Mon 00:30 Kyiv (EET) → idx 0
      done("2026-03-29T20:30:00Z", 100, 1), // Sun 23:30 Kyiv (EEST) → idx 6
      done("2026-03-29T21:30:00Z", 999, 1), // Mon 00:30 Kyiv next week → out
    ]);

    // Mon 2026-03-23 00:00 Kyiv (EET, UTC+2) = 2026-03-22T22:00:00Z.
    expect(weekStartMs).toBe(Date.parse("2026-03-22T22:00:00Z"));
    expect(volumeKg).toEqual([300, 0, 0, 0, 0, 0, 100]);
  });
});

describe("countCompletedInCurrentWeek", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Kyiv week boundary, not the host-local one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

    const mk = (startedAt: string) => ({
      startedAt,
      endedAt: startedAt,
      items: [],
    });
    expect(
      countCompletedInCurrentWeek([
        mk("2026-06-07T20:30:00Z"), // Sun 23:30 Kyiv → previous week
        mk("2026-06-07T21:30:00Z"), // Mon 00:30 Kyiv → this week
        mk("2026-06-12T10:00:00Z"), // Fri → this week
      ]),
    ).toBe(2);
  });

  it("skips workouts without endedAt or with an unparsable startedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
    expect(
      countCompletedInCurrentWeek([
        { startedAt: "2026-06-10T10:00:00Z", items: [] }, // no endedAt
        {
          startedAt: "not-a-date",
          endedAt: "2026-06-10T10:00:00Z",
          items: [],
        }, // unparsable startedAt
        { endedAt: "2026-06-10T10:00:00Z", items: [] }, // no startedAt at all
      ]),
    ).toBe(0);
  });

  it("returns 0 for null/undefined input", () => {
    expect(countCompletedInCurrentWeek(null)).toBe(0);
    expect(countCompletedInCurrentWeek(undefined)).toBe(0);
  });
});

describe("formatCompactKg", () => {
  it("formats thousands", () => {
    expect(formatCompactKg(1500)).toMatch(/k/);
  });

  it("formats millions", () => {
    expect(formatCompactKg(2_500_000)).toBe("2.5M");
  });

  it("rounds sub-thousand values with no suffix", () => {
    expect(formatCompactKg(42.6)).toBe("43");
  });

  it("defaults null/undefined/NaN to 0", () => {
    expect(formatCompactKg(null)).toBe("0");
    expect(formatCompactKg(undefined)).toBe("0");
  });
});

describe("compareIsoDesc", () => {
  it("orders more recent ISO timestamps first", () => {
    expect(
      compareIsoDesc("2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ).toBeLessThan(0);
    expect(
      compareIsoDesc("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"),
    ).toBeGreaterThan(0);
  });

  it("returns 0 when both timestamps are unparsable/missing", () => {
    expect(compareIsoDesc(null, undefined)).toBe(0);
    expect(compareIsoDesc("garbage", "")).toBe(0);
  });

  it("sinks an unparsable `a` below a valid `b`", () => {
    expect(compareIsoDesc("garbage", "2026-01-01T00:00:00Z")).toBe(1);
  });

  it("sinks an unparsable `b` below a valid `a`", () => {
    expect(compareIsoDesc("2026-01-01T00:00:00Z", "garbage")).toBe(-1);
  });
});

describe("completedWorkoutsCount", () => {
  it("counts ended workouts", () => {
    expect(completedWorkoutsCount([{ endedAt: "x" }, {}])).toBe(1);
  });

  it("returns 0 for null/undefined input", () => {
    expect(completedWorkoutsCount(null)).toBe(0);
    expect(completedWorkoutsCount(undefined)).toBe(0);
  });
});

describe("totalCompletedVolumeKg", () => {
  it("sums tonnage of completed", () => {
    const w = {
      endedAt: "2020-01-01",
      items: [{ type: "strength", sets: [{ weightKg: 10, reps: 5 }] }],
    };
    expect(totalCompletedVolumeKg([w])).toBe(50);
  });

  it("skips workouts without endedAt", () => {
    const w = {
      items: [{ type: "strength", sets: [{ weightKg: 10, reps: 5 }] }],
    };
    expect(totalCompletedVolumeKg([w])).toBe(0);
  });

  it("returns 0 for null/undefined input", () => {
    expect(totalCompletedVolumeKg(null)).toBe(0);
    expect(totalCompletedVolumeKg(undefined)).toBe(0);
  });
});

describe("getExercisePR", () => {
  const workouts = [
    {
      startedAt: "2026-01-10T10:00:00Z",
      items: [
        {
          exerciseId: "bench",
          type: "strength",
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 65, reps: 5 },
          ],
        },
      ],
    },
    {
      startedAt: "2026-01-17T10:00:00Z",
      items: [
        {
          exerciseId: "bench",
          type: "strength",
          sets: [{ weightKg: 70, reps: 4 }],
        },
      ],
    },
  ];

  it("returns the best 1RM set and its date", () => {
    const pr = getExercisePR(workouts, "bench");
    expect(pr.best1rm).toBeGreaterThan(0);
    expect(pr.bestSet).toBeDefined();
    expect(pr.date).toBe("2026-01-17T10:00:00Z");
  });

  it("returns zero best1rm for missing exercise", () => {
    const pr = getExercisePR(workouts, "squat");
    expect(pr.best1rm).toBe(0);
    expect(pr.bestSet).toBeNull();
    expect(pr.date).toBeNull();
  });

  it("returns null for empty workouts", () => {
    const pr = getExercisePR([], "bench");
    expect(pr.best1rm).toBe(0);
  });
});

describe("suggestNextSet", () => {
  it("returns null for empty or zero input", () => {
    expect(suggestNextSet(null)).toBeNull();
    expect(suggestNextSet({ weightKg: 0, reps: 8 })).toBeNull();
    expect(suggestNextSet({ weightKg: 60, reps: 0 })).toBeNull();
  });

  it("reps ≤ 5: adds 2.5 kg, no alt", () => {
    const s = suggestNextSet({ weightKg: 100, reps: 5 });
    expect(s).not.toBeNull();
    expect(s!.weightKg).toBe(102.5);
    expect(s!.reps).toBe(5);
    expect(s!.altWeightKg).toBeUndefined();
  });

  it("reps 6-10: adds 2.5 kg primary + same-weight +1 rep alt", () => {
    const s = suggestNextSet({ weightKg: 80, reps: 8 });
    expect(s).not.toBeNull();
    expect(s!.weightKg).toBe(82.5);
    expect(s!.reps).toBe(8);
    expect(s!.altWeightKg).toBe(80);
    expect(s!.altReps).toBe(9);
  });

  it("reps > 10: adds 5% rounded to 2.5 kg, no alt", () => {
    const s = suggestNextSet({ weightKg: 40, reps: 12 });
    expect(s).not.toBeNull();
    expect(s!.weightKg).toBe(42.5);
    expect(s!.altWeightKg).toBeUndefined();
  });

  it("result weightKg is always a multiple of 2.5", () => {
    [3, 8, 15].forEach((reps) => {
      const s = suggestNextSet({ weightKg: 67.5, reps });
      expect(s).not.toBeNull();
      expect(s!.weightKg % 2.5).toBeCloseTo(0);
    });
  });
});
