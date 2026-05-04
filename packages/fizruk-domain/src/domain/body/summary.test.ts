import { describe, expect, it } from "vitest";

import type { MobileMeasurementEntry } from "../measurements/types.js";

import {
  BODY_SUMMARY_WINDOW_DAYS,
  buildBodySummaries,
  buildBodySummary,
  directionFromDelta,
  getLatestMeasurement,
  getLatestMeasurementValue,
  getMeasurementDeltaWithinDays,
  hasAnyMeasurementFor,
} from "./summary.js";

/**
 * Shorthand constructor for test fixtures — `daysAgo` is inclusive of
 * `nowIso` (so `0` = today, `7` = one week ago). The boundary matters
 * because the delta window is a half-open interval `[now − N, now]`.
 */
function entry(
  id: string,
  daysAgo: number,
  values: Partial<MobileMeasurementEntry>,
  nowIso: string = "2026-04-20T12:00:00.000Z",
): MobileMeasurementEntry {
  const t = Date.parse(nowIso) - daysAgo * 24 * 60 * 60 * 1000;
  return {
    id,
    at: new Date(t).toISOString(),
    ...values,
  };
}

const NOW = "2026-04-20T12:00:00.000Z";

describe("getLatestMeasurement / getLatestMeasurementValue", () => {
  it("returns null for empty / nullish input", () => {
    expect(getLatestMeasurement(undefined, "weightKg")).toBeNull();
    expect(getLatestMeasurement(null, "weightKg")).toBeNull();
    expect(getLatestMeasurement([], "weightKg")).toBeNull();
    expect(getLatestMeasurementValue([], "weightKg")).toBeNull();
  });

  it("skips entries without a finite value for the requested field", () => {
    const entries = [
      entry("a", 1, { weightKg: undefined, sleepHours: 8 }),
      entry("b", 3, { weightKg: 80.5 }),
      entry("c", 5, { weightKg: 82 }),
    ];
    const latest = getLatestMeasurement(entries, "weightKg");
    expect(latest?.value).toBe(80.5);
    expect(latest?.entry.id).toBe("b");
  });

  it("treats NaN / non-number as missing", () => {
    const entries = [
      entry("a", 0, { weightKg: Number.NaN as unknown as number }),
      entry("b", 1, { weightKg: 79 }),
    ];
    expect(getLatestMeasurementValue(entries, "weightKg")).toBe(79);
  });

  it("sorts newest-first regardless of input order", () => {
    const entries = [
      entry("old", 10, { weightKg: 82 }),
      entry("mid", 5, { weightKg: 81 }),
      entry("new", 1, { weightKg: 80 }),
    ];
    expect(getLatestMeasurementValue(entries, "weightKg")).toBe(80);
  });
});

describe("getMeasurementDeltaWithinDays", () => {
  it("returns null when the window has fewer than two valid samples", () => {
    expect(getMeasurementDeltaWithinDays([], "weightKg", 7, NOW)).toBeNull();
    const one = [entry("a", 1, { weightKg: 80 })];
    expect(getMeasurementDeltaWithinDays(one, "weightKg", 7, NOW)).toBeNull();
  });

  it("computes latest − oldest inside the window (7d default)", () => {
    const entries = [
      entry("a", 1, { weightKg: 80 }), // latest
      entry("b", 4, { weightKg: 81 }),
      entry("c", 6, { weightKg: 82 }), // oldest-in-window
      entry("d", 30, { weightKg: 85 }), // out of 7d window
    ];
    expect(getMeasurementDeltaWithinDays(entries, "weightKg", 7, NOW)).toBe(-2);
  });

  it("honours a custom window length", () => {
    const entries = [
      entry("a", 1, { weightKg: 80 }),
      entry("b", 20, { weightKg: 82 }),
      entry("c", 45, { weightKg: 84 }),
    ];
    // 30d window: latest 80 vs oldest-in-window 82 → −2.
    expect(getMeasurementDeltaWithinDays(entries, "weightKg", 30, NOW)).toBe(
      -2,
    );
    // 5d window: only "a" fits → null.
    expect(
      getMeasurementDeltaWithinDays(entries, "weightKg", 5, NOW),
    ).toBeNull();
  });

  it("returns 0 when latest equals baseline", () => {
    const entries = [
      entry("a", 1, { weightKg: 80 }),
      entry("b", 6, { weightKg: 80 }),
    ];
    expect(getMeasurementDeltaWithinDays(entries, "weightKg", 7, NOW)).toBe(0);
  });

  it("returns null for invalid window / now inputs", () => {
    const entries = [
      entry("a", 1, { weightKg: 80 }),
      entry("b", 6, { weightKg: 82 }),
    ];
    expect(
      getMeasurementDeltaWithinDays(entries, "weightKg", 0, NOW),
    ).toBeNull();
    expect(
      getMeasurementDeltaWithinDays(entries, "weightKg", -1, NOW),
    ).toBeNull();
    expect(
      getMeasurementDeltaWithinDays(entries, "weightKg", 7, "not-iso"),
    ).toBeNull();
  });

  it("is robust to unparseable `at` timestamps", () => {
    const entries: MobileMeasurementEntry[] = [
      { id: "bad", at: "not-a-date", weightKg: 99 },
      entry("a", 1, { weightKg: 80 }),
      entry("b", 6, { weightKg: 82 }),
    ];
    expect(getMeasurementDeltaWithinDays(entries, "weightKg", 7, NOW)).toBe(-2);
  });
});

