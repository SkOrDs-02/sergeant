/**
 * Last validated: 2026-07-31
 * Status: Active
 *
 * Unit tests for the Kyiv-month clamp shared by Огляд, Планування and the
 * budget-overrun insight. Regression origin: founder report 2026-07-31 —
 * «Статистику на серпень вже велику пише, хоча він тільки почався».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentKyivMonthPrefix,
  filterToKyivMonth,
  txEpochMs,
} from "./monthWindow";

const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe("txEpochMs", () => {
  it("treats a 10-digit `time` as seconds", () => {
    expect(txEpochMs({ time: sec("2026-08-01T09:00:00Z") })).toBe(
      new Date("2026-08-01T09:00:00Z").getTime(),
    );
  });

  it("passes a millisecond `time` through unchanged", () => {
    const ms = new Date("2026-08-01T09:00:00Z").getTime();
    expect(txEpochMs({ time: ms })).toBe(ms);
  });

  it("falls back to the `date` string when `time` is missing", () => {
    expect(txEpochMs({ date: "2026-08-01" })).toBe(
      new Date("2026-08-01").getTime(),
    );
  });

  it("returns null for an undated row rather than epoch 0", () => {
    // Epoch 0 would silently land every undated row in січень 1970 — and,
    // worse, make it comparable to a real month boundary.
    expect(txEpochMs({ time: 0 })).toBeNull();
    expect(txEpochMs({})).toBeNull();
    expect(txEpochMs(null)).toBeNull();
    expect(txEpochMs({ time: Number.NaN })).toBeNull();
    expect(txEpochMs({ date: "not-a-date" })).toBeNull();
  });
});

describe("currentKyivMonthPrefix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Kyiv civil month, not the UTC one, across the boundary", () => {
    // 2026-08-01 01:47 Kyiv (EEST, UTC+3) is still 31 липня in UTC.
    vi.setSystemTime(new Date("2026-07-31T22:47:00Z"));
    expect(currentKyivMonthPrefix()).toBe("2026-08");
  });

  it("accepts an explicit instant", () => {
    expect(currentKyivMonthPrefix(new Date("2026-06-15T09:00:00Z"))).toBe(
      "2026-06",
    );
  });
});

describe("filterToKyivMonth", () => {
  const rows = [
    { id: "june", time: sec("2026-06-20T09:00:00Z") },
    { id: "july", time: sec("2026-07-15T09:00:00Z") },
    { id: "aug-early", time: sec("2026-07-31T22:00:00Z") }, // 1 серпня у Києві
    { id: "aug", time: sec("2026-08-10T09:00:00Z") },
    { id: "undated", time: 0 },
  ];

  it("keeps only rows whose Kyiv day falls in the requested month", () => {
    expect(filterToKyivMonth(rows, "2026-08").map((r) => r.id)).toEqual([
      "aug-early",
      "aug",
    ]);
  });

  it("drops rows without a usable timestamp", () => {
    expect(
      filterToKyivMonth(rows, "2026-08").some((r) => r.id === "undated"),
    ).toBe(false);
  });

  it("returns an empty list for a month with no rows", () => {
    expect(filterToKyivMonth(rows, "2026-05")).toEqual([]);
  });

  it("tolerates null / undefined input", () => {
    expect(filterToKyivMonth(null, "2026-08")).toEqual([]);
    expect(filterToKyivMonth(undefined, "2026-08")).toEqual([]);
  });
});
