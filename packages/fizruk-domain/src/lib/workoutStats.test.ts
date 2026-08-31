import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareIsoDesc,
  completedWorkoutsCount,
  countCompletedInCurrentWeek,
  epley1rm,
  formatCompactKg,
  getExercisePR,
  personalRecordsExerciseCount,
  suggestNextSet,
  targetRepRange,
  totalCompletedVolumeKg,
  weightStepKg,
  workoutDurationSec,
  workoutTonnageKg,
  weeklyVolumeSeriesNow,
} from "./workoutStats";
import { computeOneRmAging } from "../domain/workouts/oneRmAging";

describe("epley1rm", () => {
  it("returns 0 for nullish, zero, or negative inputs", () => {
    expect(epley1rm(null, 5)).toBe(0);
    expect(epley1rm(100, undefined)).toBe(0);
    expect(epley1rm(-100, 5)).toBe(0);
    expect(epley1rm(100, -1)).toBe(0);
  });

  it("estimates 1RM for positive weight and reps", () => {
    expect(epley1rm(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
  });

  it("excludes sets above the 10-rep safety cap", () => {
    expect(epley1rm(40, 10)).toBeGreaterThan(0);
    expect(epley1rm(40, 11)).toBe(0);
    expect(epley1rm(40, 20)).toBe(0);
  });
});

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

  it("ignores null workouts, non-strength items, and missing sets", () => {
    expect(workoutTonnageKg(null)).toBe(0);
    expect(
      workoutTonnageKg({
        items: [
          { type: "distance", sets: [{ weightKg: 100, reps: 100 }] },
          { type: "strength" },
        ],
      }),
    ).toBe(0);
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

  it("clamps negative elapsed time to 0", () => {
    expect(
      workoutDurationSec({
        startedAt: "2026-01-01T10:05:00Z",
        endedAt: "2026-01-01T10:00:00Z",
      }),
    ).toBe(0);
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

  it("ignores missing ids, non-strength items, and zero-load sets", () => {
    const workouts = [
      {
        items: [
          {
            exerciseId: "",
            type: "strength",
            sets: [{ weightKg: 50, reps: 5 }],
          },
          {
            exerciseId: "run",
            type: "distance",
            sets: [{ weightKg: 50, reps: 5 }],
          },
          {
            exerciseId: "bench",
            type: "strength",
            sets: [{ weightKg: 0, reps: 0 }],
          },
        ],
      },
    ];

    expect(personalRecordsExerciseCount(workouts)).toBe(0);
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

  it("skips incomplete and malformed workout rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

    const { volumeKg } = weeklyVolumeSeriesNow([
      { startedAt: "2026-06-10T10:00:00Z", items: [] },
      { startedAt: "not-a-date", endedAt: "2026-06-10T11:00:00Z", items: [] },
      { endedAt: "2026-06-10T11:00:00Z", items: [] },
    ]);

    expect(volumeKg).toEqual([0, 0, 0, 0, 0, 0, 0]);
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

  it("ignores unrelated item shapes and records null date when startedAt is missing", () => {
    const pr = getExercisePR(
      [
        {
          items: [
            {
              exerciseId: "bench",
              type: "distance",
              sets: [{ weightKg: 999, reps: 999 }],
            },
            {
              exerciseId: "squat",
              type: "strength",
              sets: [{ weightKg: 999, reps: 999 }],
            },
            { exerciseId: "bench", type: "strength" },
            {
              exerciseId: "bench",
              type: "strength",
              sets: [{ weightKg: 60, reps: 5 }],
            },
          ],
        },
      ],
      "bench",
    );

    expect(pr.bestSet).toEqual({ weightKg: 60, reps: 5 });
    expect(pr.date).toBeNull();
  });
});

describe("suggestNextSet", () => {
  it("returns null for empty or zero input", () => {
    expect(suggestNextSet(null)).toBeNull();
    expect(suggestNextSet({ weightKg: 0, reps: 8 })).toBeNull();
    expect(suggestNextSet({ weightKg: 60, reps: 0 })).toBeNull();
  });

  it("grows reps inside the range before touching the weight", () => {
    const s = suggestNextSet({ weightKg: 80, reps: 8 });
    expect(s).not.toBeNull();
    expect(s!.weightKg).toBe(80);
    expect(s!.reps).toBe(9);
    expect(s!.altWeightKg).toBe(82.5);
    expect(s!.altReps).toBe(8);
  });

  it("adds weight and returns to the bottom of the range at the ceiling", () => {
    const s = suggestNextSet({ weightKg: 40, reps: 12 });
    expect(s).not.toBeNull();
    expect(s!.weightKg).toBe(42.5);
    expect(s!.reps).toBe(8);
    expect(s!.altWeightKg).toBeUndefined();
  });

  it("reads the target range from the catalog entry", () => {
    const barbell = { equipment: ["barbell"], primaryGroup: "chest" };
    const curl = { equipment: ["dumbbell"], primaryGroup: "biceps" };

    expect(targetRepRange(barbell)).toEqual({ min: 5, max: 8 });
    expect(targetRepRange(curl)).toEqual({ min: 10, max: 15 });
    expect(targetRepRange(null)).toEqual({ min: 8, max: 12 });

    const s = suggestNextSet({ weightKg: 100, reps: 8 }, { exercise: barbell });
    expect(s!.weightKg).toBe(102.5);
    expect(s!.reps).toBe(5);
  });

  it("uses a 5 kg step for barbell lower-body work", () => {
    expect(
      weightStepKg({ equipment: ["barbell"], primaryGroup: "quadriceps" }),
    ).toBe(5);
    expect(
      weightStepKg({ equipment: ["barbell"], primaryGroup: "chest" }),
    ).toBe(2.5);
    const s = suggestNextSet(
      { weightKg: 100, reps: 8 },
      { exercise: { equipment: ["barbell"], primaryGroup: "quadriceps" } },
    );
    expect(s!.weightKg).toBe(105);
  });

  it("never raises the weight in return mode", () => {
    const s = suggestNextSet(
      { weightKg: 100, reps: 12 },
      { aging: { returnMode: true, returnReason: "layoff", reductionPct: 10 } },
    );
    expect(s!.weightKg).toBe(90);
    expect(s!.reps).toBe(8);
    expect(s!.softMode).toBe(true);
    expect(s!.returnReason).toBe("layoff");
  });

  it("holds the weight when return mode has not reduced the anchor yet", () => {
    const s = suggestNextSet(
      { weightKg: 62.5, reps: 12 },
      { aging: { returnMode: true, returnReason: "injury", reductionPct: 0 } },
    );
    expect(s!.weightKg).toBe(62.5);
    expect(s!.softMode).toBe(true);
  });
});

// Сценарій зі спеки: три сесії за програмою підряд. Перевіряємо не «функція
// щось повернула», а що між сесіями вага рухається в очікуваний бік.
describe("suggestNextSet — три сесії за програмою", () => {
  const press = { equipment: ["dumbbell", "bench"], primaryGroup: "chest" };

  it("reps grow, then weight steps up, then a layoff pulls it back", () => {
    const first = suggestNextSet(
      { weightKg: 30, reps: 8 },
      { exercise: press },
    );
    expect(first).toMatchObject({ weightKg: 30, reps: 9, softMode: false });

    const second = suggestNextSet(
      { weightKg: 30, reps: 12 },
      { exercise: press },
    );
    expect(second).toMatchObject({ weightKg: 32.5, reps: 8 });

    const aging = computeOneRmAging({
      // Epley не рахує понад 10 повторень (E1RM_REP_CAP), тож пік беремо
      // з підходу, який у цю межу вкладається.
      peak1rm: epley1rm(32.5, 8),
      lastSessionAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    });
    expect(aging.returnMode).toBe(true);

    const third = suggestNextSet(
      { weightKg: 32.5, reps: 12 },
      { exercise: press, aging },
    );
    expect(third!.softMode).toBe(true);
    expect(third!.returnReason).toBe("layoff");
    expect(third!.weightKg).toBeLessThan(second!.weightKg);
  });
});
