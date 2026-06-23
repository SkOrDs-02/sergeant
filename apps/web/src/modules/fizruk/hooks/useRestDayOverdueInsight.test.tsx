// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { useRestDayOverdueInsight } from "./useRestDayOverdueInsight";

function completed(id: string, endedAt: string | null): Workout {
  return {
    id,
    startedAt: endedAt ?? "2024-01-01T10:00:00Z",
    endedAt,
    items: [],
  } as unknown as Workout;
}

describe("useRestDayOverdueInsight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-10T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null until loaded", () => {
    const { result } = renderHook(() =>
      useRestDayOverdueInsight(
        [completed("w1", "2024-01-01T10:00:00Z")],
        false,
      ),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when the user never trained (no completed workouts)", () => {
    const { result } = renderHook(() =>
      useRestDayOverdueInsight([completed("w1", null)], true),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when last workout is within the threshold", () => {
    const { result } = renderHook(() =>
      useRestDayOverdueInsight([completed("w1", "2024-01-09T10:00:00Z")], true),
    );
    expect(result.current).toBeNull();
  });

  it("fires the overdue insight after >= 3 rest days", () => {
    const { result } = renderHook(() =>
      useRestDayOverdueInsight([completed("w1", "2024-01-01T10:00:00Z")], true),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.id).toBe("fizruk-rest-day-overdue");
    expect(result.current!.title).toContain("без тренування");
    expect(result.current!.action).toEqual({
      type: "navigate",
      path: "/fizruk/workouts",
    });
  });

  it("uses the most recent completed workout for the gap", () => {
    const { result } = renderHook(() =>
      useRestDayOverdueInsight(
        [
          completed("old", "2024-01-01T10:00:00Z"),
          completed("recent", "2024-01-09T10:00:00Z"),
        ],
        true,
      ),
    );
    // recent is within threshold → no insight
    expect(result.current).toBeNull();
  });
});
