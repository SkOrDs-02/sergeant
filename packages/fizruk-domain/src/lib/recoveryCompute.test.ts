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
});
