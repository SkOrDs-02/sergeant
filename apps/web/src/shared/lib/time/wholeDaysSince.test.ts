import { describe, expect, it } from "vitest";
import { wholeDaysSince } from "./wholeDaysSince";

/** Локальний момент — щоб тест не залежав від TZ раннера. */
function local(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe("wholeDaysSince", () => {
  it("рахує нуль у межах однієї доби, навіть через багато годин", () => {
    const now = local(2026, 8, 23, 9, 0);
    expect(wholeDaysSince(local(2026, 8, 23, 0, 5), now)).toBe(0);
    expect(wholeDaysSince(local(2026, 8, 23, 8, 59), now)).toBe(0);
  });

  it("рахує 1 через календарну північ, а не через 24 години", () => {
    // Завершив о 23:55, дивиться о 00:05 наступного дня: 10 хвилин
    // реального часу, але вже інший день — і людина каже «вчора».
    expect(
      wholeDaysSince(local(2026, 8, 22, 23, 55), local(2026, 8, 23, 0, 5)),
    ).toBe(1);
  });

  it("не округляє вечірній запис у менший день (regress: 15 vs 16)", () => {
    // Це і є розбіжність хаба: 16 календарних днів, але 15.46 доби —
    // стара арифметика (`Math.round(hoursAgo / 24)`) давала 15.
    const now = local(2026, 8, 23, 9, 0);
    const past = local(2026, 8, 7, 22, 0);
    expect((now.getTime() - past.getTime()) / 86_400_000).toBeLessThan(16);
    expect(wholeDaysSince(past, now)).toBe(16);
  });

  it("рахує N днів для довільної паузи", () => {
    const now = local(2026, 8, 23, 12, 0);
    expect(wholeDaysSince(local(2026, 8, 18, 12, 0), now)).toBe(5);
    expect(wholeDaysSince(local(2026, 7, 24, 1, 0), now)).toBe(30);
  });

  it("приймає ISO-рядок і мілісекунди так само, як Date", () => {
    const now = local(2026, 8, 23, 12, 0);
    const past = local(2026, 8, 20, 7, 30);
    expect(wholeDaysSince(past.toISOString(), now)).toBe(3);
    expect(wholeDaysSince(past.getTime(), now)).toBe(3);
  });

  it("невідомий момент — Infinity, щоб викликач сам вирішив мовчати", () => {
    const now = local(2026, 8, 23, 12, 0);
    expect(wholeDaysSince(null, now)).toBe(Infinity);
    expect(wholeDaysSince(undefined, now)).toBe(Infinity);
    expect(wholeDaysSince("не дата", now)).toBe(Infinity);
  });

  it("майбутній момент дає відʼємне число, а не затиснутий нуль", () => {
    expect(
      wholeDaysSince(local(2026, 8, 25, 10, 0), local(2026, 8, 23, 10, 0)),
    ).toBe(-2);
  });
});
