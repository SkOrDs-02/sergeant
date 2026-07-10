// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStreakFlame } from "./useStreakFlame";

vi.mock("@shared/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

describe("useStreakFlame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides flame for zero streak", () => {
    const { result } = renderHook(() => useStreakFlame(0));
    expect(result.current.visible).toBe(false);
  });

  it("returns low intensity for short streaks", () => {
    const { result } = renderHook(() => useStreakFlame(3));
    expect(result.current.visible).toBe(true);
    expect(result.current.intensity).toBe("low");
    expect(result.current.count).toBe(3);
  });

  it("returns medium intensity from 7 days", () => {
    const { result } = renderHook(() => useStreakFlame(10));
    expect(result.current.intensity).toBe("medium");
  });

  it("returns strong intensity from 30 days", () => {
    const { result } = renderHook(() => useStreakFlame(45));
    expect(result.current.intensity).toBe("strong");
  });

  it("returns max intensity from 100 days", () => {
    const { result } = renderHook(() => useStreakFlame(120));
    expect(result.current.intensity).toBe("max");
  });
});
