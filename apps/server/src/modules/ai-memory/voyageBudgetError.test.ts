import { describe, expect, it } from "vitest";
import { VoyageSoftBudgetExceededError } from "./voyageBudgetError.js";

describe("VoyageSoftBudgetExceededError", () => {
  it("sets code, usage, threshold, dayKey and a formatted message", () => {
    const err = new VoyageSoftBudgetExceededError({
      usage: 1.23456,
      threshold: 1,
      dayKey: "2026-07-19",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("VoyageSoftBudgetExceededError");
    expect(err.code).toBe("VOYAGE_SOFT_BUDGET_EXCEEDED");
    expect(err.usage).toBe(1.23456);
    expect(err.threshold).toBe(1);
    expect(err.dayKey).toBe("2026-07-19");
    // Message rounds usage/threshold to 4 decimals for readability.
    expect(err.message).toBe(
      "Voyage soft daily budget exceeded ($1.2346 > $1.0000) for 2026-07-19; skipping non-critical embedding.",
    );
  });

  it("is catchable via instanceof across a try/catch boundary", () => {
    function throwIt(): never {
      throw new VoyageSoftBudgetExceededError({
        usage: 2,
        threshold: 1,
        dayKey: "2026-05-13",
      });
    }

    try {
      throwIt();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VoyageSoftBudgetExceededError);
      if (err instanceof VoyageSoftBudgetExceededError) {
        expect(err.dayKey).toBe("2026-05-13");
      }
    }
  });
});
