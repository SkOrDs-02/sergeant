/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMock, setPrefMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  setPrefMock: vi.fn(),
}));

vi.mock("../lib/routineStorage", () => ({
  ROUTINE_EVENT: "hub-routine-storage",
  ROUTINE_STORAGE_KEY: "hub_routine_v1",
  loadRoutineState: loadMock,
  setPref: setPrefMock,
}));

import { useRoutineState } from "./useRoutineState";

describe("useRoutineState", () => {
  beforeEach(() => {
    loadMock.mockReset().mockReturnValue({ prefs: { a: 1 } });
    setPrefMock.mockReset();
  });

  it("seeds state from loadRoutineState", () => {
    const { result } = renderHook(() => useRoutineState());
    expect(result.current.routine).toEqual({ prefs: { a: 1 } });
  });

  it("re-reads state on the routine event", () => {
    const { result } = renderHook(() => useRoutineState());
    loadMock.mockReturnValue({ prefs: { a: 2 } });
    act(() => {
      window.dispatchEvent(new CustomEvent("hub-routine-storage"));
    });
    expect(result.current.routine).toEqual({ prefs: { a: 2 } });
  });

  it("re-reads on a matching storage event and ignores others", () => {
    const { result } = renderHook(() => useRoutineState());
    loadMock.mockReturnValue({ prefs: { a: 3 } });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "other_key" }));
    });
    expect(result.current.routine).toEqual({ prefs: { a: 1 } });
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "hub_routine_v1" }),
      );
    });
    expect(result.current.routine).toEqual({ prefs: { a: 3 } });
  });

  it("updatePref runs setPref against the current state", () => {
    setPrefMock.mockImplementation((s, key, value) => ({
      ...s,
      prefs: { ...s.prefs, [key]: value },
    }));
    const { result } = renderHook(() => useRoutineState());
    act(() => {
      result.current.updatePref("b", 9);
    });
    expect(setPrefMock).toHaveBeenCalled();
    expect(result.current.routine.prefs).toMatchObject({ b: 9 });
  });
});
