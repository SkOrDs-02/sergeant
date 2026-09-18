/**
 * Unit tests for pure routine reminder weekday / trigger helpers.
 *
 * These must cover the full 0=Mon..6=Sun → Expo 1=Sun..7=Sat mapping
 * table plus the edge cases the mobile adapter relies on (NaN, out-of-
 * range weekday, invalid "HH:MM", non-weekly recurrences).
 */

import { describe, expect, it } from "vitest";

import {
  clampHour,
  clampMinute,
  computeTriggerForHabitWeekday,
  habitActiveRoutineWeekdays,
  normalizeRoutineWeekday,
  parseReminderTime,
  routineWeekdayToExpoWeekday,
} from "./weekday.js";

describe("routineWeekdayToExpoWeekday", () => {
  it("maps Monday (0) to Expo 2", () => {
    expect(routineWeekdayToExpoWeekday(0)).toBe(2);
  });

  it("maps Tuesday (1) to Expo 3", () => {
    expect(routineWeekdayToExpoWeekday(1)).toBe(3);
  });

  it("maps Wednesday (2) to Expo 4", () => {
    expect(routineWeekdayToExpoWeekday(2)).toBe(4);
  });

  it("maps Thursday (3) to Expo 5", () => {
    expect(routineWeekdayToExpoWeekday(3)).toBe(5);
  });

  it("maps Friday (4) to Expo 6", () => {
    expect(routineWeekdayToExpoWeekday(4)).toBe(6);
  });

  it("maps Saturday (5) to Expo 7", () => {
    expect(routineWeekdayToExpoWeekday(5)).toBe(7);
  });

  it("maps Sunday (6) to Expo 1 (wrap)", () => {
    expect(routineWeekdayToExpoWeekday(6)).toBe(1);
  });

  it("clamps out-of-range inputs to Monday (Expo 2)", () => {
    expect(routineWeekdayToExpoWeekday(-1)).toBe(2);
    expect(routineWeekdayToExpoWeekday(7)).toBe(2);
    expect(routineWeekdayToExpoWeekday(99)).toBe(2);
  });

  it("clamps NaN / Infinity to Monday (Expo 2)", () => {
    expect(routineWeekdayToExpoWeekday(Number.NaN)).toBe(2);
    expect(routineWeekdayToExpoWeekday(Number.POSITIVE_INFINITY)).toBe(2);
  });

  it("truncates fractional weekdays", () => {
    // 3.9 truncates to 3 (Thu) → Expo 5.
    expect(routineWeekdayToExpoWeekday(3.9)).toBe(5);
  });
});

describe("normalizeRoutineWeekday", () => {
  it("passes valid routine weekdays through unchanged", () => {
    for (let i = 0; i <= 6; i++) {
      expect(normalizeRoutineWeekday(i)).toBe(i);
    }
  });

  it("clamps negative / out-of-range to 0 (Mon)", () => {
    expect(normalizeRoutineWeekday(-3)).toBe(0);
    expect(normalizeRoutineWeekday(12)).toBe(0);
  });
});

describe("clampHour / clampMinute", () => {
  it("clampHour keeps 0..23 and defaults out-of-range to 0", () => {
    expect(clampHour(0)).toBe(0);
    expect(clampHour(23)).toBe(23);
    expect(clampHour(24)).toBe(0);
    expect(clampHour(-1)).toBe(0);
    expect(clampHour(Number.NaN)).toBe(0);
  });

  it("clampMinute keeps 0..59 and defaults out-of-range to 0", () => {
    expect(clampMinute(0)).toBe(0);
    expect(clampMinute(59)).toBe(59);
    expect(clampMinute(60)).toBe(0);
    expect(clampMinute(-5)).toBe(0);
    expect(clampMinute(Number.NaN)).toBe(0);
  });
});

describe("parseReminderTime", () => {
  it("parses a valid HH:MM", () => {
    expect(parseReminderTime("08:30")).toEqual({ hour: 8, minute: 30 });
    expect(parseReminderTime("23:59")).toEqual({ hour: 23, minute: 59 });
    expect(parseReminderTime("00:00")).toEqual({ hour: 0, minute: 0 });
  });

  it("falls back to 00:00 for malformed / nullish input", () => {
    expect(parseReminderTime(undefined)).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime(null)).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime("")).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime("8:30")).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime("08:3")).toEqual({ hour: 0, minute: 0 });
    expect(parseReminderTime("noon")).toEqual({ hour: 0, minute: 0 });
  });

  it("clamps parsed-but-out-of-range values", () => {
    // Parser matches /^\d{2}:\d{2}$/, so a shape-valid but logically
    // invalid string ("99:99") still falls through to the clamp path.
    expect(parseReminderTime("99:99")).toEqual({ hour: 0, minute: 0 });
  });
});

describe("computeTriggerForHabitWeekday", () => {
  it("returns the Expo weekly trigger shape", () => {
    expect(computeTriggerForHabitWeekday(0, 8, 30)).toEqual({
      weekday: 2,
      hour: 8,
      minute: 30,
    });
  });

  it("clamps hour/minute and weekday defensively", () => {
    expect(computeTriggerForHabitWeekday(99, 99, 99)).toEqual({
      weekday: 2, // routineWeekday 99 → Mon → Expo 2
      hour: 0,
      minute: 0,
    });
  });

  it("preserves Sunday → Expo 1 mapping", () => {
    expect(computeTriggerForHabitWeekday(6, 20, 0)).toEqual({
      weekday: 1,
      hour: 20,
      minute: 0,
    });
  });
});

describe("habitActiveRoutineWeekdays", () => {
  it("expands 'daily' to all 7 routine weekdays", () => {
    expect(habitActiveRoutineWeekdays({ recurrence: "daily" })).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("expands 'weekdays' to Mon..Fri (0..4)", () => {
    expect(habitActiveRoutineWeekdays({ recurrence: "weekdays" })).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("returns the habit.weekdays set for 'weekly'", () => {
    expect(
      habitActiveRoutineWeekdays({
        recurrence: "weekly",
        weekdays: [2, 4, 6],
      }),
    ).toEqual([2, 4, 6]);
  });

  it("de-dupes / sorts / drops invalid entries for 'weekly'", () => {
    expect(
      habitActiveRoutineWeekdays({
        recurrence: "weekly",
        // @ts-expect-error — exercise the defensive filter for non-number entries.
        weekdays: [5, 5, 2, "1", 9, -1, 0],
      }),
    ).toEqual([0, 2, 5]);
  });

  it("returns [] for monthly / once / unknown", () => {
    expect(habitActiveRoutineWeekdays({ recurrence: "monthly" })).toEqual([]);
    expect(habitActiveRoutineWeekdays({ recurrence: "once" })).toEqual([]);
    expect(
      habitActiveRoutineWeekdays({ recurrence: "some-unknown-value" }),
    ).toEqual([]);
  });

  it("returns [] for an archived habit regardless of recurrence", () => {
    expect(
      habitActiveRoutineWeekdays({ recurrence: "daily", archived: true }),
    ).toEqual([]);
  });

  it("returns [] for a paused habit regardless of recurrence", () => {
    expect(
      habitActiveRoutineWeekdays({ recurrence: "daily", paused: true }),
    ).toEqual([]);
    expect(
      habitActiveRoutineWeekdays({
        recurrence: "weekly",
        weekdays: [0, 2, 4],
        paused: true,
      }),
    ).toEqual([]);
  });

  it("defaults recurrence=undefined to 'daily' (all weekdays)", () => {
    expect(habitActiveRoutineWeekdays({})).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
