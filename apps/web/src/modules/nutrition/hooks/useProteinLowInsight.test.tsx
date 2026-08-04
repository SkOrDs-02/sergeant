// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the protein-low insight detection hook.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getKyivDateParts = vi.fn();
const getKyivDayKey = vi.fn();
vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDateParts: () => getKyivDateParts(),
  getKyivDayKey: () => getKyivDayKey(),
}));

const getDaySummary = vi.fn();
vi.mock("../lib/nutritionStorage", () => ({
  ESTIMATED_KCAL_SHARE_THRESHOLD: 0.5,
  getDaySummary: (...a: unknown[]) => getDaySummary(...a),
}));

import { useProteinLowInsight } from "./useProteinLowInsight";

const log = {} as never;

beforeEach(() => {
  getKyivDateParts.mockReturnValue({ hour: 20 });
  getKyivDayKey.mockReturnValue("2026-06-23");
  getDaySummary.mockReturnValue({ protein_g: 20, estimatedKcalShare: 0 });
});

afterEach(() => vi.clearAllMocks());

describe("useProteinLowInsight", () => {
  it("returns null when the protein goal is unset", () => {
    const { result } = renderHook(() =>
      useProteinLowInsight(log, { dailyTargetProtein_g: 0 } as never),
    );
    expect(result.current).toBeNull();
  });

  it("returns null before 18:00 Kyiv", () => {
    getKyivDateParts.mockReturnValue({ hour: 12 });
    const { result } = renderHook(() =>
      useProteinLowInsight(log, { dailyTargetProtein_g: 120 } as never),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when protein is already >= 60% of goal", () => {
    getDaySummary.mockReturnValue({ protein_g: 80, estimatedKcalShare: 0 }); // 80/120 = 67%
    const { result } = renderHook(() =>
      useProteinLowInsight(log, { dailyTargetProtein_g: 120 } as never),
    );
    expect(result.current).toBeNull();
  });

  it("surfaces an insight when protein is low after 18:00", () => {
    getDaySummary.mockReturnValue({ protein_g: 30, estimatedKcalShare: 0 }); // 30/120 = 25%
    const { result } = renderHook(() =>
      useProteinLowInsight(log, { dailyTargetProtein_g: 120 } as never),
    );
    expect(result.current).toMatchObject({
      id: "nutrition-protein-low",
      module: "nutrition",
      action: { type: "navigate", path: "/nutrition/log" },
    });
    expect(result.current?.title).toContain("30");
    expect(result.current?.title).toContain("120");
    expect(result.current?.subtitle).toBe("Час додати джерело білка?");
  });

  it("softens the subtitle instead of silencing the nudge when the day is mostly photoAI-estimated (nutrition audit E-5)", () => {
    getDaySummary.mockReturnValue({ protein_g: 30, estimatedKcalShare: 0.6 }); // >50%
    const { result } = renderHook(() =>
      useProteinLowInsight(log, { dailyTargetProtein_g: 120 } as never),
    );
    expect(result.current?.subtitle).toContain("білка малувато");
    expect(result.current?.subtitle).not.toBe("Час додати джерело білка?");
  });
});
