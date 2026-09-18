// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MONTHLY_PLAN_STORAGE_KEY } from "@sergeant/fizruk-domain";
import { useMonthlyPlan } from "./useMonthlyPlan";

describe("useMonthlyPlan", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts from defaults", () => {
    const { result } = renderHook(() => useMonthlyPlan());
    expect(result.current.reminderEnabled).toBe(true);
    expect(result.current.reminderHour).toBe(18);
    expect(result.current.reminderMinute).toBe(0);
    expect(result.current.days).toEqual({});
  });

  it("hydrates persisted state and coerces invalid fields", () => {
    localStorage.setItem(
      MONTHLY_PLAN_STORAGE_KEY,
      JSON.stringify({
        reminderEnabled: false,
        reminderHour: "bad",
        reminderMinute: "bad",
        days: { "2024-01-01": { templateId: "t" } },
      }),
    );
    const { result } = renderHook(() => useMonthlyPlan());
    expect(result.current.reminderEnabled).toBe(false);
    expect(result.current.reminderHour).toBe(18);
    expect(result.current.reminderMinute).toBe(0);
    expect(result.current.getTemplateForDate("2024-01-01")).toBe("t");
  });

  it("setReminder clamps hour and minute into range", () => {
    const { result } = renderHook(() => useMonthlyPlan());
    act(() => result.current.setReminder(99, -10));
    expect(result.current.reminderHour).toBe(23);
    expect(result.current.reminderMinute).toBe(0);
    act(() => result.current.setReminder(7, 30));
    expect(result.current.reminderHour).toBe(7);
    expect(result.current.reminderMinute).toBe(30);
  });

  it("setReminderEnabled toggles state (SQLite persist covered by integration)", () => {
    // Teardown Phase 3 — LS write-mirror removed; persistence flows through
    // the SQLite dual-write pipeline. Unit test asserts hook state only.
    const { result } = renderHook(() => useMonthlyPlan());
    act(() => result.current.setReminderEnabled(false));
    expect(result.current.reminderEnabled).toBe(false);
  });

  it("setDayTemplate sets and clears a day", () => {
    const { result } = renderHook(() => useMonthlyPlan());
    act(() => result.current.setDayTemplate("2024-02-01", "tpl-1"));
    expect(result.current.getTemplateForDate("2024-02-01")).toBe("tpl-1");
    act(() => result.current.setDayTemplate("2024-02-01", null));
    expect(result.current.getTemplateForDate("2024-02-01")).toBeNull();
    act(() => result.current.setDayTemplate("2024-02-02", ""));
    expect(result.current.getTemplateForDate("2024-02-02")).toBeNull();
  });

  it("todayTemplateId reflects the plan for today's key", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T10:00:00Z"));
    const { result } = renderHook(() => useMonthlyPlan());
    const todayKey = result.current.getTodayDateKey();
    act(() => result.current.setDayTemplate(todayKey, "today-tpl"));
    expect(result.current.todayTemplateId).toBe("today-tpl");
  });

  // Removed (teardown Phase 3): the "fizruk-storage-monthly-plan" custom-event
  // + storage-listener sync was LS-coupled (loadState read localStorage) and
  // reset state to defaults once the LS write-mirror was dropped. Cross-instance
  // sync for the singleton plan now relies on the SQLite overlay tick — there is
  // no LS event to react to.
});
