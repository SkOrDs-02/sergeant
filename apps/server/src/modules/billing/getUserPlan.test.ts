import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { getUserPlan } from "./getUserPlan.js";

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
      ["user_abc"],
    );
  });
});

/**
 * AI-LEGACY: expires 2026-10-31 — знімається разом із рештою бета-інфраструктури.
 *
 * `BILLING_ALL_PRO` читається через Zod-схему `env/env.ts`, а вона парсить
 * `process.env` РАЗ при імпорті. Тому кожен кейс стабить env і пере-імпортує
 * модуль з чистого реєстру — той самий патерн, що в `requirePlan.test.ts`.
 */
async function loadGetUserPlan(allPro?: string) {
  if (allPro !== undefined) vi.stubEnv("BILLING_ALL_PRO", allPro);
  vi.resetModules();
  return (await import("./getUserPlan.js")).getUserPlan;
}

describe("getUserPlan × BILLING_ALL_PRO", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("віддає Pro будь-якому юзеру без рядка в subscriptions", async () => {
    const fn = await loadGetUserPlan("true");
    const pool = mockPool([]);
    const result = await fn(pool, "user_without_subscription");
    expect(result.plan).toBe("pro");
    expect(result.status).toBe("active");
    // Байпас має бути ДО запиту: інакше кожен виклик платить точковим
    // читанням `subscriptions` заради відповіді, яка від нього не залежить.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("не втручається, поки прапорець вимкнений", async () => {
    const fn = await loadGetUserPlan("false");
    const pool = mockPool([]);
    const result = await fn(pool, "user_without_subscription");
    expect(result.plan).toBe("free");
    expect(pool.query).toHaveBeenCalled();
  });

  it("незаданий прапорець дорівнює вимкненому", async () => {
    const fn = await loadGetUserPlan();
    const pool = mockPool([]);
    expect((await fn(pool, "user_1")).plan).toBe("free");
  });

  it("одруківка валить старт замість тихого Free", async () => {
    vi.stubEnv("BILLING_ALL_PRO", "yes");
    vi.resetModules();
    // Мовчазний фолбек на Free тут коштував би того, що бета-тестери
    // сидять на 5 запитах AI на добу, а ніхто про це не дізнається.
    await expect(import("./getUserPlan.js")).rejects.toThrow(/BILLING_ALL_PRO/);
  });
});
