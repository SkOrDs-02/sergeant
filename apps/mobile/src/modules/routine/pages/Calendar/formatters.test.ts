/**
 * Sergeant Routine — Calendar formatters unit tests.
 *
 * Pure-function module — no React, no MMKV. Added together with the
 * `Calendar.tsx` decomposition (audit `P2.2b`) so the UA-locale
 * formatting logic stops being implicit inside the page component.
 */

import { formatDayHeadline, formatMonthTitle } from "./formatters";

describe("formatMonthTitle", () => {
  it("renders the UA month name with year for a normal cursor", () => {
    expect(formatMonthTitle({ y: 2026, m: 4 })).toBe("Травень 2026");
  });

  it("uses January for the zero-indexed first month and December for index 11", () => {
    // Edge case — the array boundaries are easy to off-by-one when
    // refactoring, so both extremes are pinned here.
    expect(formatMonthTitle({ y: 2026, m: 0 })).toBe("Січень 2026");
    expect(formatMonthTitle({ y: 2026, m: 11 })).toBe("Грудень 2026");
  });
});

describe("formatDayHeadline", () => {
  it("returns a UA weekday-day-month string for a valid date key", () => {
    // 2026-05-13 fell on a Wednesday — the headline should
    // include the weekday + day + month words in lower case (the
    // capitalisation is applied at the JSX layer via `capitalize`).
    const out = formatDayHeadline("2026-05-13");
    expect(out).toMatch(/середа/);
    expect(out).toMatch(/13/);
    expect(out).toMatch(/травня/);
  });

  it("falls back to the raw key when the input is unparseable", () => {
    // Edge case — `parseDateKey` throws on malformed input. The UI
    // must never render a blank string, so we expect the key back.
    expect(formatDayHeadline("not-a-date")).toBe("not-a-date");
  });
});
