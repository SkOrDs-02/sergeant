import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { grantReverseTrial } from "./reverseTrial.js";
import { accessStateOf } from "./getUserPlan.js";

function mockPool(impl: () => Promise<unknown>) {
  return { query: vi.fn(impl) } as unknown as Pool & {
    query: ReturnType<typeof vi.fn>;
  };
}

describe("grantReverseTrial", () => {
  it("без прапорця нічого не пише (дефолт env = false)", async () => {
    const pool = mockPool(async () => ({ rowCount: 1 }));
    expect(await grantReverseTrial(pool, "u1")).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("з прапорцем вставляє trialing-рядок на 7 днів, один на акаунт", async () => {
    const pool = mockPool(async () => ({ rowCount: 1 }));
    expect(await grantReverseTrial(pool, "u1", true)).toBe(true);
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO subscriptions/);
    expect(sql).toMatch(/'pro', 'trialing', 'manual'/);
    expect(sql).toMatch(/make_interval\(days => \$2\)/);
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/);
    expect(params).toEqual(["u1", 7]);
  });

  it("помилка вставки не валить реєстрацію", async () => {
    const pool = mockPool(async () => {
      throw new Error("db down");
    });
    await expect(grantReverseTrial(pool, "u1", true)).resolves.toBe(false);
  });

  it("на 8-й день trial-рядок дає free", () => {
    const created = new Date("2026-06-01T10:00:00Z");
    const trialEnd = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
    const plan = {
      plan: "pro" as const,
      status: "trialing",
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
      provider: "manual",
    };
    expect(accessStateOf(plan, new Date("2026-06-07T10:00:00Z"))).toBe("trial");
    expect(accessStateOf(plan, new Date("2026-06-08T10:00:01Z"))).toBe("free");
  });
});
