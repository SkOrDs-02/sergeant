// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFizrukInsights } from "./useFizrukInsights";

describe("useFizrukInsights", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an array (empty when no workouts loaded) and never exceeds 2", () => {
    const { result } = renderHook(() => useFizrukInsights());
    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current.length).toBeLessThanOrEqual(2);
  });
});
