import { describe, expect, it } from "vitest";
import { calculateFinykDayPlan } from "./dayPlan";

describe("canonical Finyk day plan", () => {
  const input = {
    planExpenseMinor: 1_000_000,
    spentBeforeTodayMinor: 200_000,
    recurringOutMinor: 300_000,
    recurringInMinor: 100_000,
    remainingDays: 10,
  };
  it("reserves regular outflows and includes planned inflows", () => {
    expect(calculateFinykDayPlan(input)).toBe(60_000);
  });
  it("retains deficits and fractional daily amounts", () => {
    expect(
      calculateFinykDayPlan({
        ...input,
        planExpenseMinor: 100_000,
        remainingDays: 3,
      }),
    ).toBe(-100_000);
    expect(
      calculateFinykDayPlan({
        ...input,
        recurringOutMinor: 0,
        recurringInMinor: 0,
        remainingDays: 3,
      }),
    ).toBeCloseTo(800_000 / 3);
  });
  it("does not invent a plan when none was set", () => {
    expect(calculateFinykDayPlan({ ...input, planExpenseMinor: 0 })).toBeNull();
  });
});
