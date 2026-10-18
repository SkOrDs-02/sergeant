import { describe, expect, it } from "vitest";
import {
  adjustRestTimerState,
  restRemainingSeconds,
  startRestTimerState,
} from "./restTimer";

const NOW = 1_800_000_000_000;

describe("restTimer", () => {
  it("restRemainingSeconds rounds up and never goes below 0", () => {
    expect(restRemainingSeconds(NOW + 1, NOW)).toBe(1);
    expect(restRemainingSeconds(NOW + 1000, NOW)).toBe(1);
    expect(restRemainingSeconds(NOW + 1001, NOW)).toBe(2);
    expect(restRemainingSeconds(NOW, NOW)).toBe(0);
    expect(restRemainingSeconds(NOW - 5000, NOW)).toBe(0);
  });

  it("startRestTimerState anchors endsAt to the start moment", () => {
    expect(startRestTimerState(90, NOW)).toEqual({
      remaining: 90,
      total: 90,
      endsAt: NOW + 90_000,
    });
  });

  it("adjustRestTimerState shifts endsAt together with remaining", () => {
    const t = startRestTimerState(60, NOW);
    expect(adjustRestTimerState(t, 15, NOW)).toEqual({
      remaining: 75,
      total: 75,
      endsAt: NOW + 75_000,
    });
    // total не меншає при відніманні.
    expect(adjustRestTimerState(t, -15, NOW)).toEqual({
      remaining: 45,
      total: 60,
      endsAt: NOW + 45_000,
    });
  });

  it("adjustRestTimerState floors at 1 s from now", () => {
    const t = startRestTimerState(5, NOW);
    expect(adjustRestTimerState(t, -15, NOW)).toEqual({
      remaining: 1,
      total: 5,
      endsAt: NOW + 1000,
    });
  });
});
