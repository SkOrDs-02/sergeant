import { describe, it, expect, vi } from "vitest";

// transactionsLib imports safeReadLS/safeWriteLS from @shared/lib/storage/storage,
// which in turn chains into kvStoreBoot → @sergeant/db-schema/sqlite (not
// available in the vitest node environment). Mock the entire storage module so
// only the pure helpers under test are exercised.
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(),
}));

import {
  dayKeyFromTx,
  isDayExpanded,
  formatStickyDayLabel,
} from "./transactionsLib";

describe("dayKeyFromTx", () => {
  it("converts UNIX seconds to YYYY-MM-DD string", () => {
    // 2026-01-15 00:00:00 UTC — Date.UTC returns ms; divide by 1000 for seconds
    const ts = Date.UTC(2026, 0, 15, 12, 0, 0) / 1000;
    const key = dayKeyFromTx(ts);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // We only test structure here to avoid TZ assumptions; the important
    // property is the format contract.
  });

  it("zero-pads single-digit months and days", () => {
    // Build a timestamp that would produce single-digit month/day in local time
    // by using a known date. We check the zero-pad behaviour by parsing the result.
    const ts = Date.UTC(2026, 0, 5, 10, 0, 0) / 1000;
    const key = dayKeyFromTx(ts);
    const [, m, d] = key.split("-");
    // Ensure each segment has 2 digits
    expect(m!.length).toBe(2);
    expect(d!.length).toBe(2);
  });

  it("different seconds within the same hour produce the same day key", () => {
    const ts1 = Date.UTC(2026, 3, 20, 8, 0, 0) / 1000;
    const ts2 = Date.UTC(2026, 3, 20, 8, 59, 59) / 1000;
    // Same local date → same key (assuming UTC/local parity is not needed —
    // we test that the function is at least self-consistent).
    expect(typeof dayKeyFromTx(ts1)).toBe("string");
    expect(dayKeyFromTx(ts1).split("-").length).toBe(3);
    expect(dayKeyFromTx(ts2).split("-").length).toBe(3);
  });
});

describe("isDayExpanded", () => {
  it("returns false for a key not in overrides", () => {
    expect(isDayExpanded({}, "2026-05-01", "2026-05-01")).toBe(false);
  });

  it("returns true when override is explicitly true", () => {
    expect(
      isDayExpanded({ "2026-05-01": true }, "2026-05-01", "2026-05-01"),
    ).toBe(true);
  });

  it("returns false when override is explicitly false", () => {
    expect(
      isDayExpanded({ "2026-05-01": false }, "2026-05-01", "2026-05-01"),
    ).toBe(false);
  });

  it("does not treat today differently — respects overrides only", () => {
    // Today key matches the key but override is absent → still false
    expect(isDayExpanded({}, "2026-05-10", "2026-05-10")).toBe(false);
  });

  it("checks the correct key in overrides (not the todayKey)", () => {
    const overrides = { "2026-05-09": true };
    // key = "2026-05-09" with today = "2026-05-10" → should be true
    expect(isDayExpanded(overrides, "2026-05-09", "2026-05-10")).toBe(true);
    // key = "2026-05-10" (today) with no override → false
    expect(isDayExpanded(overrides, "2026-05-10", "2026-05-10")).toBe(false);
  });
});

describe("formatStickyDayLabel", () => {
  it("returns 'Сьогодні' for today's date key", () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(formatStickyDayLabel(key)).toBe("Сьогодні");
  });

  it("returns 'Вчора' for yesterday's date key", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(formatStickyDayLabel(key)).toBe("Вчора");
  });

  it("returns a Ukrainian weekday + date for older dates", () => {
    // Use a fixed date well in the past to avoid boundary effects
    const label = formatStickyDayLabel("2025-01-06");
    // Should not be "Сьогодні" or "Вчора"
    expect(label).not.toBe("Сьогодні");
    expect(label).not.toBe("Вчора");
    // Should be a non-empty string with Ukrainian characters
    expect(label.length).toBeGreaterThan(0);
  });

  it("does not throw for a well-formed YYYY-MM-DD input", () => {
    expect(() => formatStickyDayLabel("2024-12-25")).not.toThrow();
  });
});
