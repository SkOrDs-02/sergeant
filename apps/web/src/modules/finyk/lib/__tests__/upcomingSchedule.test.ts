import { describe, it, expect } from "vitest";
import {
  parseLocalDate,
  getNextBillingDate,
  formatRelativeDue,
} from "../upcomingSchedule";

/**
 * Module unit suite — finyk upcoming-schedule date helpers.
 *
 * Audit `2026-05-13-testing-devx-roast.md` §P1-6 ("Web coverage drift"):
 * the finyk UI slices stayed thin. These are the pure date primitives the
 * "Наступний платіж" / liability tiles rely on — billing-cycle rollover,
 * local-date parsing, and the relative-due label — all deterministic with
 * an injected `now` / `todayStart`.
 */

describe("parseLocalDate", () => {
  it("parses a valid ISO date into a local midnight Date", () => {
    const d = parseLocalDate("2026-06-03");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(3);
  });

  it("falls back to today (midnight) for missing or malformed input", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const bad of [null, undefined, "", "not-a-date", "1969-01-01"]) {
      const d = parseLocalDate(bad as string);
      expect(d.getTime()).toBe(today.getTime());
    }
  });
});

describe("getNextBillingDate", () => {
  it("keeps the billing day this month when it is still ahead", () => {
    // 2026-06-03 → next billing on the 20th is later this month.
    const now = new Date("2026-06-03T09:00:00+03:00");
    const d = getNextBillingDate(20, now);
    expect(d.getDate()).toBe(20);
    expect(d.getMonth()).toBe(5); // June
  });

  it("rolls to next month when the billing day has already passed", () => {
    const now = new Date("2026-06-25T09:00:00+03:00");
    const d = getNextBillingDate(10, now);
    expect(d.getDate()).toBe(10);
    expect(d.getMonth()).toBe(6); // July
  });

  it("clamps the billing day to the last day of a short month", () => {
    // Billing on the 31st, but the next cycle lands in a 30-day month.
    const now = new Date("2026-06-29T09:00:00+03:00");
    const d = getNextBillingDate(31, now);
    // June has 30 days; clamps to the 30th rather than spilling into July.
    expect(d.getDate()).toBe(30);
    expect(d.getMonth()).toBe(5);
  });
});

describe("formatRelativeDue", () => {
  const todayStart = new Date(2026, 5, 3, 0, 0, 0, 0);

  it("labels day-start and past due as 'сьогодні'", () => {
    // Diff is measured from `todayStart` (local midnight) via Math.ceil, so a
    // due date at exactly midnight today (diff 0) and any past date are
    // "сьогодні".
    expect(formatRelativeDue(new Date(2026, 5, 3, 0, 0, 0), todayStart)).toBe(
      "сьогодні",
    );
    expect(formatRelativeDue(new Date(2026, 5, 1), todayStart)).toBe(
      "сьогодні",
    );
  });

  it("labels the next day as 'завтра'", () => {
    expect(formatRelativeDue(new Date(2026, 5, 4), todayStart)).toBe("завтра");
  });

  it("labels within a week as 'через N дн'", () => {
    expect(formatRelativeDue(new Date(2026, 5, 8), todayStart)).toBe(
      "через 5 дн",
    );
  });

  it("falls back to a short date beyond a week", () => {
    const label = formatRelativeDue(new Date(2026, 5, 20), todayStart);
    expect(label).not.toMatch(/через|завтра|сьогодні/);
  });
});
