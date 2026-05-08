import { describe, expect, it } from "vitest";

import {
  addDays,
  dateKeyFromDate,
  enumerateDateKeys,
  isoWeekdayFromDateKey,
  parseDateKey,
  startOfIsoWeek,
} from "./dateKeys.js";

describe("routine-domain/dateKeys", () => {
  it("dateKeyFromDate pads month/day zeros", () => {
    expect(dateKeyFromDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKeyFromDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("parseDateKey + dateKeyFromDate round-trip", () => {
    const key = "2026-03-14";
    expect(dateKeyFromDate(parseDateKey(key))).toBe(key);
  });

  it("enumerateDateKeys lists inclusive range", () => {
    expect(enumerateDateKeys("2026-01-01", "2026-01-03")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("enumerateDateKeys with same start+end returns one key", () => {
    expect(enumerateDateKeys("2026-01-05", "2026-01-05")).toEqual([
      "2026-01-05",
    ]);
  });

  it("addDays shifts by signed N", () => {
    const d = new Date(2026, 0, 10);
    expect(dateKeyFromDate(addDays(d, 1))).toBe("2026-01-11");
    expect(dateKeyFromDate(addDays(d, -3))).toBe("2026-01-07");
  });

  it("startOfIsoWeek snaps to Monday (noon)", () => {
    // 2026-01-07 is Wednesday → startOfIsoWeek → 2026-01-05 (Mon)
    const wed = new Date(2026, 0, 7);
    const mon = startOfIsoWeek(wed);
    expect(dateKeyFromDate(mon)).toBe("2026-01-05");
    expect(mon.getHours()).toBe(12);
  });

  it("isoWeekdayFromDateKey returns Mon=0 … Sun=6", () => {
    expect(isoWeekdayFromDateKey("2026-01-05")).toBe(0); // Mon
    expect(isoWeekdayFromDateKey("2026-01-11")).toBe(6); // Sun
  });

  it("parseDateKey throws on malformed key", () => {
    expect(() => parseDateKey("")).toThrow(/invalid date key/);
    expect(() => parseDateKey("not-a-date")).toThrow(/invalid date key/);
    expect(() => parseDateKey("2026-13-01")).not.toThrow(); // JS Date handles overflow
  });
});
