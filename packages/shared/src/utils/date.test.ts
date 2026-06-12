import { describe, it, expect } from "vitest";
import {
  kyivCalendarDaysBetween,
  kyivDayEndMs,
  kyivDayStartMs,
  toLocalISODate,
} from "./date";

describe("shared/lib/date – toLocalISODate", () => {
  it("formats a Date object with zero-padded month and day", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalISODate(new Date(2026, 8, 9))).toBe("2026-09-09");
    expect(toLocalISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("formats a numeric timestamp (milliseconds)", () => {
    const ms = new Date(2026, 3, 19).getTime();
    expect(toLocalISODate(ms)).toBe("2026-04-19");
  });

  it("formats an ISO date string (local timezone interpretation)", () => {
    // Construct from known local Date to avoid timezone divergence
    const d = new Date(2025, 6, 4); // 4 Jul 2025 local
    const iso = toLocalISODate(d.toISOString());
    // Result depends on UTC offset but must be a valid ISO date
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns 1970-01-01 for an invalid date string", () => {
    expect(toLocalISODate("not-a-date")).toBe("1970-01-01");
    expect(toLocalISODate("")).toBe("1970-01-01");
  });

  it("returns 1970-01-01 for NaN timestamp", () => {
    expect(toLocalISODate(NaN)).toBe("1970-01-01");
  });

  it("uses current date when called with no argument", () => {
    const before = toLocalISODate(new Date());
    const result = toLocalISODate();
    const after = toLocalISODate(new Date());
    // result must be within the same day as before/after
    expect(result >= before && result <= after).toBe(true);
  });

  it("handles year boundaries correctly", () => {
    expect(toLocalISODate(new Date(2024, 11, 31))).toBe("2024-12-31");
    expect(toLocalISODate(new Date(2025, 0, 1))).toBe("2025-01-01");
  });
});

describe("shared/lib/date – kyivDayStartMs", () => {
  it("uses UTC+2 in winter", () => {
    expect(kyivDayStartMs("2026-01-15")).toBe(Date.UTC(2026, 0, 14, 22));
  });

  it("uses UTC+3 in summer", () => {
    expect(kyivDayStartMs("2026-07-15")).toBe(Date.UTC(2026, 6, 14, 21));
  });

  it("keeps the pre-transition offset on the spring-forward day", () => {
    // 2026-03-29 03:00 Kyiv jumps to 04:00; midnight is still UTC+2.
    expect(kyivDayStartMs("2026-03-29")).toBe(Date.UTC(2026, 2, 28, 22));
    expect(kyivDayStartMs("2026-03-30")).toBe(Date.UTC(2026, 2, 29, 21));
  });

  it("round-trips through toLocalISODate", () => {
    for (const key of [
      "2026-01-01",
      "2026-03-29",
      "2026-10-25",
      "2026-12-31",
    ]) {
      expect(toLocalISODate(kyivDayStartMs(key))).toBe(key);
    }
  });
});

describe("shared/lib/date – kyivDayEndMs", () => {
  it("is one ms before the next day's start, incl. 23h/25h DST days", () => {
    for (const [key, next] of [
      ["2026-01-15", "2026-01-16"],
      ["2026-03-29", "2026-03-30"], // 23-hour day
      ["2026-10-25", "2026-10-26"], // 25-hour day
    ] as const) {
      expect(kyivDayEndMs(key)).toBe(kyivDayStartMs(next) - 1);
      expect(toLocalISODate(kyivDayEndMs(key))).toBe(key);
    }
  });
});

describe("shared/lib/date – kyivCalendarDaysBetween", () => {
  it("counts Kyiv midnights crossed, not 24-hour windows", () => {
    // 23:30 Kyiv on the 14th vs 09:00 Kyiv on the 15th — 9.5h elapsed,
    // but a calendar day apart.
    const b = Date.UTC(2026, 0, 14, 21, 30); // Kyiv 23:30 (UTC+2)
    const a = Date.UTC(2026, 0, 15, 7, 0); // Kyiv 09:00
    expect(kyivCalendarDaysBetween(a, b)).toBe(1);
  });

  it("returns 0 within the same Kyiv day", () => {
    const b = Date.UTC(2026, 0, 15, 0, 0); // Kyiv 02:00
    const a = Date.UTC(2026, 0, 15, 20, 0); // Kyiv 22:00
    expect(kyivCalendarDaysBetween(a, b)).toBe(0);
  });

  it("is signed", () => {
    const b = Date.UTC(2026, 0, 15, 7, 0);
    const a = Date.UTC(2026, 0, 14, 21, 30);
    expect(kyivCalendarDaysBetween(a, b)).toBe(-1);
  });

  it("stays exact across a DST transition", () => {
    // Spring-forward week: 7 calendar days apart even though only
    // 167 hours elapse.
    const b = kyivDayStartMs("2026-03-27") + 12 * 3600_000;
    const a = kyivDayStartMs("2026-04-03") + 12 * 3600_000;
    expect(kyivCalendarDaysBetween(a, b)).toBe(7);
  });
});
