// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  initialTimeState,
  timeReducer,
  useRoutineTimeState,
} from "./useRoutineTimeState";

/**
 * Locks the time-state machine that powers the Routine calendar.
 *
 * The reducer encodes the previously-implicit transitions between
 * `timeMode` ("today" / "tomorrow" / "day" / "week" / "month"),
 * `monthCursor` and `selectedDay`. Each test below pins one of those
 * transitions so future refactors can't silently drop a behaviour.
 *
 * `vi.setSystemTime` freezes "today" so the assertions are stable
 * across local clocks.
 */
describe("timeReducer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wed 2025-06-04 — middle of the week, mid-month, mid-year so
    // every branch (week start, month bounds, etc.) is exercised
    // without crossing month / year boundaries unintentionally.
    vi.setSystemTime(new Date(2025, 5, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the initial state to today/today/current-month", () => {
    const s = initialTimeState();
    expect(s.timeMode).toBe("today");
    expect(s.selectedDay).toBe("2025-06-04");
    expect(s.monthCursor).toEqual({ y: 2025, m: 5 });
  });

  it("applyMode=today snaps selectedDay back to today", () => {
    const start = { ...initialTimeState(), selectedDay: "2024-01-01" };
    const next = timeReducer(start, { type: "applyMode", mode: "today" });
    expect(next.timeMode).toBe("today");
    expect(next.selectedDay).toBe("2025-06-04");
  });

  it("applyMode=tomorrow advances selectedDay by one day", () => {
    const next = timeReducer(initialTimeState(), {
      type: "applyMode",
      mode: "tomorrow",
    });
    expect(next.timeMode).toBe("tomorrow");
    expect(next.selectedDay).toBe("2025-06-05");
  });

  it("applyMode=month resets monthCursor to current month", () => {
    const start = { ...initialTimeState(), monthCursor: { y: 2024, m: 0 } };
    const next = timeReducer(start, { type: "applyMode", mode: "month" });
    expect(next.timeMode).toBe("month");
    expect(next.monthCursor).toEqual({ y: 2025, m: 5 });
  });

  it("goMonth wraps over December → January (and back)", () => {
    const dec = { ...initialTimeState(), monthCursor: { y: 2025, m: 11 } };
    const jan = timeReducer(dec, { type: "goMonth", delta: 1 });
    expect(jan.monthCursor).toEqual({ y: 2026, m: 0 });

    const back = timeReducer(jan, { type: "goMonth", delta: -1 });
    expect(back.monthCursor).toEqual({ y: 2025, m: 11 });
  });

  it("goToToday resets monthCursor and selectedDay simultaneously", () => {
    const drift = {
      timeMode: "month" as const,
      monthCursor: { y: 2024, m: 0 },
      selectedDay: "2024-01-15",
    };
    const next = timeReducer(drift, { type: "goToToday" });
    expect(next.monthCursor).toEqual({ y: 2025, m: 5 });
    expect(next.selectedDay).toBe("2025-06-04");
  });

  it("shiftWeekStrip jumps by 7 days and forces day-mode", () => {
    const start = {
      timeMode: "week" as const,
      monthCursor: { y: 2025, m: 5 },
      selectedDay: "2025-06-04",
    };
    const fwd = timeReducer(start, { type: "shiftWeekStrip", deltaWeeks: 1 });
    expect(fwd.timeMode).toBe("day");
    expect(fwd.selectedDay).toBe("2025-06-11");

    const back = timeReducer(fwd, { type: "shiftWeekStrip", deltaWeeks: -2 });
    expect(back.selectedDay).toBe("2025-05-28");
  });

  it("syncMonthRange clamps selectedDay back into the visible month", () => {
    const drift = {
      timeMode: "month" as const,
      monthCursor: { y: 2025, m: 5 }, // June 2025 → 06-01..06-30
      selectedDay: "2025-04-15", // outside the visible month
    };
    const next = timeReducer(drift, { type: "syncMonthRange" });
    expect(next.selectedDay).toBe("2025-06-01");
  });

  it("syncMonthRange is a no-op when selectedDay is in range", () => {
    const ok = {
      timeMode: "month" as const,
      monthCursor: { y: 2025, m: 5 },
      selectedDay: "2025-06-15",
    };
    const next = timeReducer(ok, { type: "syncMonthRange" });
    expect(next).toBe(ok);
  });

  it("deepLinkDay forces day-mode at the given key", () => {
    const next = timeReducer(initialTimeState(), {
      type: "deepLinkDay",
      selectedDay: "2025-12-31",
    });
    expect(next.timeMode).toBe("day");
    expect(next.selectedDay).toBe("2025-12-31");
  });
});

describe("useRoutineTimeState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes stable callback identities across re-renders", () => {
    const { result, rerender } = renderHook(() => useRoutineTimeState());
    const first = {
      goMonth: result.current.goMonth,
      goToToday: result.current.goToToday,
      applyTimeMode: result.current.applyTimeMode,
      deepLinkDay: result.current.deepLinkDay,
    };

    rerender();

    expect(result.current.goMonth).toBe(first.goMonth);
    expect(result.current.goToToday).toBe(first.goToToday);
    expect(result.current.applyTimeMode).toBe(first.applyTimeMode);
    expect(result.current.deepLinkDay).toBe(first.deepLinkDay);
  });

  it("syncMonthRange runs on monthCursor change to clamp selectedDay", () => {
    const { result } = renderHook(() => useRoutineTimeState());

    // Force month-mode + a selectedDay that won't be in May 2025
    act(() => {
      result.current.applyTimeMode("month");
    });
    act(() => {
      result.current.setSelectedDay("2025-06-30");
    });
    act(() => {
      result.current.goMonth(-1); // → May 2025 (01..31)
    });

    // After the goMonth dispatch fires, the syncMonthRange effect
    // should clamp the day to the start of May since 06-30 falls
    // outside that month's bounds.
    expect(result.current.monthCursor).toEqual({ y: 2025, m: 4 });
    expect(result.current.selectedDay).toBe("2025-05-01");
  });

  it("setSelectedDay accepts a function updater", () => {
    const { result } = renderHook(() => useRoutineTimeState());
    act(() => {
      result.current.setSelectedDay("2025-06-04");
    });
    act(() => {
      result.current.setSelectedDay((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 3);
        return d.toISOString().slice(0, 10);
      });
    });
    expect(result.current.selectedDay).toBe("2025-06-07");
  });

  it("setTimeMode accepts a function updater", () => {
    const { result } = renderHook(() => useRoutineTimeState());
    act(() => {
      result.current.setTimeMode((prev) => (prev === "today" ? "week" : prev));
    });
    expect(result.current.timeMode).toBe("week");
  });
});
