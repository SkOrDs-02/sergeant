// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the 7-day kcal streak insight detection hook.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const todayISODate = vi.fn();
vi.mock("@sergeant/nutrition-domain", () => ({
  todayISODate: () => todayISODate(),
  WEEK_KCAL_OVER_TOLERANCE: 1.05,
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
  todayISODate.mockReturnValue("2026-06-23");
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

  /**
   * Регресія: ключ тижня мусить бути ISO-тижнем, а не «порядковий день / 7».
   *
   * Стара реалізація перемикала ключ на фіксованих порядкових днях, тож межа
   * падала в СЕРЕДИНУ тижня: 2026-06-23 (вт) давало `W25`, а 2026-06-25 (чт)
   * уже `W26` — при тому, що обидві дати в одному ISO-тижні 26 (пн 22 → нд 28).
   * Наслідок — знятий у вівторок інсайт повертався в четвер того ж тижня,
   * тобто ключ не робив рівно того, заради чого існує.
   */
  function idForDay(day: string): string | undefined {
    todayISODate.mockReturnValue(day);
    getDayMacros.mockReturnValue({ kcal: 2000 });
    const { result } = renderHook(() =>
      useStreakSevenDaysInsight(log, { dailyTargetKcal: 2000 } as never),
    );
    return result.current?.id;
  }

  it("тримає один ключ на весь ISO-тиждень, від понеділка до неділі", () => {
    const monday = idForDay("2026-06-22");
    expect(monday).toBe("nutrition-streak-7-days-2026-W26");
    expect(idForDay("2026-06-23")).toBe(monday); // вівторок
    expect(idForDay("2026-06-25")).toBe(monday); // четвер — тут ламалась стара
    expect(idForDay("2026-06-28")).toBe(monday); // неділя, останній день тижня
  });

  it("міняє ключ саме в понеділок, а не посеред тижня", () => {
    expect(idForDay("2026-06-21")).toBe("nutrition-streak-7-days-2026-W25");
    expect(idForDay("2026-06-22")).toBe("nutrition-streak-7-days-2026-W26");
    expect(idForDay("2026-06-29")).toBe("nutrition-streak-7-days-2026-W27");
  });

  it("на межі року бере рік ISO-тижня, а не календарний", () => {
    // 2026-12-28 — понеділок ISO-тижня 53, який належить 2026 року,
    // але тягнеться в січень 2027. Календарний рік тут збрехав би.
    expect(idForDay("2026-12-31")).toBe("nutrition-streak-7-days-2026-W53");
    expect(idForDay("2027-01-01")).toBe("nutrition-streak-7-days-2026-W53");
  });
});
