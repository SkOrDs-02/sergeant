import { describe, it, expect } from "vitest";
import { computeFizrukQuickStats } from "./quickStats.js";

// A completed workout: only `endedAt` matters for both figures.
const done = (id: string, endedAt: string) => ({
  id,
  startedAt: endedAt,
  endedAt,
  items: [],
});

describe("computeFizrukQuickStats", () => {
  it("counts this-week workouts on the Kyiv Monday boundary, not UTC", () => {
    // now: Thu 2026-07-23 12:00 Kyiv. Week starts Mon 2026-07-20 00:00 Kyiv
    // = 2026-07-19T21:00:00Z (Kyiv is UTC+3 in July).
    const now = new Date("2026-07-23T09:00:00Z");
    const { weekWorkouts } = computeFizrukQuickStats(
      [
        done("mon-morning", "2026-07-20T05:00:00Z"), // Kyiv Mon 08:00 → in week
        done("mon-just-after-midnight", "2026-07-19T21:30:00Z"), // Kyiv Mon 00:30 → in week
        done("sun-late", "2026-07-19T20:00:00Z"), // Kyiv Sun 23:00 → prev week
      ],
      now,
    );
    // The 20:00Z tx is still Sunday in Kyiv and excluded; the 21:30Z tx has
    // already crossed into the Kyiv Monday and counts — a UTC-anchored week
    // would get this backwards.
    expect(weekWorkouts).toBe(2);
  });

  it("counts a consecutive-day workout streak ending today", () => {
    const now = new Date("2026-07-23T12:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const { streak } = computeFizrukQuickStats(
      [
        done("today", now.toISOString()),
        done("yesterday", new Date(now.getTime() - day).toISOString()),
        done("two-days-ago", new Date(now.getTime() - 2 * day).toISOString()),
      ],
      now,
    );
    expect(streak).toBe(3);
  });

  it("returns zeroes for an empty stream", () => {
    expect(
      computeFizrukQuickStats([], new Date("2026-07-23T09:00:00Z")),
    ).toEqual({ weekWorkouts: 0, streak: 0 });
  });
});
