import { describe, expect, it } from "vitest";
import {
  clampGoalDelta,
  measuredTdee,
  measuredTdeeFromBalance,
  weightTrendEma,
  type IntakeDay,
  type WeightPoint,
} from "./adaptiveTdee.js";

const intake = (count: number, kcal = 2000): IntakeDay[] =>
  Array.from({ length: count }, (_, index) => ({
    dateKey: `2026-05-${String(index + 1).padStart(2, "0")}`,
    kcal,
    complete: true,
  }));

const weights = (values: number[]): WeightPoint[] =>
  values.map((weightKg, index) => ({
    dateKey: `2026-05-${String(1 + index * 4).padStart(2, "0")}`,
    weightKg,
  }));

describe("measuredTdee", () => {
  it("matches the 14-day energy-balance golden case", () => {
    expect(measuredTdeeFromBalance(2000, -0.5, 14)).toBe(2275);
  });

  it("uses the correct energy-balance sign for weight loss", () => {
    const result = measuredTdee(intake(14), [
      { dateKey: "2026-05-01", weightKg: 80 },
      { dateKey: "2026-05-05", weightKg: 79.8 },
      { dateKey: "2026-05-10", weightKg: 79.6 },
      { dateKey: "2026-05-15", weightKg: 79.5 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.tdeeKcal).toBeGreaterThan(result!.averageIntakeKcal);
  });

  it("does not update with only nine complete days", () => {
    expect(measuredTdee(intake(9), weights([80, 79.9, 79.8, 79.7]))).toBeNull();
  });

  it("does not update with fewer than four weigh-ins", () => {
    expect(measuredTdee(intake(14), weights([80, 79.9, 79.8]))).toBeNull();
  });
});

describe("weightTrendEma", () => {
  it("dampens a one-day 1.5 kg water jump", () => {
    const stable = weightTrendEma([
      { dateKey: "2026-05-01", weightKg: 80 },
      { dateKey: "2026-05-07", weightKg: 80 },
      { dateKey: "2026-05-08", weightKg: 81.5 },
      { dateKey: "2026-05-14", weightKg: 80 },
    ]);
    expect(Math.abs(stable!.deltaKg)).toBeLessThan(0.3);
  });
});

describe("clampGoalDelta", () => {
  it("limits one update to ten percent", () => {
    expect(clampGoalDelta(3000, 2000, 1500)).toBe(2200);
    expect(clampGoalDelta(1000, 2000, 1500)).toBe(1800);
  });

  it("never goes below BMR", () => {
    expect(clampGoalDelta(1000, 1600, 1550)).toBe(1550);
  });
});
