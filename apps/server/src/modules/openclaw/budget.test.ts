import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { checkDailyBudget, estimateClaudeSonnetCostUsd } from "./budget.js";

function makeFakePool(spentUsd: number): Pool {
  return {
    async query() {
      return {
        rows: [{ total: String(spentUsd) }],
        rowCount: 1,
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
}

describe("estimateClaudeSonnetCostUsd", () => {
  it("computes input + output cost", () => {
    // 1M input + 1M output ≈ $3 + $15 = $18
    const cost = estimateClaudeSonnetCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18, 1);
  });

  it("returns 0 for zero usage", () => {
    expect(
      estimateClaudeSonnetCostUsd({ inputTokens: 0, outputTokens: 0 }),
    ).toBe(0);
  });

  it("includes cache pricing", () => {
    // 1M cache-read tokens ≈ $0.30 (10% of base input)
    const cost = estimateClaudeSonnetCostUsd({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1);
  });
});

describe("checkDailyBudget", () => {
  it("admits when spent is well below cap", async () => {
    const pool = makeFakePool(0.5);
    const r = await checkDailyBudget(pool, "founder-id");
    expect(r.allowed).toBe(true);
    expect(r.spentUsd).toBe(0.5);
    expect(r.remainingUsd).toBeGreaterThan(0);
  });

  it("denies when spent exceeds 95% of cap", async () => {
    // OPENCLAW_DAILY_USD_BUDGET defaults to 5; 95% = 4.75.
    const pool = makeFakePool(4.9);
    const r = await checkDailyBudget(pool, "founder-id");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it("denies at exactly the budget cap", async () => {
    const pool = makeFakePool(5.0);
    const r = await checkDailyBudget(pool, "founder-id");
    expect(r.allowed).toBe(false);
  });

  it("denies above the budget cap", async () => {
    const pool = makeFakePool(7.5);
    const r = await checkDailyBudget(pool, "founder-id");
    expect(r.allowed).toBe(false);
    expect(r.remainingUsd).toBeLessThanOrEqual(0);
  });
});
