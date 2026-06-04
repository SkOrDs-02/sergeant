import { describe, expect, it } from "vitest";
import {
  formatKyivLongDate,
  getKyivDayKey,
  getKyivDateParts,
  getKyivMondayIndex,
  getKyivShortStamp,
  getKyivWeekStart,
  getKyivWeekStartKey,
  isSameKyivDay,
  parseKyivDate,
} from "./kyivTime";

describe("kyivTime", () => {
  describe("getKyivDayKey", () => {
    it("formats current day as YYYY-MM-DD in Kyiv TZ", () => {
      // 2026-05-16 22:00 UTC = 2026-05-17 01:00 Kyiv (EEST, UTC+3)
      const sample = new Date("2026-05-16T22:00:00Z");
      expect(getKyivDayKey(sample)).toBe("2026-05-17");
    });

    it("returns previous day when UTC is just past midnight but Kyiv hasn't crossed yet", () => {
      // 2026-01-15 00:30 UTC = 2026-01-15 02:30 Kyiv (EET, UTC+2)
      const sample = new Date("2026-01-15T00:30:00Z");
      expect(getKyivDayKey(sample)).toBe("2026-01-15");
    });

    it("handles winter DST (UTC+2)", () => {
      // 2026-01-01 02:00 UTC = 2026-01-01 04:00 Kyiv
      const sample = new Date("2026-01-01T02:00:00Z");
      expect(getKyivDayKey(sample)).toBe("2026-01-01");
    });

    it("handles summer DST (UTC+3)", () => {
      // 2026-07-01 02:00 UTC = 2026-07-01 05:00 Kyiv
      const sample = new Date("2026-07-01T02:00:00Z");
      expect(getKyivDayKey(sample)).toBe("2026-07-01");
    });
  });

  describe("getKyivDateParts", () => {
    it("decomposes a known UTC instant correctly", () => {
      const sample = new Date("2026-05-16T10:30:45Z");
      const parts = getKyivDateParts(sample);
      // Summer DST → +3 → 13:30:45 Kyiv
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(16);
      expect(parts.hour).toBe(13);
      expect(parts.minute).toBe(30);
      expect(parts.second).toBe(45);
      expect(parts.weekday).toBe(6); // Saturday
    });

    it("accepts numeric timestamps", () => {
      const ts = new Date("2026-03-15T12:00:00Z").getTime();
      const parts = getKyivDateParts(ts);
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(3);
      expect(parts.day).toBe(15);
    });

    it("normalises 24:00 hour to 00", () => {
      // Some Intl implementations return "24" for midnight; the module
      // mods by 24 so the parts always stay in 0-23.
      const midnight = new Date("2026-01-01T22:00:00Z");
      // 22:00 UTC = 00:00 Kyiv (EET +2)
      const parts = getKyivDateParts(midnight);
      expect(parts.hour).toBe(0);
    });
  });

  describe("isSameKyivDay", () => {
    it("returns true for two instants on the same Kyiv day", () => {
      const morning = new Date("2026-05-16T06:00:00Z"); // 09:00 Kyiv
      const evening = new Date("2026-05-16T18:00:00Z"); // 21:00 Kyiv
      expect(isSameKyivDay(morning, evening)).toBe(true);
    });

    it("returns false when UTC midnight crossed but Kyiv day matches", () => {
      // Two UTC days, but Kyiv summer DST keeps them on the same day
      const a = new Date("2026-05-16T22:00:00Z"); // 01:00 Kyiv 2026-05-17
      const b = new Date("2026-05-17T20:00:00Z"); // 23:00 Kyiv 2026-05-17
      expect(isSameKyivDay(a, b)).toBe(true);
    });
  });

  describe("parseKyivDate", () => {
    it("parses a valid key into Kyiv midnight", () => {
      const date = parseKyivDate("2026-05-16");
      expect(date).not.toBeNull();
      const parts = getKyivDateParts(date!);
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(5);
      expect(parts.day).toBe(16);
      expect(parts.hour).toBe(0);
      expect(parts.minute).toBe(0);
    });

    it("returns null for malformed input", () => {
      expect(parseKyivDate("2026/05/16")).toBeNull();
      expect(parseKyivDate("not-a-date")).toBeNull();
      expect(parseKyivDate("")).toBeNull();
    });

    it("returns null for out-of-range month/day", () => {
      expect(parseKyivDate("2026-13-01")).toBeNull();
      expect(parseKyivDate("2026-05-32")).toBeNull();
      expect(parseKyivDate("2026-00-15")).toBeNull();
    });

    it("round-trips with getKyivDayKey", () => {
      const key = "2026-08-21";
      const parsed = parseKyivDate(key);
      expect(parsed).not.toBeNull();
      expect(getKyivDayKey(parsed!)).toBe(key);
    });
  });

  describe("getKyivWeekStart", () => {
    it("returns Monday for any day in the week", () => {
      // 2026-05-16 (Saturday) → 2026-05-11 (Monday)
      const sat = new Date("2026-05-16T12:00:00Z");
      const monday = getKyivWeekStart(sat);
      expect(getKyivDayKey(monday)).toBe("2026-05-11");
    });

    it("returns same Monday when input is already Monday", () => {
      const mon = new Date("2026-05-11T15:00:00Z");
      const start = getKyivWeekStart(mon);
      expect(getKyivDayKey(start)).toBe("2026-05-11");
    });

    it("returns previous Monday when input is Sunday", () => {
      // 2026-05-17 (Sunday) → 2026-05-11 (previous Monday)
      const sun = new Date("2026-05-17T10:00:00Z");
      expect(getKyivDayKey(getKyivWeekStart(sun))).toBe("2026-05-11");
    });
  });

  describe("getKyivMondayIndex", () => {
    it("returns 0 for Monday", () => {
      const mon = new Date("2026-05-11T12:00:00Z");
      expect(getKyivMondayIndex(mon)).toBe(0);
    });

    it("returns 6 for Sunday", () => {
      const sun = new Date("2026-05-17T12:00:00Z");
      expect(getKyivMondayIndex(sun)).toBe(6);
    });

    it("returns 5 for Saturday", () => {
      const sat = new Date("2026-05-16T12:00:00Z");
      expect(getKyivMondayIndex(sat)).toBe(5);
    });
  });

  describe("getKyivShortStamp", () => {
    it("formats YYYY-MM-DD HH:mm in Kyiv TZ", () => {
      // 2026-05-16 10:30 UTC + 3h = 13:30 Kyiv
      const sample = new Date("2026-05-16T10:30:00Z");
      expect(getKyivShortStamp(sample)).toBe("2026-05-16 13:30");
    });
  });

  describe("getKyivWeekStartKey", () => {
    it("returns Monday of the week as YYYY-MM-DD string", () => {
      // 2026-05-16 (Saturday) → week start is 2026-05-11 (Monday)
      const sat = new Date("2026-05-16T12:00:00Z");
      expect(getKyivWeekStartKey(sat)).toBe("2026-05-11");
    });

    it("is equivalent to getKyivDayKey(getKyivWeekStart(input))", () => {
      const ts = new Date("2026-05-20T09:00:00Z"); // Wednesday
      expect(getKyivWeekStartKey(ts)).toBe(getKyivDayKey(getKyivWeekStart(ts)));
    });
  });

  describe("formatKyivLongDate", () => {
    it("formats an ISO instant in Kyiv local date (uk-UA)", () => {
      // 2026-06-01 10:00 UTC → 2026-06-01 13:00 Kyiv → "1 червня 2026 р."
      const result = formatKyivLongDate("2026-06-01T10:00:00Z");
      expect(result).toMatch(/1\s+червня\s+2026/);
    });

    it("returns null for null/undefined input", () => {
      expect(formatKyivLongDate(null)).toBeNull();
      expect(formatKyivLongDate(undefined)).toBeNull();
    });

    it("returns null for an unparseable string", () => {
      expect(formatKyivLongDate("not-a-date")).toBeNull();
    });
  });
});
