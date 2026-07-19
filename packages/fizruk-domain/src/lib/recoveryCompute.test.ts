import { describe, it, expect } from "vitest";
import {
  loadPointsForItem,
  computeWellbeingMultiplier,
  computeRecoveryBy,
  isFullyRecovered,
} from "./recoveryCompute";

describe("fizruk/recoveryCompute", () => {
  it("loadPointsForItem supports strength/time/distance", () => {
    expect(
      loadPointsForItem({
        type: "strength",
        sets: [{ weightKg: 100, reps: 10 }],
      }),
    ).toBeGreaterThan(0);
    expect(loadPointsForItem({ type: "time", durationSec: 240 })).toBeCloseTo(
      1,
    );
    expect(
      loadPointsForItem({
        type: "distance",
        distanceM: 5000,
        durationSec: 1800,
      }),
    ).toBeCloseTo(5 + 1);
  });

  it("computeWellbeingMultiplier clamps range", () => {
    const bad = computeWellbeingMultiplier([
      { at: "2026-01-01", sleepHours: 4, energyLevel: 1 },
    ]);
    expect(bad).toBeLessThanOrEqual(1.4);
    expect(bad).toBeGreaterThanOrEqual(0.7);
  });

  it("computeRecoveryBy marks recent muscle as red", () => {
    const nowMs = Date.parse("2026-01-10T12:00:00Z");
    const workouts = [
      {
        startedAt: "2026-01-10T10:00:00Z",
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.status).toBe("red");
    expect(isFullyRecovered(by["chest"])).toBe(false);
  });

  it("daysSince counts Kyiv calendar days, not elapsed 24h windows", () => {
    // Workout 23:30 Kyiv on the 14th; evaluated 09:00 Kyiv on the 15th.
    // Only 9.5h elapsed, but it must read as "1 день тому".
    const nowMs = Date.UTC(2026, 0, 15, 7, 0); // Kyiv 09:00
    const workouts = [
      {
        startedAt: new Date(Date.UTC(2026, 0, 14, 21, 30)).toISOString(),
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.daysSince).toBe(1);
  });

  it("daysSince is 0 within the same Kyiv day", () => {
    const nowMs = Date.UTC(2026, 0, 15, 20, 0); // Kyiv 22:00
    const workouts = [
      {
        startedAt: new Date(Date.UTC(2026, 0, 15, 5, 0)).toISOString(), // Kyiv 07:00
        items: [
          {
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
            musclesPrimary: ["chest"],
          },
        ],
      },
    ];
    const by = computeRecoveryBy(
      workouts as never,
      { chest: "Груди" },
      nowMs,
      [],
    );
    expect(by["chest"]!.daysSince).toBe(0);
  });

  it("loadPointsForItem handles empty and degenerate sets", () => {
    expect(loadPointsForItem(null)).toBe(0);
    expect(loadPointsForItem(undefined)).toBe(0);
    expect(loadPointsForItem({ type: "strength" })).toBe(0);
    expect(loadPointsForItem({ type: "strength", sets: [] })).toBe(0);
    // Zero-load set contributes no tonnage and is not counted as a set.
    expect(
      loadPointsForItem({ type: "strength", sets: [{ weightKg: 0, reps: 0 }] }),
    ).toBe(0);
    // Bodyweight set (reps only) still counts as a set.
    expect(
      loadPointsForItem({
        type: "strength",
        sets: [{ weightKg: 0, reps: 12 }],
      }),
    ).toBeCloseTo(0.15);
    // Non-finite inputs coerce to 0 instead of propagating NaN.
    expect(
      loadPointsForItem({
        type: "strength",
        sets: [{ weightKg: Number.NaN, reps: 10 }],
      }),
    ).toBeCloseTo(0.15);
  });

  it("loadPointsForItem returns 0 for an unrecognized item type", () => {
    expect(loadPointsForItem({ type: "meditation" } as never)).toBe(0);
  });

  describe("computeWellbeingMultiplier", () => {
    it("returns 1.0 when there is no daily log data", () => {
      expect(computeWellbeingMultiplier([])).toBe(1.0);
      expect(computeWellbeingMultiplier()).toBe(1.0);
    });

    it("ignores entries with neither sleep nor energy data", () => {
      expect(computeWellbeingMultiplier([{ at: "2026-01-01" }])).toBe(1.0);
    });

    it("picks the most recent entry with sleep data (sorted desc by `at`)", () => {
      const m = computeWellbeingMultiplier([
        { at: "2026-01-01", sleepHours: 4 }, // older, poor sleep
        { at: "2026-01-05", sleepHours: 9 }, // newest, great sleep
      ]);
      // newest entry (9h, >=8) applies -0.1, no energy data -> 0.9
      expect(m).toBeCloseTo(0.9);
    });

    it.each([
      [4, 1.3], // <5 -> +0.3
      [5, 1.2], // 5..<6 -> +0.2
      [6, 1.1], // 6..<7 -> +0.1
      [7, 1.0], // 7..<8 -> no change
      [8, 0.9], // >=8 -> -0.1
    ])("sleepHours=%s yields multiplier %s", (sleepHours, expected) => {
      expect(
        computeWellbeingMultiplier([{ at: "2026-01-01", sleepHours }]),
      ).toBeCloseTo(expected);
    });

    it.each([
      [1, 1.3], // <=1 -> +0.3
      [2, 1.2], // <=2 -> +0.2
      [2.5, 1.15], // <=2.5 -> +0.15
      [3, 1.0], // between 2.5 and 4 -> no change
      [4, 0.9], // >=4 -> -0.1
      [4.5, 0.85], // >=4.5 -> -0.15
    ])("energyLevel=%s yields multiplier %s", (energyLevel, expected) => {
      expect(
        computeWellbeingMultiplier([{ at: "2026-01-01", energyLevel }]),
      ).toBeCloseTo(expected);
    });

    it("combines sleep and energy penalties, clamped to [0.7, 1.4]", () => {
      const m = computeWellbeingMultiplier([
        { at: "2026-01-01", sleepHours: 3, energyLevel: 1 },
      ]);
      // +0.3 (sleep) + 0.3 (energy) = 1.6, clamped to 1.4
      expect(m).toBe(1.4);
    });
  });
});
