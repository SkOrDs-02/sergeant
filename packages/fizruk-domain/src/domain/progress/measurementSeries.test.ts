import { describe, expect, it } from "vitest";

import {
  buildBodyFatTrend,
  buildMeasurementSeries,
  buildWeightTrend,
  computeMeasurementDelta,
  countValidPoints,
  MEASUREMENT_TREND_WINDOW,
} from "./measurementSeries.js";

describe("buildMeasurementSeries", () => {
  it("returns an empty array for null / undefined / empty input", () => {
    expect(buildMeasurementSeries(undefined, "weightKg")).toEqual([]);
    expect(buildMeasurementSeries(null, "weightKg")).toEqual([]);
    expect(buildMeasurementSeries([], "weightKg")).toEqual([]);
  });

  it("sorts entries ascending by `at` timestamp", () => {
    const entries = [
      { at: "2026-01-05T00:00:00Z", weightKg: 80 },
      { at: "2026-01-02T00:00:00Z", weightKg: 82 },
      { at: "2026-01-04T00:00:00Z", weightKg: 81 },
    ];
    const series = buildMeasurementSeries(entries, "weightKg");
    expect(series.map((p) => p.iso)).toEqual([
      "2026-01-02T00:00:00Z",
      "2026-01-04T00:00:00Z",
      "2026-01-05T00:00:00Z",
    ]);
  });

  it("keeps only the last `limit` entries", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      at: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      weightKg: 70 + i,
    }));
    const series = buildMeasurementSeries(entries, "weightKg", 5);
    expect(series).toHaveLength(5);
    expect(series[0]?.iso).toBe("2026-02-08T00:00:00Z");
    expect(series[4]?.iso).toBe("2026-02-12T00:00:00Z");
  });

  it("honours the default 8-entry window", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      at: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      weightKg: i,
    }));
    const series = buildMeasurementSeries(entries, "weightKg");
    expect(series).toHaveLength(MEASUREMENT_TREND_WINDOW);
  });

  it("maps missing / empty / non-numeric fields to `null` values", () => {
    const entries = [
      { at: "2026-01-01T00:00:00Z", weightKg: 80 },
      { at: "2026-01-02T00:00:00Z", weightKg: "" },
      { at: "2026-01-03T00:00:00Z" },
      { at: "2026-01-04T00:00:00Z", weightKg: "abc" },
      { at: "2026-01-05T00:00:00Z", weightKg: "81.5" },
    ];
    const series = buildMeasurementSeries(entries, "weightKg");
    expect(series.map((p) => p.value)).toEqual([80, null, null, null, 81.5]);
  });

  it("includes a short locale-formatted label", () => {
    const series = buildMeasurementSeries(
      [{ at: "2026-04-15T00:00:00Z", weightKg: 80 }],
      "weightKg",
    );
    expect(series[0]?.label).toMatch(/\w+/);
    expect(series[0]?.label.length).toBeLessThan(20);
  });

  it("buildWeightTrend + buildBodyFatTrend pick the right field", () => {
    const entries = [
      { at: "2026-01-01T00:00:00Z", weightKg: 80, bodyFatPct: 18 },
      { at: "2026-01-02T00:00:00Z", weightKg: 79, bodyFatPct: 17.5 },
    ];
    const weight = buildWeightTrend(entries);
    const fat = buildBodyFatTrend(entries);
    expect(weight.map((p) => p.value)).toEqual([80, 79]);
    expect(fat.map((p) => p.value)).toEqual([18, 17.5]);
  });

  it("buildWeightTrend без dailyLog поводиться байт-у-байт як раніше", () => {
    // Два записи в один Kyiv-день: без union-джерела дедупу НЕ відбувається.
    const entries = [
      { at: "2026-01-02T06:00:00Z", weightKg: 80 },
      { at: "2026-01-02T19:00:00Z", weightKg: 79 },
    ];
    expect(buildWeightTrend(entries).map((p) => p.value)).toEqual([80, 79]);
  });

  it("buildWeightTrend з dailyLog будує union обох сховищ", () => {
    const measurements = [{ at: "2026-01-02T06:00:00Z", weightKg: 80 }];
    const dailyLog = [{ at: "2026-01-01T06:00:00Z", weightKg: 82 }];
    const trend = buildWeightTrend(measurements, 8, dailyLog);
    expect(trend.map((p) => p.value)).toEqual([82, 80]);
  });

  it("buildWeightTrend з dailyLog дедуплікує колізію дня за новішим `at`", () => {
    const trend = buildWeightTrend(
      [{ at: "2026-01-02T06:00:00Z", weightKg: 80 }],
      8,
      [{ at: "2026-01-02T19:00:00Z", weightKg: 79 }],
    );
    expect(trend.map((p) => p.value)).toEqual([79]);
  });
});

describe("countValidPoints", () => {
  it("counts only points with a non-null value", () => {
    const series = [
      { iso: "a", value: 1, label: "" },
      { iso: "b", value: null, label: "" },
      { iso: "c", value: 2.5, label: "" },
    ];
    expect(countValidPoints(series)).toBe(2);
  });

  it("returns 0 for empty series", () => {
    expect(countValidPoints([])).toBe(0);
  });
});

describe("computeMeasurementDelta", () => {
  it("returns null for null/empty/short input", () => {
    expect(computeMeasurementDelta(null, "weightKg")).toBeNull();
    expect(computeMeasurementDelta([], "weightKg")).toBeNull();
    expect(
      computeMeasurementDelta(
        [{ at: "2026-01-01T00:00:00Z", weightKg: 80 }],
        "weightKg",
      ),
    ).toBeNull();
  });

  it("returns latest - prev for newest-first entries", () => {
    const entries = [
      { at: "2026-01-02T00:00:00Z", weightKg: 79 },
      { at: "2026-01-01T00:00:00Z", weightKg: 80 },
    ];
    expect(computeMeasurementDelta(entries, "weightKg")).toBe(-1);
  });

  it("returns null when either side is non-numeric", () => {
    const entries = [
      { at: "2026-01-02T00:00:00Z", weightKg: "" },
      { at: "2026-01-01T00:00:00Z", weightKg: 80 },
    ];
    expect(computeMeasurementDelta(entries, "weightKg")).toBeNull();
  });
});
