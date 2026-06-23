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

const getDayMacros = vi.fn();
vi.mock("../lib/nutritionStorage", () => ({
  getDayMacros: (...a: unknown[]) => getDayMacros(...a),
}));

import { useProteinLowInsight } from "./useProteinLowInsight";

const log = {} as never;

beforeEach(() => {
  getKyivDateParts.mockReturnValue({ hour: 20 });
  getKyivDayKey.mockReturnValue("2026-06-23");
  getDayMacros.mockReturnValue({ protein_g: 20 });
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
    getDayMacros.mockReturnValue({ protein_g: 80 }); // 80/120 = 67%
    const { result } = renderHook(() =>
      useProteinLowInsight(log, { dailyTargetProtein_g: 120 } as never),
    );
    expect(result.current).toBeNull();
  });

  it("surfaces an insight when protein is low after 18:00", () => {
    getDayMacros.mockReturnValue({ protein_g: 30 }); // 30/120 = 25%
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
  });
});
