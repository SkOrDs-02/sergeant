import { describe, it, expect } from "vitest";
import { kyivDateString, kyivWallClockToUtc } from "./kyivClock.js";

describe("kyivWallClockToUtc", () => {
  it("конвертує зимовий (EET, UTC+2) стінний час", () => {
    const utc = kyivWallClockToUtc({
      year: 2026,
      month: 1,
      day: 15,
      hour: 14,
      minute: 32,
      second: 10,
    });
    expect(utc.toISOString()).toBe("2026-01-15T12:32:10.000Z");
  });

  it("конвертує літній (EEST, UTC+3) стінний час", () => {
    const utc = kyivWallClockToUtc({
      year: 2026,
      month: 7,
      day: 15,
      hour: 14,
      minute: 0,
      second: 0,
    });
    expect(utc.toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });

  it("північ Kyiv-часу коректно переходить у попередню UTC-добу", () => {
    const utc = kyivWallClockToUtc({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 30,
      second: 0,
    });
    // 2026-01-01 00:30 Kyiv (UTC+2) = 2025-12-31 22:30 UTC.
    expect(utc.toISOString()).toBe("2025-12-31T22:30:00.000Z");
  });
});

describe("kyivDateString", () => {
  it("дає той самий день, коли UTC і Kyiv збігаються", () => {
    expect(kyivDateString(new Date("2026-01-15T10:00:00.000Z"))).toBe(
      "2026-01-15",
    );
  });

  it('зсуває день вперед біля півночі Kyiv (UTC ще "вчора")', () => {
    // 2026-01-15T22:30:00Z + 2h (EET) = 2026-01-16T00:30 Kyiv.
    expect(kyivDateString(new Date("2026-01-15T22:30:00.000Z"))).toBe(
      "2026-01-16",
    );
  });
});
