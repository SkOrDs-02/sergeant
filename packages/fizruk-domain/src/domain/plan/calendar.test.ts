import { describe, expect, it } from "vitest";

import {
  dateKeyFromDate,
  dateKeyFromYMD,
  monthCursorFromDate,
  monthGrid,
  parseDateKey,
  shiftMonthCursor,
  todayDateKey,
} from "./calendar.js";

describe("dateKeyFromYMD", () => {
  it("zero-pads month and day", () => {
    expect(dateKeyFromYMD(2025, 0, 1)).toBe("2025-01-01");
    expect(dateKeyFromYMD(2025, 10, 9)).toBe("2025-11-09");
  });
});

describe("dateKeyFromDate", () => {
  it("uses local date components (no UTC shift)", () => {
    expect(dateKeyFromDate(new Date(2025, 2, 15, 23, 30))).toBe("2025-03-15");
  });
});

describe("todayDateKey", () => {
  it("returns a YYYY-MM-DD string for the provided now", () => {
    expect(todayDateKey(new Date(2025, 11, 31))).toBe("2025-12-31");
  });
});

describe("parseDateKey", () => {
  it("round-trips YYYY-MM-DD to a local Date noon-anchored", () => {
    const d = parseDateKey("2025-06-15");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(12);
  });

  it("falls back to 1970-01-01 for a fully non-numeric key", () => {
    const d = parseDateKey("abc-def-ghi");
    expect(d.getFullYear()).toBe(1970);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("falls back per-component when the key has missing parts", () => {
    // Only the year is present -> month/day parts are undefined.
    const d = parseDateKey("2030");
    expect(d.getFullYear()).toBe(2030);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("falls back only for the malformed component (mixed valid/invalid)", () => {
    const d = parseDateKey("2030-xx-15");
    expect(d.getFullYear()).toBe(2030);
    expect(d.getMonth()).toBe(0); // invalid month -> fallback 1 -> index 0
    expect(d.getDate()).toBe(15);
  });
});

describe("monthCursorFromDate", () => {
  it("extracts year + 0-indexed month", () => {
    expect(monthCursorFromDate(new Date(2025, 4, 20))).toEqual({
      y: 2025,
      m: 4,
    });
  });
});

describe("shiftMonthCursor", () => {
  it("shifts forward across a year boundary", () => {
    expect(shiftMonthCursor({ y: 2025, m: 11 }, 1)).toEqual({ y: 2026, m: 0 });
  });
  it("shifts backward across a year boundary", () => {
    expect(shiftMonthCursor({ y: 2025, m: 0 }, -1)).toEqual({ y: 2024, m: 11 });
  });
  it("handles large positive and negative deltas", () => {
    expect(shiftMonthCursor({ y: 2025, m: 3 }, 25)).toEqual({ y: 2027, m: 4 });
    expect(shiftMonthCursor({ y: 2025, m: 3 }, -25)).toEqual({ y: 2023, m: 2 });
  });
  it("is a no-op for delta 0", () => {
    expect(shiftMonthCursor({ y: 2025, m: 6 }, 0)).toEqual({ y: 2025, m: 6 });
  });
});

describe("monthGrid", () => {
  it("pads leading nulls so day 1 aligns with its weekday column (Monday-first)", () => {
    // 2025-03-01 is a Saturday → weekday index 5 in Monday-first ordering.
    const { cells } = monthGrid(2025, 2);
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(cells[5]).toBe(1);
  });

  it("contains each calendar day exactly once", () => {
    const { cells } = monthGrid(2025, 1); // Feb 2025 (28 days)
    const days = cells.filter((c) => c !== null);
    expect(days).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it("length is always a multiple of 7", () => {
    for (let m = 0; m < 12; m++) {
      const { cells } = monthGrid(2025, m);
      expect(cells.length % 7).toBe(0);
    }
  });

  it("handles a month that begins on Monday with no leading padding", () => {
    // 2024-04-01 is Monday.
    const { cells } = monthGrid(2024, 3);
    expect(cells[0]).toBe(1);
  });
});
