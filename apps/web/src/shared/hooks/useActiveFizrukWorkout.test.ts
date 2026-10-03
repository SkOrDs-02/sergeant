// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveFizrukWorkout } from "./useActiveFizrukWorkout";

const ACTIVE_KEY = "fizruk_active_workout_id_v1";
const sqliteState = vi.hoisted(() => ({
  tick: 0,
  refreshedAt: null as string | null,
  workouts: [] as Array<{ id: string; endedAt: string | null }>,
}));

vi.mock("@fizruk/lib/sqliteReadGate", () => ({
  useFizrukSqliteReadTick: () => sqliteState.tick,
}));

vi.mock("@fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => ({
    refreshedAt: sqliteState.refreshedAt,
    workouts: sqliteState.workouts,
  }),
}));

function warmCache(
  workouts: Array<{ id: string; endedAt: string | null }>,
): void {
  sqliteState.refreshedAt = "2026-08-01T12:00:00.000Z";
  sqliteState.workouts = workouts;
}

describe("useActiveFizrukWorkout", () => {
  beforeEach(() => {
    localStorage.clear();
    sqliteState.tick = 0;
    sqliteState.refreshedAt = null;
    sqliteState.workouts = [];
  });

  it("returns null when no active id is persisted", () => {
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBeNull();
  });

  it("returns the active id when the referenced workout exists and is in progress", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    warmCache([{ id: "w-1", endedAt: null }]);
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBe("w-1");
  });

  it("treats the pointer as stale when the referenced workout is missing and clears the key", () => {
    localStorage.setItem(ACTIVE_KEY, "w-gone");
    warmCache([{ id: "w-other", endedAt: null }]);
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("treats the pointer as stale when the referenced workout is already ended and clears the key", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    warmCache([{ id: "w-1", endedAt: "2026-04-20T10:00:00Z" }]);
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("clears the pointer when the warm cache is loaded and has no workouts", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    warmCache([]);
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("keeps the pointer while the SQLite warm cache is still cold", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBe("w-1");
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("w-1");
  });

  it("re-validates on the SQLite tick instead of polling", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    const { result, rerender } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBe("w-1");

    act(() => {
      warmCache([{ id: "w-1", endedAt: "2026-08-01T12:30:00.000Z" }]);
      sqliteState.tick += 1;
      rerender();
    });
    expect(result.current).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("reacts to another tab changing the active pointer", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    warmCache([
      { id: "w-1", endedAt: null },
      { id: "w-2", endedAt: null },
    ]);
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBe("w-1");

    act(() => {
      localStorage.setItem(ACTIVE_KEY, "w-2");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: ACTIVE_KEY,
          newValue: "w-2",
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current).toBe("w-2");
  });

  it("reacts to a logout that clears storage entirely", () => {
    localStorage.setItem(ACTIVE_KEY, "w-1");
    warmCache([{ id: "w-1", endedAt: null }]);
    const { result } = renderHook(() => useActiveFizrukWorkout());
    expect(result.current).toBe("w-1");

    act(() => {
      localStorage.clear();
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current).toBeNull();
  });
});
