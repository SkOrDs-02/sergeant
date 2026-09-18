import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calcMonthlyNeeded } from "../utils";

function setNow(isoDate: string) {
  const ts = new Date(isoDate).getTime();
  vi.setSystemTime(ts);
}

describe("calcMonthlyNeeded", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns isAchieved when savedAmount >= targetAmount", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(10000, 10000, "2026-12-31");
    expect(r.isAchieved).toBe(true);
    expect(r.monthlyNeeded).toBeNull();
  });

  it("returns isAchieved when savedAmount > targetAmount", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(5000, 6000, "2026-12-31");
    expect(r.isAchieved).toBe(true);
  });

  it("returns no monthly when targetDate is absent", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(10000, 0, null);
    expect(r.monthlyNeeded).toBeNull();
    expect(r.monthsLeft).toBeNull();
    expect(r.isAchieved).toBe(false);
    expect(r.isOverdue).toBe(false);
  });

  it("returns isOverdue when targetDate is in the past", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(10000, 0, "2026-03-01");
    expect(r.isOverdue).toBe(true);
    expect(r.monthlyNeeded).toBeNull();
  });

  it("same month target (April → April) → monthsLeft = 1", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(3000, 0, "2026-04-30");
    expect(r.isOverdue).toBe(false);
    expect(r.monthsLeft).toBe(1);
    expect(r.monthlyNeeded).toBe(3000);
  });

  it("target is exactly 2 calendar months ahead (no partial)", () => {
    // now = April 16, target = June 16 → exactly 2 months
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(6000, 0, "2026-06-16");
    expect(r.monthsLeft).toBe(2);
    expect(r.monthlyNeeded).toBe(3000);
  });

  it("target is 2 months + extra days → monthsLeft ceils to 3", () => {
    // now = April 16, target = June 30 → > June 16, so ceil to 3
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(9000, 0, "2026-06-30");
    expect(r.monthsLeft).toBe(3);
    expect(r.monthlyNeeded).toBe(3000);
  });

  it("February edge: now=Jan 31, target=Feb 28 → monthsLeft 1", () => {
    setNow("2026-01-31");
    const r = calcMonthlyNeeded(1200, 0, "2026-02-28");
    expect(r.monthsLeft).toBe(1);
    expect(r.monthlyNeeded).toBe(1200);
  });

  it("cross-year: now=Nov 1 2025, target=Jan 31 2026 → 3 months", () => {
    setNow("2025-11-01");
    const r = calcMonthlyNeeded(9000, 0, "2026-01-31");
    expect(r.monthsLeft).toBe(3);
    expect(r.monthlyNeeded).toBe(3000);
  });

  it("saved partially reduces monthly needed", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(12000, 3000, "2026-07-16");
    expect(r.monthsLeft).toBe(3);
    expect(r.monthlyNeeded).toBe(3000);
  });

  it("monthlyNeeded is ceiled (not floored)", () => {
    // remaining=10, monthsLeft=3 → ceil(10/3)=4
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(10, 0, "2026-07-16");
    expect(r.monthlyNeeded).toBe(4);
  });

  it("accepts a non-YYYY-MM-DD targetDate string (full ISO timestamp)", () => {
    // Exercises the fallback `new Date(targetDate)` branch instead of the
    // fast-path YYYY-MM-DD regex parse.
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(6000, 0, "2026-06-16T10:30:00Z");
    expect(r.monthsLeft).toBe(2);
    expect(r.monthlyNeeded).toBe(3000);
  });

  it("accepts a Date instance as targetDate", () => {
    setNow("2026-04-16");
    const r = calcMonthlyNeeded(3000, 0, new Date(Date.UTC(2026, 5, 16)));
    expect(r.isOverdue).toBe(false);
    expect(r.monthsLeft).toBe(2);
  });

  it("target date is today → still has at least 1 month window", () => {
    // Same-day target: not overdue (today > now is false if time is midnight),
    // but depending on parse, may be overdue. Min monthsLeft = 1 guards UX.
    setNow("2026-04-16T00:00:00.000Z");
    const r = calcMonthlyNeeded(1200, 0, "2026-04-16");
    // Either "overdue" (target <= now at midnight UTC) or monthsLeft=1
    // Either way, monthlyNeeded should not be negative/zero for unsaved goal
    if (!r.isOverdue) {
      expect(r.monthsLeft).toBeGreaterThanOrEqual(1);
      expect(r.monthlyNeeded).toBeGreaterThan(0);
    } else {
      expect(r.monthlyNeeded).toBeNull();
    }
  });
});
