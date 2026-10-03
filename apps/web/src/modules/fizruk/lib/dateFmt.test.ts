/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import { formatShortDate } from "./dateFmt";

describe("formatShortDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("прибирає рік для дат поточного року", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 8));
    expect(formatShortDate(new Date(2026, 7, 7))).toBe("7 серп");
  });

  it("показує повний рік для минулих років", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 8));
    expect(formatShortDate(new Date(2025, 7, 7))).toBe("7 серп 2025");
  });

  it("межу року бере з годинника пристрою (ADR-0078), не з Києва", () => {
    // 2026-01-01T00:30 у зоні пристрою — той самий рік, що й «зараз»,
    // хоча в UTC/Києві момент міг ще належати попередньому дню.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 30));
    expect(formatShortDate(new Date(2026, 0, 1, 0, 30))).not.toContain("2026");
  });

  it("повертає порожній рядок на нерозбірливій даті", () => {
    expect(formatShortDate("не дата")).toBe("");
  });
});
