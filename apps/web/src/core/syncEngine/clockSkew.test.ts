import { describe, expect, it, vi } from "vitest";
import {
  CLOCK_SKEW_WARN_MS,
  LWW_CONFLICT_STREAK_WARN,
  createClockSkewMonitor,
} from "./clockSkew";

const T0 = Date.parse("2026-09-16T12:00:00.000Z");

describe("clockSkew — прямий замір по server_now", () => {
  it("відсталий годинник понад поріг звітується один раз, зі знаком", () => {
    const report = vi.fn();
    const m = createClockSkewMonitor({ report, now: () => T0 });
    // Сервер «попереду» на 6 хв → пристрій відстає.
    m.noteServerNow(new Date(T0 + 6 * 60 * 1000).toISOString());
    m.noteServerNow(new Date(T0 + 7 * 60 * 1000).toISOString());
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toMatchObject({
      kind: "skew",
      skewMs: -6 * 60 * 1000,
    });
    expect(m.isSkewed()).toBe(true);
  });

  it("зсув у межах порогу — не звіт і не skewed", () => {
    const report = vi.fn();
    const m = createClockSkewMonitor({ report, now: () => T0 });
    m.noteServerNow(new Date(T0 - CLOCK_SKEW_WARN_MS + 1000).toISOString());
    expect(report).not.toHaveBeenCalled();
    expect(m.isSkewed()).toBe(false);
    expect(m.skewMs()).toBe(CLOCK_SKEW_WARN_MS - 1000);
  });

  it("сервер без server_now або з непарсабельним рядком — тиша", () => {
    const report = vi.fn();
    const m = createClockSkewMonitor({ report, now: () => T0 });
    m.noteServerNow(undefined);
    m.noteServerNow("вчора");
    expect(report).not.toHaveBeenCalled();
    expect(m.skewMs()).toBeNull();
  });
});

describe("clockSkew — серія lww_conflict", () => {
  it("N відхилень поспіль без успіху — один звіт; успіх скидає серію", () => {
    const report = vi.fn();
    const m = createClockSkewMonitor({ report, now: () => T0 });
    for (let i = 0; i < LWW_CONFLICT_STREAK_WARN - 1; i++)
      m.noteOutcome("lww_conflict");
    m.noteOutcome(null); // застосовано → серія обнулилась
    for (let i = 0; i < LWW_CONFLICT_STREAK_WARN - 1; i++)
      m.noteOutcome("lww_conflict");
    expect(report).not.toHaveBeenCalled();
    m.noteOutcome("lww_conflict");
    m.noteOutcome("lww_conflict");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toMatchObject({
      kind: "lww_streak",
      streak: LWW_CONFLICT_STREAK_WARN,
    });
  });

  it("інші термінальні причини серію не рахують і не обнуляють", () => {
    const report = vi.fn();
    const m = createClockSkewMonitor({ report, now: () => T0 });
    m.noteOutcome("lww_conflict");
    m.noteOutcome("tombstoned");
    m.noteOutcome("lww_conflict");
    expect(report).not.toHaveBeenCalled();
  });
});
