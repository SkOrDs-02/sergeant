/**
 * Unit tests for getKyivTimeOfDay, getKyivGreeting, and
 * formatKyivNominativeDate.
 *
 * Time-of-day functions call getKyivDateParts() with no argument (i.e.
 * `new Date()`). We control the clock via `vi.setSystemTime` so the
 * Kyiv-local hour lands in each bucket.
 *
 * Kyiv UTC offsets: EET (winter) UTC+2, EEST (summer) UTC+3.
 * We use 2026-01-15 (EET, UTC+2) for all time-of-day tests so the
 * arithmetic is simple: Kyiv hour = UTC hour + 2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatKyivNominativeDate,
  getKyivGreeting,
  getKyivTimeOfDay,
} from "./greeting";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: set system time so the Kyiv-local hour is `kyivHour`.
// Jan 15 2026 is EET (UTC+2), so UTC hour = kyivHour - 2.
function setKyivHour(kyivHour: number): void {
  const utcHour = kyivHour - 2;
  // Normalise into [0, 24) across midnight
  const normalised = ((utcHour % 24) + 24) % 24;
  vi.setSystemTime(
    new Date(`2026-01-15T${String(normalised).padStart(2, "0")}:00:00Z`),
  );
}

describe("getKyivTimeOfDay", () => {
  it("returns 'morning' for hour 5 (inclusive lower bound)", () => {
    setKyivHour(5);
    expect(getKyivTimeOfDay()).toBe("morning");
  });

  it("returns 'morning' for hour 11 (just below afternoon threshold)", () => {
    setKyivHour(11);
    expect(getKyivTimeOfDay()).toBe("morning");
  });

  it("returns 'afternoon' for hour 12 (inclusive lower bound)", () => {
    setKyivHour(12);
    expect(getKyivTimeOfDay()).toBe("afternoon");
  });

  it("returns 'afternoon' for hour 16 (just below evening threshold)", () => {
    setKyivHour(16);
    expect(getKyivTimeOfDay()).toBe("afternoon");
  });

  it("returns 'evening' for hour 17 (inclusive lower bound)", () => {
    setKyivHour(17);
    expect(getKyivTimeOfDay()).toBe("evening");
  });

  it("returns 'evening' for hour 21 (just below night threshold)", () => {
    setKyivHour(21);
    expect(getKyivTimeOfDay()).toBe("evening");
  });

  it("returns 'night' for hour 22 (inclusive lower bound)", () => {
    setKyivHour(22);
    expect(getKyivTimeOfDay()).toBe("night");
  });

  it("returns 'night' for hour 0 (midnight)", () => {
    setKyivHour(0);
    expect(getKyivTimeOfDay()).toBe("night");
  });

  it("returns 'night' for hour 4 (just below morning threshold)", () => {
    setKyivHour(4);
    expect(getKyivTimeOfDay()).toBe("night");
  });
});

describe("getKyivGreeting", () => {
  it("returns 'Доброго ранку' during morning", () => {
    setKyivHour(8);
    expect(getKyivGreeting()).toBe("Доброго ранку");
  });

  it("returns 'Доброго дня' during afternoon", () => {
    setKyivHour(14);
    expect(getKyivGreeting()).toBe("Доброго дня");
  });

  it("returns 'Доброго вечора' during evening", () => {
    setKyivHour(19);
    expect(getKyivGreeting()).toBe("Доброго вечора");
  });

  it("returns 'Доброї ночі' at night", () => {
    setKyivHour(23);
    expect(getKyivGreeting()).toBe("Доброї ночі");
  });
});

describe("formatKyivNominativeDate", () => {
  it("returns a non-empty string for a normal date", () => {
    setKyivHour(12); // 2026-01-15 noon Kyiv
    const result = formatKyivNominativeDate();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes '15' (day) in the output for 2026-01-15", () => {
    setKyivHour(12);
    const result = formatKyivNominativeDate();
    expect(result).toContain("15");
  });

  it("capitalizes the first character of the result", () => {
    setKyivHour(12);
    const result = formatKyivNominativeDate();
    // First char should be uppercase Ukrainian letter
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });

  it("contains a comma separating weekday from day+month", () => {
    setKyivHour(12);
    const result = formatKyivNominativeDate();
    expect(result).toContain(",");
  });
});
