// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const generate = vi.hoisted(() => vi.fn());
const loadDigest = vi.hoisted(() => vi.fn<(k: string) => unknown>(() => null));
const useWeeklyDigestMock = vi.hoisted(() =>
  vi.fn((weekKey?: string) => {
    void weekKey;
    return { generate };
  }),
);
// Реальний getWeekKey: тест пінить саме АРИФМЕТИКУ «минулий тиждень»
// (знахідка W1: авто-звіт генерував щойно-початий тиждень із нульовими
// даними), тож мокати її означало б тестувати мок.
const getWeekKey = vi.hoisted(() =>
  vi.fn((d: Date = new Date()) => {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, "0");
    const day = String(monday.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }),
);

vi.mock("../../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: useWeeklyDigestMock,
  loadDigest,
  getWeekKey,
}));

import { useMondayAutoDigest } from "./useMondayAutoDigest";
import { STORAGE_KEYS } from "@sergeant/shared";

// A Monday: 2026-06-22 is a Monday. The week that just ended started 06-15.
const MONDAY = new Date("2026-06-22T09:00:00");
const PREV_WEEK_KEY = "2026-06-15";
// A Tuesday.
const TUESDAY = new Date("2026-06-23T09:00:00");

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  loadDigest.mockReturnValue(null);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Явний opt-out — єдиний спосіб вимкнути (default ON з 2026-08-30). */
function disable() {
  // safeReadLS JSON-parses, so the flag must be a JSON string literal.
  localStorage.setItem(
    STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO,
    JSON.stringify("0"),
  );
}

describe("useMondayAutoDigest", () => {
  it("НЕ генерує при явному opt-out ('0')", () => {
    disable();
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(5000);
    expect(generate).not.toHaveBeenCalled();
  });

  it("генерує без збереженого прапорця (default ON)", () => {
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(3000);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a non-Monday", () => {
    vi.setSystemTime(TUESDAY);
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(5000);
    expect(generate).not.toHaveBeenCalled();
  });

  it("цілиться у ЗАВЕРШЕНИЙ тиждень, не в щойно-початий (W1)", () => {
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    // Хук просить дайджест-хук саме за минулий тиждень…
    expect(useWeeklyDigestMock).toHaveBeenCalledWith(PREV_WEEK_KEY);
    vi.advanceTimersByTime(3000);
    // …і перевіряє наявність збереженого звіту теж за минулий тиждень.
    expect(loadDigest).toHaveBeenCalledWith(PREV_WEEK_KEY);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a digest already exists for the finished week", () => {
    vi.setSystemTime(MONDAY);
    loadDigest.mockReturnValue({ id: "existing" });
    renderHook(() => useMondayAutoDigest());
    vi.advanceTimersByTime(5000);
    expect(generate).not.toHaveBeenCalled();
  });

  it("skips generation if a digest lands during the defer window", () => {
    vi.setSystemTime(MONDAY);
    renderHook(() => useMondayAutoDigest());
    // a cross-tab write completes before the timer fires
    loadDigest.mockReturnValue({ id: "raced" });
    vi.advanceTimersByTime(3000);
    expect(generate).not.toHaveBeenCalled();
  });
});
