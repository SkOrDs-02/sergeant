import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calcCardioMetrics,
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue,
  uid,
} from "./activeWorkoutLib";

describe("activeWorkoutLib", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates stable prefixed ids from time and random suffixes", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    expect(uid("set")).toBe("set_loyw3v28_4fzzzx");
    expect(uid()).toBe("id_loyw3v28_4fzzzx");
  });

  it("converts ISO timestamps to datetime-local values", () => {
    const expectedLocal = new Date("2026-06-07T09:08:00.000Z");
    const pad = (value: number) => String(value).padStart(2, "0");
    const expected = `${expectedLocal.getFullYear()}-${pad(expectedLocal.getMonth() + 1)}-${pad(expectedLocal.getDate())}T${pad(expectedLocal.getHours())}:${pad(expectedLocal.getMinutes())}`;

    expect(isoToDatetimeLocalValue("2026-06-07T09:08:00.000Z")).toBe(expected);
    expect(isoToDatetimeLocalValue(null)).toBe("");
    expect(isoToDatetimeLocalValue(undefined)).toBe("");
    expect(isoToDatetimeLocalValue("not-a-date")).toBe("");
  });

  it("converts datetime-local values back to ISO or null", () => {
    expect(datetimeLocalValueToIso("2026-06-07T09:08")).toBe(
      new Date("2026-06-07T09:08").toISOString(),
    );
    expect(datetimeLocalValueToIso("")).toBeNull();
    expect(datetimeLocalValueToIso(null)).toBeNull();
    expect(datetimeLocalValueToIso(undefined)).toBeNull();
    expect(datetimeLocalValueToIso("not-a-date")).toBeNull();
  });

  it("calculates cardio pace and speed for positive distance and duration", () => {
    const metrics = calcCardioMetrics(5_000, 1_500);

    expect(metrics?.pace).toMatch(/^5:00 /);
    expect(metrics?.speed).toMatch(/^12\.0 /);
  });

  it("rounds pace seconds that overflow into the next minute", () => {
    const metrics = calcCardioMetrics(1_000, 359.9);

    expect(metrics?.pace).toMatch(/^6:00 /);
    expect(metrics?.speed).toMatch(/^10\.0 /);
  });

  it("returns null when cardio inputs cannot produce metrics", () => {
    expect(calcCardioMetrics(0, 1_500)).toBeNull();
    expect(calcCardioMetrics(5_000, 0)).toBeNull();
    expect(calcCardioMetrics(null, 1_500)).toBeNull();
    expect(calcCardioMetrics(5_000, undefined)).toBeNull();
  });
});
