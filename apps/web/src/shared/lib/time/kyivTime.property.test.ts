import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  getDaysInMonth,
  getKyivDayKey,
  getKyivMondayIndex,
  getKyivWeekStart,
  isSameKyivDay,
  parseKyivDate,
} from "./kyivTime";

// Instants from 1970 to ~2100, as UNIX ms. Kept finite and non-exotic so the
// generated Date is always valid; day-boundary correctness (incl. DST) is the
// property under test, not Date's own edge handling.
const instantMs = fc.integer({ min: 0, max: 4_102_444_800_000 });

describe("kyivTime — property invariants", () => {
  it("getKyivDayKey always emits an ISO-8601 calendar shape", () => {
    fc.assert(
      fc.property(instantMs, (ms) => {
        expect(getKyivDayKey(ms)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
    );
  });

  it("parseKyivDate ∘ getKyivDayKey round-trips the day key (DST-safe)", () => {
    fc.assert(
      fc.property(instantMs, (ms) => {
        const key = getKyivDayKey(ms);
        const parsed = parseKyivDate(key);
        expect(parsed).not.toBeNull();
        // The parsed Kyiv-midnight instant must fall on the same Kyiv day.
        expect(getKyivDayKey(parsed as Date)).toBe(key);
      }),
    );
  });

  it("isSameKyivDay is reflexive and symmetric", () => {
    fc.assert(
      fc.property(instantMs, instantMs, (a, b) => {
        expect(isSameKyivDay(a, a)).toBe(true);
        expect(isSameKyivDay(a, b)).toBe(isSameKyivDay(b, a));
      }),
    );
  });

  it("getKyivWeekStart always lands on a Monday (index 0)", () => {
    fc.assert(
      fc.property(instantMs, (ms) => {
        expect(getKyivMondayIndex(getKyivWeekStart(ms))).toBe(0);
      }),
    );
  });

  it("getKyivMondayIndex is always in [0, 6]", () => {
    fc.assert(
      fc.property(instantMs, (ms) => {
        const idx = getKyivMondayIndex(ms);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(6);
      }),
    );
  });

  it("getDaysInMonth is always in [28, 31] for real months", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const days = getDaysInMonth(year, month);
          expect(days).toBeGreaterThanOrEqual(28);
          expect(days).toBeLessThanOrEqual(31);
        },
      ),
    );
  });

  it("parseKyivDate rejects impossible calendar dates", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        // month 13-99 or day 32-99 → never a valid calendar date
        fc.oneof(
          fc.record({
            m: fc.integer({ min: 13, max: 99 }),
            d: fc.integer({ min: 1, max: 28 }),
          }),
          fc.record({
            m: fc.integer({ min: 1, max: 12 }),
            d: fc.integer({ min: 32, max: 99 }),
          }),
        ),
        (year, { m, d }) => {
          const key = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          expect(parseKyivDate(key)).toBeNull();
        },
      ),
    );
  });
});
