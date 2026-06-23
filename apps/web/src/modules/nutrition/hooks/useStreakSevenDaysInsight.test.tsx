// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the 7-day kcal streak insight detection hook.
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
const addDaysISODate = vi.fn();
vi.mock("../lib/nutritionStorage", () => ({
  getDayMacros: (...a: unknown[]) => getDayMacros(...a),
  addDaysISODate: (...a: unknown[]) => addDaysISODate(...a),
}));

import { useStreakSevenDaysInsight } from "./useStreakSevenDaysInsight";

const log = {} as never;

beforeEach(() => {
  getKyivDateParts.mockReturnValue({ year: 2026, month: 6, day: 23 });
  getKyivDayKey.mockReturnValue("2026-06-23");
  addDaysISODate.mockImplementation((d: string, n: number) => `${d}${n}`);
});

afterEach(() => vi.clearAllMocks());

describe("useStreakSevenDaysInsight", () => {
  it("returns null when the kcal goal is unset", () => {
    const { result } = renderHook(() =>
      useStreakSevenDaysInsight(log, { dailyTargetKcal: 0 } as never),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when any day is outside the [0.95, 1.05] band", () => {
    // First day in-band, second day too low → bail.
    let call = 0;
    getDayMacros.mockImplementation(() => {
      call += 1;
      return { kcal: call === 2 ? 500 : 2000 };
    });
    const { result } = renderHook(() =>
      useStreakSevenDaysInsight(log, { dailyTargetKcal: 2000 } as never),
    );
    expect(result.current).toBeNull();
  });

  it("surfaces a week-keyed insight when all 7 days are in-band", () => {
    getDayMacros.mockReturnValue({ kcal: 2000 }); // exactly on goal
    const { result } = renderHook(() =>
      useStreakSevenDaysInsight(log, { dailyTargetKcal: 2000 } as never),
    );
    expect(result.current).toMatchObject({
      module: "nutrition",
      action: { type: "navigate", path: "/nutrition/menu" },
    });
    expect(result.current?.id).toMatch(/^nutrition-streak-7-days-2026-W\d{2}$/);
  });
});
