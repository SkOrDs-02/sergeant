import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { accessStateOf, getUserPlan } from "./getUserPlan.js";

function mockPool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
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

  it("grants pro to a founder id without querying the DB", async () => {
    vi.stubEnv("AI_QUOTA_FOUNDER_IDS", "founder_1,founder_2");
    const pool = mockPool([]);
    const result = await getUserPlan(pool, "founder_2");
    expect(result.plan).toBe("pro");
    expect(pool.query).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("leaves a non-founder user on the normal DB-driven plan", async () => {
    vi.stubEnv("AI_QUOTA_FOUNDER_IDS", "founder_1");
    const pool = mockPool([]);
    const result = await getUserPlan(pool, "user_1");
    expect(result.plan).toBe("free");
    expect(pool.query).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("queries with the correct userId parameter", async () => {
    const pool = mockPool([]);
    await getUserPlan(pool, "user_abc");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM subscriptions"),
      ["user_abc", 3],
    );
  });
});

describe("accessStateOf (trial і grace, спека access-tiers)", () => {
  const NOW = new Date("2026-06-10T12:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  const at = (days: number) => new Date(NOW.getTime() + days * DAY);

  it("past_due: grace при current_period_end − 2 дні, free при − 4 дні", async () => {
    for (const [endDays, expected] of [
      [-2, "grace"],
      [-4, "free"],
    ] as const) {
      const pool = mockPool([
        {
          plan: "pro",
          status: "past_due",
          current_period_end: at(endDays),
          cancel_at_period_end: false,
          provider: "liqpay",
          grace_period_ends_at: null,
        },
      ]);
      const plan = await getUserPlan(pool, "user_1");
      expect(accessStateOf(plan, NOW)).toBe(expected);
    }
  });

  it("past_due: явний grace_period_ends_at перекриває fallback 3 дні", async () => {
    const pool = mockPool([
      {
        plan: "pro",
        status: "past_due",
        current_period_end: at(-10),
        cancel_at_period_end: false,
        provider: "liqpay",
        grace_period_ends_at: at(1),
      },
    ]);
    const plan = await getUserPlan(pool, "user_1");
    expect(plan.graceEndsAt).toEqual(at(1));
    expect(accessStateOf(plan, NOW)).toBe("grace");
  });

  it("trialing: trial до кінця періоду, на 8-й день free", () => {
    const base = {
      plan: "pro" as const,
      status: "trialing",
      cancelAtPeriodEnd: false,
      provider: "manual",
    };
    expect(accessStateOf({ ...base, currentPeriodEnd: at(1) }, NOW)).toBe(
      "trial",
    );
    expect(accessStateOf({ ...base, currentPeriodEnd: at(-1) }, NOW)).toBe(
      "free",
    );
  });

  it("SQL віддає trialing лише з майбутнім кінцем, а past_due лише в grace", async () => {
    const pool = mockPool([]);
    await getUserPlan(pool, "user_1");
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(sql).toMatch(/status IN \('active', 'trialing'\)/);
    expect(sql).toMatch(/current_period_end > NOW\(\)/);
    expect(sql).toMatch(
      /COALESCE\(grace_period_ends_at,\s+current_period_end \+ make_interval\(days => \$2\)\) > NOW\(\)/,
    );
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual([
      "user_1",
      3,
    ]);
  });

  it("founder → pro", async () => {
    vi.stubEnv("AI_QUOTA_FOUNDER_IDS", "founder_1");
    const plan = await getUserPlan(mockPool([]), "founder_1");
    expect(accessStateOf(plan, NOW)).toBe("pro");
    vi.unstubAllEnvs();
  });
});
