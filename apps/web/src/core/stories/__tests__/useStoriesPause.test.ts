// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoriesPause } from "../hooks/useStoriesPause";

describe("useStoriesPause", () => {
  it("is not paused by default", () => {
    const { result } = renderHook(() => useStoriesPause());
    expect(result.current.isPaused).toBe(false);
    expect(result.current.reason).toBe(null);
  });

  it("setHold toggles pause with reason 'hold'", () => {
    const { result } = renderHook(() => useStoriesPause());
    act(() => result.current.setHold(true));
    expect(result.current.isPaused).toBe(true);
    expect(result.current.reason).toBe("hold");
    act(() => result.current.setHold(false));
    expect(result.current.isPaused).toBe(false);
  });

  it("toggleExplicit flips explicit pause", () => {
    const { result } = renderHook(() => useStoriesPause());
    act(() => result.current.toggleExplicit());
    expect(result.current.reason).toBe("explicit");
    act(() => result.current.toggleExplicit());
    expect(result.current.reason).toBe(null);
  });

  it("drag > hold > explicit priority ordering for reason", () => {
    const { result } = renderHook(() => useStoriesPause());
    act(() => result.current.toggleExplicit());
    expect(result.current.reason).toBe("explicit");
    act(() => result.current.setHold(true));
    expect(result.current.reason).toBe("hold");
    act(() => result.current.setDragging(true));
    expect(result.current.reason).toBe("drag");
    // still paused even after removing drag — hold still active
    act(() => result.current.setDragging(false));
    expect(result.current.reason).toBe("hold");
    // removing hold falls back to explicit
    act(() => result.current.setHold(false));
    expect(result.current.reason).toBe("explicit");
  });

  it("gesture-originated reasons do not clear explicit pause", () => {
    const { result } = renderHook(() => useStoriesPause());
    act(() => result.current.toggleExplicit());
    act(() => result.current.setHold(true));
    act(() => result.current.setHold(false));
    // explicit should survive the hold cycle
    expect(result.current.reason).toBe("explicit");
    expect(result.current.isPaused).toBe(true);
  });

  it("clearExplicit drops only the explicit reason", () => {
    const { result } = renderHook(() => useStoriesPause());
    act(() => result.current.toggleExplicit());
    act(() => result.current.setHold(true));
    act(() => result.current.clearExplicit());
    // still paused because of hold
    expect(result.current.reason).toBe("hold");
  });
});
