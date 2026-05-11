import { describe, expect, it, vi } from "vitest";
import { getUserPlan } from "./getUserPlan.js";

function mockPool(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as any;
}

describe("getUserPlan", () => {
  it("returns free plan when no subscription row exists", async () => {
    const pool = mockPool([]);
    const result = await getUserPlan(pool, "user_1");
    expect(result.plan).toBe("free");
    expect(result.status).toBe("active");
    expect(result.currentPeriodEnd).toBeNull();
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.provider).toBe("manual");
  });

  it("returns pro plan from active subscription row", async () => {
    const pool = mockPool([
      {
        plan: "pro",
        status: "active",
        current_period_end: new Date("2026-06-11"),
        cancel_at_period_end: false,
        provider: "stripe",
      },
    ]);
    const result = await getUserPlan(pool, "user_1");
    expect(result.plan).toBe("pro");
    expect(result.status).toBe("active");
    expect(result.provider).toBe("stripe");
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.currentPeriodEnd).toEqual(new Date("2026-06-11"));
  });

  it("returns pro plan from trialing subscription row", async () => {
    const pool = mockPool([
      {
        plan: "pro",
        status: "trialing",
        current_period_end: new Date("2026-07-01"),
        cancel_at_period_end: true,
        provider: "apple",
      },
    ]);
    const result = await getUserPlan(pool, "user_2");
    expect(result.plan).toBe("pro");
    expect(result.status).toBe("trialing");
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(result.provider).toBe("apple");
  });

  it("queries with the correct userId parameter", async () => {
    const pool = mockPool([]);
    await getUserPlan(pool, "user_abc");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM subscriptions"),
      ["user_abc"],
    );
  });
});