describe("directionFromDelta", () => {
  it("maps null / 0 / positive / negative", () => {
    expect(directionFromDelta(null)).toBe("none");
    expect(directionFromDelta(0)).toBe("flat");
    expect(directionFromDelta(0.5)).toBe("up");
    expect(directionFromDelta(-0.5)).toBe("down");
  });

  it("treats sub-epsilon drift as flat", () => {
    expect(directionFromDelta(1e-9)).toBe("flat");
    expect(directionFromDelta(-1e-9)).toBe("flat");
  });
});

describe("buildBodySummary / buildBodySummaries", () => {
  it("combines latest + delta + direction into a single card payload", () => {
    const entries = [
      entry("a", 1, { weightKg: 79 }),
      entry("b", 5, { weightKg: 81 }),
      entry("c", 12, { weightKg: 83 }),
    ];
    const s = buildBodySummary(entries, "weightKg", 7, NOW);
    expect(s.field).toBe("weightKg");
    expect(s.latest).toBe(79);
    expect(s.latestAt).toBe(entries[0]!.at);
    expect(s.delta).toBe(-2);
    expect(s.direction).toBe("down");
    expect(s.windowDays).toBe(7);
  });

  it("yields a consistent zero-data summary when nothing is logged", () => {
    const s = buildBodySummary([], "weightKg", 7, NOW);
    expect(s).toEqual({
      field: "weightKg",
      latest: null,
      latestAt: null,
      delta: null,
      direction: "none",
      windowDays: 7,
    });
  });

  it("keeps every requested field in the output map even when empty", () => {
    const entries = [entry("a", 1, { weightKg: 80 })];
    const summaries = buildBodySummaries(
      entries,
      ["weightKg", "sleepHours", "mood"],
      7,
      NOW,
    );
    expect(summaries.weightKg?.latest).toBe(80);
    expect(summaries.sleepHours?.latest).toBeNull();
    expect(summaries.mood?.direction).toBe("none");
  });

  it("uses the default window when none is passed", () => {
    const s = buildBodySummary([], "weightKg");
    expect(s.windowDays).toBe(BODY_SUMMARY_WINDOW_DAYS);
  });
});

describe("hasAnyMeasurementFor", () => {
  it("returns false for empty / all-missing lists", () => {
    expect(hasAnyMeasurementFor([], "weightKg")).toBe(false);
    expect(hasAnyMeasurementFor(null, "weightKg")).toBe(false);
    const entries = [entry("a", 1, { sleepHours: 8 })];
    expect(hasAnyMeasurementFor(entries, "weightKg")).toBe(false);
  });

  it("returns true when at least one entry has a finite value", () => {
    const entries = [
      entry("a", 1, { sleepHours: 8 }),
      entry("b", 2, { weightKg: 80 }),
    ];
    expect(hasAnyMeasurementFor(entries, "weightKg")).toBe(true);
  });
});
