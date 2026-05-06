/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { FIZRUK_NAV } from "./fizrukNav";

describe("FIZRUK_NAV", () => {
  it("has dashboard as the first tab with the unified «Огляд» label (UX roast 2026-Q2 C1)", () => {
    const first = FIZRUK_NAV[0];
    expect(first?.id).toBe("dashboard");
    expect(first?.label).toBe("Огляд");
  });

  it("preserves remaining tab order: workouts → plan → progress → body", () => {
    expect(FIZRUK_NAV.map((item) => item.id)).toEqual([
      "dashboard",
      "workouts",
      "plan",
      "progress",
      "body",
    ]);
  });
});
