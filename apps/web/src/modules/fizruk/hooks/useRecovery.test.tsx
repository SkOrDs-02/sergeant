// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRecovery } from "./useRecovery";

describe("useRecovery", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns recovery stats with empty data without throwing", () => {
    const { result } = renderHook(() => useRecovery());
    expect(result.current).toHaveProperty("by");
    expect(result.current).toHaveProperty("list");
    expect(Array.isArray(result.current.ready)).toBe(true);
    expect(Array.isArray(result.current.avoid)).toBe(true);
    expect(typeof result.current.wellbeingMult).toBe("number");
  });

  it("limits ready/avoid lists to at most 4 entries", () => {
    const { result } = renderHook(() => useRecovery());
    expect(result.current.ready.length).toBeLessThanOrEqual(4);
    expect(result.current.avoid.length).toBeLessThanOrEqual(4);
  });
});
