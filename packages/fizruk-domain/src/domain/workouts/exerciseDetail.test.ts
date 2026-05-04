import { describe, expect, it } from "vitest";

import type { Workout, WorkoutItem } from "../types.js";
import {
  buildLoadCalculatorZones,
  collectExerciseHistory,
  computeExerciseBest,
  computeExerciseCardioTrend,
  computeExerciseWeeklyTrend,
  roundToNearest2_5,
} from "./exerciseDetail.js";

function w(id: string, startedAt: string, items: WorkoutItem[]): Workout {
  return {
    id,
    startedAt,
    endedAt: null,
    items,
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
}

function strength(
  id: string,
  exerciseId: string,
  sets: Array<{ weightKg: number; reps: number }>,
): WorkoutItem {
  return {
    id,
    exerciseId,
    nameUk: exerciseId,
    primaryGroup: "quadriceps",
    musclesPrimary: [],
    musclesSecondary: [],
    type: "strength",
    sets,
  };
}

function distance(
  id: string,
  exerciseId: string,
  distanceM: number,
  durationSec: number,
): WorkoutItem {
  return {
    id,
    exerciseId,
    nameUk: exerciseId,
    primaryGroup: "cardio",
    musclesPrimary: [],
    musclesSecondary: [],
    type: "distance",
    distanceM,
    durationSec,
  };
}

describe("roundToNearest2_5", () => {
  it("rounds up / down / to zero", () => {
    expect(roundToNearest2_5(0)).toBe(0);
    expect(roundToNearest2_5(-10)).toBe(0);
    expect(roundToNearest2_5(3.4)).toBe(2.5);
    expect(roundToNearest2_5(3.75)).toBe(5);
    expect(roundToNearest2_5(103)).toBe(102.5);
  });
});

describe("collectExerciseHistory", () => {
  it("keeps only matching items, sorted newest-first", () => {
    const ws: Workout[] = [
      w("w_old", "2026-04-01T10:00:00Z", [
        strength("it_a", "squat", [{ weightKg: 100, reps: 5 }]),
        strength("it_b", "bench", [{ weightKg: 60, reps: 8 }]),
      ]),
      w("w_new", "2026-04-20T10:00:00Z", [
        strength("it_c", "squat", [{ weightKg: 110, reps: 3 }]),
      ]),
      w("w_no_match", "2026-04-21T10:00:00Z", [
        strength("it_d", "bench", [{ weightKg: 70, reps: 6 }]),
      ]),
    ];
    const h = collectExerciseHistory(ws, "squat");
    expect(h.map((e) => e.workout.id)).toEqual(["w_new", "w_old"]);
  });

  it("returns an empty list for empty input and falsy id", () => {
    expect(collectExerciseHistory([], "squat")).toEqual([]);
    expect(collectExerciseHistory(null, "squat")).toEqual([]);
    expect(
      collectExerciseHistory([w("x", "2026-04-01T00:00:00Z", [])], ""),
    ).toEqual([]);
  });

  it("sinks items with unparseable startedAt to the bottom", () => {
    const ws: Workout[] = [
      w("w_bad", "not-a-date", [
        strength("it_a", "squat", [{ weightKg: 50, reps: 5 }]),
      ]),
      w("w_ok", "2026-04-05T10:00:00Z", [
        strength("it_b", "squat", [{ weightKg: 60, reps: 5 }]),
      ]),
    ];
    const h = collectExerciseHistory(ws, "squat");
    expect(h[0]!.workout.id).toBe("w_ok");
    expect(h[1]!.workout.id).toBe("w_bad");
  });
});

describe("computeExerciseBest", () => {
  it("returns zeroed summary for empty history", () => {
    expect(computeExerciseBest([])).toEqual({
      best1rm: 0,
      bestSet: null,
      lastTop: null,
      isNewPR: false,
    });
  });

  it("detects a new PR when the latest workout exceeds prior max", () => {
    // Latest first (matches collectExerciseHistory output order).
    // 110×5 → Epley 128.3; 100×5 → 116.7 (prior best); 105×3 → 115.5.
    const history = [
      {
        workout: w("w_new", "2026-04-20T10:00:00Z", []),
        item: strength("it_new", "squat", [
          { weightKg: 110, reps: 5 },
          { weightKg: 105, reps: 3 },
        ]),
      },
      {
        workout: w("w_old", "2026-04-10T10:00:00Z", []),
        item: strength("it_old", "squat", [{ weightKg: 100, reps: 5 }]),
      },
    ];
    const best = computeExerciseBest(history);
    expect(best.isNewPR).toBe(true);
    expect(best.best1rm).toBeGreaterThan(0);
    expect(best.bestSet?.weightKg).toBe(110);
    expect(best.lastTop?.weightKg).toBe(110);
  });

  it("does NOT flag a PR when the latest workout matches prior max", () => {
    const history = [
      {
        workout: w("w_new", "2026-04-20T10:00:00Z", []),
        item: strength("it_new", "squat", [{ weightKg: 100, reps: 5 }]),
      },
      {
        workout: w("w_old", "2026-04-10T10:00:00Z", []),
        item: strength("it_old", "squat", [{ weightKg: 100, reps: 5 }]),
      },
    ];
    const best = computeExerciseBest(history);
    expect(best.isNewPR).toBe(false);
  });

  it("skips non-strength items when computing 1RM", () => {
    const history = [
      {
        workout: w("w", "2026-04-20T10:00:00Z", []),
        item: distance("it", "run", 5000, 1500),
      },
    ];
    expect(computeExerciseBest(history)).toEqual({
      best1rm: 0,
      bestSet: null,
      lastTop: null,
      isNewPR: false,
    });
  });
});

describe("computeExerciseWeeklyTrend", () => {
  it("buckets sessions by local Monday and caps at 12 weeks", () => {
    const history = [
      {
        // Wed 2026-04-08 groups with Mon 2026-04-06
        workout: w("w1", "2026-04-08T12:00:00Z", []),
        item: strength("i1", "squat", [
          { weightKg: 100, reps: 5 },
          { weightKg: 90, reps: 8 },
        ]),
      },
      {
        // Thu 2026-04-09 — same week
        workout: w("w2", "2026-04-09T12:00:00Z", []),
        item: strength("i2", "squat", [{ weightKg: 110, reps: 3 }]),
      },
      {
        // Mon 2026-04-13 — next week
        workout: w("w3", "2026-04-13T12:00:00Z", []),
        item: strength("i3", "squat", [{ weightKg: 120, reps: 2 }]),
      },
    ];
    const { rmPoints, volPoints } = computeExerciseWeeklyTrend(history);
    expect(rmPoints).toHaveLength(2);
    expect(volPoints).toHaveLength(2);
    // Buckets are sorted ascending by week key.
    expect(rmPoints[0]!.weekKey < rmPoints[1]!.weekKey).toBe(true);
    // Second week max 1RM ≥ first week.
    expect(rmPoints[1]!.value).toBeGreaterThanOrEqual(rmPoints[0]!.value);
    // Volume is sum of weight × reps inside the bucket.
    expect(volPoints[0]!.value).toBe(100 * 5 + 90 * 8 + 110 * 3);
    expect(volPoints[1]!.value).toBe(120 * 2);
  });

  it("drops non-strength or malformed entries", () => {
    const history = [
      {
        workout: w("bad", "not-a-date", []),
        item: strength("x", "squat", [{ weightKg: 100, reps: 5 }]),
      },
      {
        workout: w("cardio", "2026-04-10T10:00:00Z", []),
        item: distance("r", "squat", 3000, 900),
      },
    ];
    const { rmPoints, volPoints } = computeExerciseWeeklyTrend(history);
    expect(rmPoints).toEqual([]);
    expect(volPoints).toEqual([]);
  });
});

describe("computeExerciseCardioTrend", () => {
  it("emits oldest-first points with pace and distance", () => {
    // History comes newest-first.
    const history = [
      {
        workout: w("w2", "2026-04-20T10:00:00Z", []),
        item: distance("i2", "run", 6000, 1800),
      },
      {
        workout: w("w1", "2026-04-10T10:00:00Z", []),
        item: distance("i1", "run", 5000, 1500),
      },
    ];
    const { pacePoints, distPoints } = computeExerciseCardioTrend(history);
    expect(pacePoints).toHaveLength(2);
    expect(distPoints).toHaveLength(2);
    expect(distPoints[0]!.value).toBe(5);
    expect(distPoints[1]!.value).toBe(6);
    // 5 km in 25 min = 5 min/km.
    expect(pacePoints[0]!.value).toBeCloseTo(5, 1);
  });

  it("skips sessions without a positive distance+duration pair", () => {
    const history = [
      {
        workout: w("w1", "2026-04-10T10:00:00Z", []),
        item: distance("i1", "run", 0, 1500),
      },
      {
        workout: w("w2", "2026-04-20T10:00:00Z", []),
        item: distance("i2", "run", 5000, 0),
      },
    ];
    expect(computeExerciseCardioTrend(history)).toEqual({
      pacePoints: [],
      distPoints: [],
    });
  });
});

describe("buildLoadCalculatorZones", () => {
  it("returns [] for non-positive 1RM", () => {
    expect(buildLoadCalculatorZones(0)).toEqual([]);
    expect(buildLoadCalculatorZones(-10)).toEqual([]);
  });

  it("rounds to 2.5 kg and produces all three zones", () => {
    const zones = buildLoadCalculatorZones(100);
    expect(zones.map((z) => z.tone)).toEqual([
      "strength",
      "hypertrophy",
      "endurance",
    ]);
    const strengthEntries = zones[0]!.entries;
    expect(strengthEntries[0]).toEqual({ percent: 95, kg: 95 });
    expect(strengthEntries[1]).toEqual({ percent: 90, kg: 90 });
    expect(strengthEntries[2]).toEqual({ percent: 85, kg: 85 });
    // Fractional % → rounded 2.5 step.
    const hyper = zones[1]!.entries;
    expect(hyper.find((e) => e.percent === 75)?.kg).toBe(75);
  });
});
