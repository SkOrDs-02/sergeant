import { describe, it, expect } from "vitest";
import { kyivDayStartMs, kyivMondayStartMs, toLocalISODate } from "./date";

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

// All expectations below are expressed as UTC instants so they hold under
// any host timezone — the helpers must be anchored to Europe/Kyiv only.
describe("shared/lib/date – kyivDayStartMs", () => {
  it("returns Kyiv midnight of the day containing the instant (EEST, UTC+3)", () => {
    // 2026-06-10 15:00 Kyiv → day start 2026-06-10 00:00 Kyiv = 09T21:00Z
    expect(kyivDayStartMs("2026-06-10T12:00:00Z")).toBe(
      Date.parse("2026-06-09T21:00:00Z"),
    );
  });

  it("rolls into the next Kyiv day before the UTC day does", () => {
    // 2026-06-07T21:30Z = Mon 2026-06-08 00:30 Kyiv
    expect(kyivDayStartMs("2026-06-07T21:30:00Z")).toBe(
      Date.parse("2026-06-07T21:00:00Z"),
    );
  });

  it("is exact on the spring-forward day (2026-03-29, 23h long)", () => {
    // Sun 2026-03-29 12:00 Kyiv (EEST after the 03:00→04:00 jump) = 09:00Z;
    // that day's midnight was still EET: 2026-03-28T22:00:00Z.
    expect(kyivDayStartMs("2026-03-29T09:00:00Z")).toBe(
      Date.parse("2026-03-28T22:00:00Z"),
    );
  });

  it("is exact on the fall-back day (2026-10-25, 25h long)", () => {
    // Sun 2026-10-25 12:00 Kyiv (EET after the 04:00→03:00 roll-back) = 10:00Z;
    // that day's midnight was still EEST: 2026-10-24T21:00:00Z.
    expect(kyivDayStartMs("2026-10-25T10:00:00Z")).toBe(
      Date.parse("2026-10-24T21:00:00Z"),
    );
  });

  it("returns NaN for unparseable input", () => {
    expect(kyivDayStartMs("not-a-date")).toBeNaN();
    expect(kyivDayStartMs(NaN)).toBeNaN();
  });
});

describe("shared/lib/date – kyivMondayStartMs", () => {
  // Mon 2026-06-08 00:00 Kyiv (EEST) = 2026-06-07T21:00:00Z.
  const MON_JUN_8 = Date.parse("2026-06-07T21:00:00Z");

  it("Sun 23:30 Kyiv still belongs to the previous week", () => {
    expect(kyivMondayStartMs("2026-06-07T20:30:00Z")).toBe(
      Date.parse("2026-05-31T21:00:00Z"), // Mon 2026-06-01 00:00 Kyiv
    );
  });

  it("Mon 00:30 Kyiv opens the new week", () => {
    expect(kyivMondayStartMs("2026-06-07T21:30:00Z")).toBe(MON_JUN_8);
  });

  it("is idempotent and Monday maps to itself", () => {
    expect(kyivMondayStartMs(MON_JUN_8)).toBe(MON_JUN_8);
    expect(kyivMondayStartMs(kyivMondayStartMs("2026-06-12T08:00:00Z"))).toBe(
      MON_JUN_8,
    );
  });

  it("spring-forward week (2026-03-23..29) is 167h and ends on time", () => {
    const monBefore = Date.parse("2026-03-22T22:00:00Z"); // Mon 23.03 00:00 EET
    const monAfter = Date.parse("2026-03-29T21:00:00Z"); // Mon 30.03 00:00 EEST
    // Sunday late evening after the DST jump still belongs to the DST week.
    expect(kyivMondayStartMs("2026-03-29T20:30:00Z")).toBe(monBefore);
    // First minutes of the next Kyiv Monday open the next week.
    expect(kyivMondayStartMs("2026-03-29T21:30:00Z")).toBe(monAfter);
    expect(monAfter - monBefore).toBe(167 * 60 * 60 * 1000);
  });

  it("fall-back week (2026-10-19..25) is 169h and ends on time", () => {
    const monBefore = Date.parse("2026-10-18T21:00:00Z"); // Mon 19.10 00:00 EEST
    const monAfter = Date.parse("2026-10-25T22:00:00Z"); // Mon 26.10 00:00 EET
    expect(kyivMondayStartMs("2026-10-25T21:30:00Z")).toBe(monBefore);
    expect(kyivMondayStartMs("2026-10-25T22:30:00Z")).toBe(monAfter);
    expect(monAfter - monBefore).toBe(169 * 60 * 60 * 1000);
  });

  it("returns NaN for unparseable input", () => {
    expect(kyivMondayStartMs("not-a-date")).toBeNaN();
  });
});
