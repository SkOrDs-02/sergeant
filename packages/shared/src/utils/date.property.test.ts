import { describe, expect, it } from "vitest";
import { toLocalISODate } from "./date";

/**
 * Property-based tests for the date utility.
 *
 * NOTE: the planned card (T-8) referenced `toKyivDayKey` / `fromKyivDayKey`
 * round-trip + DST handling, but those functions do not exist in this repo —
 * the only shared date helper is `toLocalISODate`. It also calls for
 * `fast-check`, which is not installed and is out of scope to add here. So this
 * suite drives a small seeded PRNG over generated dates and asserts the genuine
 * invariants of `toLocalISODate`. Each block maps 1:1 to an `fc.property`.
 */

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_RUNS = Number(process.env["FAST_CHECK_NUM_RUNS"] ?? 1000);
const rng = makeRng(42);

/** A random local Date within [1970, ~2100]. */
function arbitraryLocalDate(): Date {
  const year = 1970 + Math.floor(rng() * 130);
  const month = Math.floor(rng() * 12); // 0..11
  const day = 1 + Math.floor(rng() * 28); // 1..28, always valid
  const hour = Math.floor(rng() * 24);
  const minute = Math.floor(rng() * 60);
  return new Date(year, month, day, hour, minute);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("shared/utils/date – toLocalISODate property", () => {
  it("always returns a well-formed YYYY-MM-DD string", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      expect(toLocalISODate(arbitraryLocalDate())).toMatch(ISO_DATE);
    }
  });

  it("encodes the date's local calendar fields exactly", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const d = arbitraryLocalDate();
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")}`;
      expect(toLocalISODate(d)).toBe(expected);
    }
  });

  it("round-trips through the millisecond timestamp (Date vs number agree)", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const d = arbitraryLocalDate();
      expect(toLocalISODate(d.getTime())).toBe(toLocalISODate(d));
    }
  });

  it("is time-of-day invariant: only the calendar day matters", () => {
    for (let i = 0; i < NUM_RUNS; i++) {
      const base = arbitraryLocalDate();
      const midnight = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        0,
        0,
        0,
      );
      const lateNight = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        23,
        59,
        59,
      );
      expect(toLocalISODate(lateNight)).toBe(toLocalISODate(midnight));
    }
  });

  it("returns the 1970-01-01 sentinel for any non-parseable input", () => {
    const garbage = ["not-a-date", "", "32/13/2026", "????", "NaN"];
    for (const g of garbage) {
      expect(toLocalISODate(g)).toBe("1970-01-01");
    }
    expect(toLocalISODate(NaN)).toBe("1970-01-01");
  });
});
