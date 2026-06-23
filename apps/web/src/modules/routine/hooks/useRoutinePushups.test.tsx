/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadMock, addRepsMock, dateKeyMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  addRepsMock: vi.fn(),
  dateKeyMock: vi.fn(),
}));

vi.mock("../lib/routineStorage", () => ({
  loadRoutineState: loadMock,
  addPushupReps: addRepsMock,
  ROUTINE_EVENT: "hub-routine-storage",
}));
vi.mock("../lib/hubCalendarAggregate", () => ({
  dateKeyFromDate: dateKeyMock,
}));

import { useRoutinePushups } from "./useRoutinePushups";

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("useRoutinePushups", () => {
  beforeEach(() => {
    loadMock.mockReset();
    addRepsMock.mockReset();
    dateKeyMock.mockReset().mockImplementation((d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes today's count and a 30-day history", () => {
    const today = isoDay(0);
    loadMock.mockReturnValue({ pushupsByDate: { [today]: 42 } });
    const { result } = renderHook(() => useRoutinePushups());
    expect(result.current.todayCount).toBe(42);
    expect(result.current.history).toHaveLength(30);
    expect(result.current.recentHistory).toHaveLength(7);
    // last history entry is today
    expect(result.current.history.at(-1)).toEqual({ date: today, total: 42 });
  });

  it("defaults to zero when pushupsByDate is missing", () => {
    loadMock.mockReturnValue({});
    const { result } = renderHook(() => useRoutinePushups());
    expect(result.current.todayCount).toBe(0);
    expect(result.current.history.every((e) => e.total === 0)).toBe(true);
  });

  it("addReps loads fresh state and updates the snapshot", () => {
    const today = isoDay(0);
    loadMock.mockReturnValue({ pushupsByDate: {} });
    addRepsMock.mockReturnValue({ pushupsByDate: { [today]: 10 } });
    const { result } = renderHook(() => useRoutinePushups());
    act(() => {
      result.current.addReps(10);
    });
    expect(addRepsMock).toHaveBeenCalledWith(expect.anything(), 10);
    expect(result.current.todayCount).toBe(10);
  });

  it("re-syncs from storage on the routine storage event", () => {
    const today = isoDay(0);
    loadMock.mockReturnValue({ pushupsByDate: { [today]: 1 } });
    const { result } = renderHook(() => useRoutinePushups());
    expect(result.current.todayCount).toBe(1);

    loadMock.mockReturnValue({ pushupsByDate: { [today]: 99 } });
    act(() => {
      window.dispatchEvent(new CustomEvent("hub-routine-storage"));
    });
    expect(result.current.todayCount).toBe(99);
  });
});
