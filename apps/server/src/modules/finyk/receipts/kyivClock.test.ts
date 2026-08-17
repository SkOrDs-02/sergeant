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

  // DST-переходи Europe/Kyiv (review-фікс): завжди 01:00 UTC останньої
  // неділі березня (spring-forward gap) і жовтня (fall-back overlap).
  // Реальні дати переходу для 2025/2026 — обчислені й перевірені через
  // Intl.DateTimeFormat (не вгадані): 2025-03-30, 2025-10-26,
  // 2026-03-29, 2026-10-25.
  describe("spring-forward GAP (03:00-03:59 останньої неділі березня не існує)", () => {
    it("2025-03-30 03:00 (початок gap) → зсув на +1 год, 04:00 EEST", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 3,
        day: 30,
        hour: 3,
        minute: 0,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2025-03-30T01:00:00.000Z");
    });

    it("2025-03-30 03:30 (середина gap) → зсув на +1 год, 04:30 EEST", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 3,
        day: 30,
        hour: 3,
        minute: 30,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2025-03-30T01:30:00.000Z");
    });

    it("2025-03-30 02:59:59 (щойно ДО gap) — унікальний, без зсуву, EET", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 3,
        day: 30,
        hour: 2,
        minute: 59,
        second: 59,
      });
      expect(utc.toISOString()).toBe("2025-03-30T00:59:59.000Z");
    });

    it("2025-03-30 04:00:00 (щойно ПІСЛЯ gap) — унікальний, без зсуву, EEST", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 3,
        day: 30,
        hour: 4,
        minute: 0,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2025-03-30T01:00:00.000Z");
    });

    it("2026-03-29 03:30 (наступний рік) → та сама gap-політика", () => {
      const utc = kyivWallClockToUtc({
        year: 2026,
        month: 3,
        day: 29,
        hour: 3,
        minute: 30,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    });
  });

  describe("fall-back OVERLAP (03:00-03:59 останньої неділі жовтня існує двічі)", () => {
    it("2025-10-26 03:00 (початок overlap) → перше/літнє (EEST) входження", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 10,
        day: 26,
        hour: 3,
        minute: 0,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2025-10-26T00:00:00.000Z");
    });

    it("2025-10-26 03:30 (середина overlap) → перше/літнє (EEST) входження", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 10,
        day: 26,
        hour: 3,
        minute: 30,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2025-10-26T00:30:00.000Z");
    });

    it("2025-10-26 02:59:59 (щойно ДО overlap) — унікальний, EEST", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 10,
        day: 26,
        hour: 2,
        minute: 59,
        second: 59,
      });
      expect(utc.toISOString()).toBe("2025-10-25T23:59:59.000Z");
    });

    it("2025-10-26 04:00:00 (щойно ПІСЛЯ overlap) — унікальний, EET", () => {
      const utc = kyivWallClockToUtc({
        year: 2025,
        month: 10,
        day: 26,
        hour: 4,
        minute: 0,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2025-10-26T02:00:00.000Z");
    });

    it("2026-10-25 03:30 (наступний рік) → та сама overlap-політика", () => {
      const utc = kyivWallClockToUtc({
        year: 2026,
        month: 10,
        day: 25,
        hour: 3,
        minute: 30,
        second: 0,
      });
      expect(utc.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    });
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
