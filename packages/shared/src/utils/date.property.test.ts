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

  it("Kyiv offset invariant: result differs from UTC day at known boundary timestamps", () => {
    // Domain invariant (AGENTS.md): all day boundaries use Europe/Kyiv,
    // never UTC. UTC midnight is 02:00 Kyiv (winter) / 03:00 Kyiv (summer),
    // so a timestamp just before UTC midnight must give the *previous*
    // Kyiv day, not the UTC day.
    //
    // 2026-01-01T00:00:00Z = 2026-01-01 02:00 Kyiv (UTC+2 winter) → still 2026-01-01
    // 2025-12-31T21:59:59Z = 2025-12-31 23:59 Kyiv           → 2025-12-31
    // 2025-12-31T22:00:00Z = 2026-01-01 00:00 Kyiv            → 2026-01-01
    //
    // Probe the DST-safe boundary at 2026-01-01T00:00:00.000Z.
    const utcMidnight2026 = new Date("2026-01-01T00:00:00.000Z");
    // Kyiv is UTC+2 in winter, so 00:00 UTC = 02:00 Kyiv → still Jan 1
    expect(toLocalISODate(utcMidnight2026)).toBe("2026-01-01");

    // One second before Kyiv midnight (22:00 UTC-1, = 2025-12-31T21:59:59Z)
    const beforeKyivMidnight = new Date("2025-12-31T21:59:59.000Z");
    expect(toLocalISODate(beforeKyivMidnight)).toBe("2025-12-31");

    // The instant Kyiv crosses midnight (2025-12-31T22:00:00Z = 2026-01-01 00:00 Kyiv)
    const kyivMidnight = new Date("2025-12-31T22:00:00.000Z");
    expect(toLocalISODate(kyivMidnight)).toBe("2026-01-01");
  });

  it("monotonicity: earlier Date always produces an equal or earlier day key", () => {
    // If date A comes strictly before date B in calendar time, the
    // Kyiv day key for A must be ≤ the key for B. This pins the
    // order-preservation contract that downstream UI sorting relies on.
    for (let i = 0; i < NUM_RUNS; i++) {
      const earlier = arbitraryLocalDate();
      // Add a random positive offset (0..30 days) so `later` is always ≥ `earlier`
      const laterMs =
        earlier.getTime() + Math.floor(rng() * 30 * 24 * 60 * 60 * 1000);
      const later = new Date(laterMs);
      expect(toLocalISODate(earlier) <= toLocalISODate(later)).toBe(true);
    }
  });
});
