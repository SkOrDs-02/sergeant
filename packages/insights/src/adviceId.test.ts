import { describe, expect, it } from "vitest";
import { computeAdviceId } from "./adviceId.js";

describe("computeAdviceId", () => {
  it("is deterministic — same inputs always produce the same id", () => {
    const a = computeAdviceId("finyk-budget-overrun", "budget_over_food");
    const b = computeAdviceId("finyk-budget-overrun", "budget_over_food");
    expect(a).toBe(b);
  });

  it("differs when adviceType differs, content held constant", () => {
    const a = computeAdviceId("finyk-budget-overrun", "food");
    const b = computeAdviceId("finyk-coffee-limit", "food");
    expect(a).not.toBe(b);
  });

  it("differs when content differs, adviceType held constant", () => {
    const a = computeAdviceId("finyk-budget-overrun", "budget_over_food");
    const b = computeAdviceId("finyk-budget-overrun", "budget_over_transport");
    expect(a).not.toBe(b);
  });

  it("is stable across two independent 'devices' (no shared state)", () => {
    // Simulates two separate processes computing the same id independently
    // — the whole point of replacing the old random-uuid-per-session id.
    const deviceA = computeAdviceId("routine-streak-7-days", "h1");
    const deviceB = computeAdviceId("routine-streak-7-days", "h1");
    expect(deviceA).toBe(deviceB);
  });

  it("has the expected fixed shape: adv- prefix + 16 hex chars", () => {
    const id = computeAdviceId("finyk-budget-overrun", "budget_over_food");
    expect(id).toMatch(/^adv-[0-9a-f]{16}$/);
  });

  it("does not throw on empty strings", () => {
    expect(() => computeAdviceId("", "")).not.toThrow();
  });
});
