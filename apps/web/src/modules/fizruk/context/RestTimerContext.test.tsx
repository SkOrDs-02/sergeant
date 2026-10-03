// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRestTimer } from "./RestTimerContext";

describe("RestTimerContext", () => {
  it("useRestTimer throws outside provider", () => {
    expect(() => renderHook(() => useRestTimer())).toThrow(
      "useRestTimer must be used within <RestTimerProvider>",
    );
  });
});
