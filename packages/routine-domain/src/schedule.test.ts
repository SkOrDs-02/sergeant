import { describe, expect, it } from "vitest";

import { habitScheduledOnDate } from "./schedule.js";
import type { Habit } from "./types.js";

function habit(partial: Partial<Habit>): Habit {
  return {
    id: "h",
    name: "Test habit",
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    ...partial,
  };
}

describe("routine-domain/schedule", () => {
  it("respects archived flag", () => {
    const h = habit({ archived: true });
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(false);
  });

  it("respects paused flag", () => {
    expect(habitScheduledOnDate(habit({ paused: true }), "2026-01-05")).toBe(
      false,
    );
    expect(
      habitScheduledOnDate(
        habit({ recurrence: "weekly", weekdays: [0, 2, 4], paused: true }),
        "2026-01-05",
      ),
    ).toBe(false);
    expect(
      habitScheduledOnDate(
        habit({ recurrence: "monthly", paused: true }),
        "2026-01-01",
      ),
    ).toBe(false);
    expect(
      habitScheduledOnDate(
        habit({ recurrence: "once", paused: true }),
        "2026-01-01",
      ),
    ).toBe(false);
  });

  it("respects startDate / endDate bounds", () => {
    const h = habit({ startDate: "2026-01-05", endDate: "2026-01-10" });
    expect(habitScheduledOnDate(h, "2026-01-04")).toBe(false);
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-10")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-11")).toBe(false);
  });

  it("daily matches every in-bounds day", () => {
    const h = habit({ recurrence: "daily" });
    expect(habitScheduledOnDate(h, "2026-01-01")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-06-15")).toBe(true);
  });

  it("weekdays matches Mon–Fri only", () => {
    const h = habit({ recurrence: "weekdays" });
    // 2026-01-05 is Monday, 2026-01-10 Saturday, 2026-01-11 Sunday
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-09")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-10")).toBe(false);
    expect(habitScheduledOnDate(h, "2026-01-11")).toBe(false);
  });

  it("weekly uses weekdays array (Mon-first 0–6)", () => {
    const h = habit({ recurrence: "weekly", weekdays: [0, 2, 4] });
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(true); // Mon
    expect(habitScheduledOnDate(h, "2026-01-06")).toBe(false); // Tue
    expect(habitScheduledOnDate(h, "2026-01-07")).toBe(true); // Wed
    expect(habitScheduledOnDate(h, "2026-01-09")).toBe(true); // Fri
  });

  it("weekly with empty weekdays falls back to every day", () => {
    const h = habit({ recurrence: "weekly", weekdays: [] });
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-11")).toBe(true);
  });

  it("once matches only the start date", () => {
    const h = habit({ recurrence: "once", startDate: "2026-01-05" });
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-06")).toBe(false);
  });

  it("monthly anchors to start-date DOM, clamped to month length", () => {
    const h = habit({ recurrence: "monthly", startDate: "2026-01-31" });
    // Jan 31 → match. Feb → last day (Feb 28 in 2026).
    expect(habitScheduledOnDate(h, "2026-01-31")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-02-28")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-02-27")).toBe(false);
    expect(habitScheduledOnDate(h, "2026-03-31")).toBe(true);
  });

  it("falls back to scheduled for unknown recurrence values", () => {
    expect(
      habitScheduledOnDate(
        habit({ recurrence: "custom-experimental" }),
        "2026-01-05",
      ),
    ).toBe(true);
  });
});
