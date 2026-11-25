import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Лічильник лімітера підмінено на in-memory з тією самою семантикою
 * `getPerTargetRateLimit` (фіксоване вікно, `count > limit` блокує): тест
 * перевіряє бюджет (ключі, вікна, стелі), а не Redis/Postgres-шар, який
 * покривають тести `http/rateLimit`.
 */
const h = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
    envOverrides: {} as Record<string, unknown>,
    getPerTargetRateLimit: vi.fn(
      async (
        key: string,
        subject: string,
        opts: { limit: number; windowMs: number },
      ) => {
        const k = `${key}|${subject}`;
        const count = (counts.get(k) ?? 0) + 1;
        counts.set(k, count);
        return {
          ok: count <= opts.limit,
          remaining: Math.max(0, opts.limit - count),
          resetMs: opts.windowMs,
          retryAfterSec: 1,
        };
      },
    ),
    recordExternalHttp: vi.fn(),
    warn: vi.fn(),
  };
});

vi.mock("../../http/rateLimit.js", () => ({
  getPerTargetRateLimit: h.getPerTargetRateLimit,
}));
vi.mock("../../lib/externalHttp.js", () => ({
  recordExternalHttp: h.recordExternalHttp,
}));
vi.mock("../../obs/logger.js", () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../env.js", () => ({
  env: new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) => h.envOverrides[prop],
  }),
}));

const {
  tryConsumeUpstreamBudget,
  consumeUpstreamBudgetOrThrow,
  UPSTREAM_BUDGET_EXHAUSTED,
  __resetUpstreamBudgetWarnsForTests,
  UPCITEMDB_DEFAULT_DAILY_BUDGET,
  USDA_KEYED_DEFAULT_HOURLY_BUDGET,
  USDA_DEMO_HOURLY_BUDGET,
  USDA_DEMO_DAILY_BUDGET,
} = await import("./upstreamBudget.js");

const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

async function drain(
  upstream: "usda" | "upcitemdb",
  keyed: boolean,
  n: number,
): Promise<boolean[]> {
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await tryConsumeUpstreamBudget(upstream, { keyed }));
  }
  return out;
}

describe("tryConsumeUpstreamBudget", () => {
  beforeEach(() => {
    h.counts.clear();
    h.envOverrides = {};
    h.getPerTargetRateLimit.mockClear();
    h.recordExternalHttp.mockClear();
    h.warn.mockClear();
    __resetUpstreamBudgetWarnsForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:15:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("UPCitemdb: 90 запитів на UTC-добу, 91-й пропускається — нижче стелі тріалу 100", async () => {
    expect(UPCITEMDB_DEFAULT_DAILY_BUDGET).toBeLessThan(100);
    const results = await drain(
      "upcitemdb",
      false,
      UPCITEMDB_DEFAULT_DAILY_BUDGET + 1,
    );
    expect(results.filter(Boolean)).toHaveLength(
      UPCITEMDB_DEFAULT_DAILY_BUDGET,
    );
    expect(results.at(-1)).toBe(false);

    const dayIndex = Math.floor(Date.now() / DAY_MS);
    expect(h.getPerTargetRateLimit).toHaveBeenCalledWith(
      "upstream-budget:upcitemdb:day",
      `demo:${dayIndex}`,
      { limit: UPCITEMDB_DEFAULT_DAILY_BUDGET, windowMs: DAY_MS },
    );
    expect(h.recordExternalHttp).toHaveBeenCalledWith(
      "upcitemdb",
      "budget_exhausted",
    );
  });

  it("лічильник глобальний: subject не залежить від клієнта, лише від вікна", async () => {
    await drain("upcitemdb", false, 3);
    const subjects = new Set(
      h.getPerTargetRateLimit.mock.calls.map((c) => c[1]),
    );
    expect(subjects.size).toBe(1);
  });

  it("нова UTC-доба дає новий бюджет", async () => {
    await drain("upcitemdb", false, UPCITEMDB_DEFAULT_DAILY_BUDGET);
    expect(await tryConsumeUpstreamBudget("upcitemdb", { keyed: false })).toBe(
      false,
    );
    vi.setSystemTime(new Date("2026-11-22T00:00:01Z"));
    expect(await tryConsumeUpstreamBudget("upcitemdb", { keyed: false })).toBe(
      true,
    );
  });

  it("UPCITEMDB_DAILY_BUDGET перекриває дефолт", async () => {
    h.envOverrides["UPCITEMDB_DAILY_BUDGET"] = 2;
    expect(await drain("upcitemdb", true, 3)).toEqual([true, true, false]);
  });

  it("USDA з ключем: годинний бюджет 450, половина ковзної стелі 1000", async () => {
    expect(USDA_KEYED_DEFAULT_HOURLY_BUDGET * 2).toBeLessThanOrEqual(1000);
    const results = await drain(
      "usda",
      true,
      USDA_KEYED_DEFAULT_HOURLY_BUDGET + 1,
    );
    expect(results.filter(Boolean)).toHaveLength(
      USDA_KEYED_DEFAULT_HOURLY_BUDGET,
    );
    expect(results.at(-1)).toBe(false);
    expect(h.getPerTargetRateLimit).toHaveBeenCalledWith(
      "upstream-budget:usda:hour",
      `key:${Math.floor(Date.now() / HOUR_MS)}`,
      { limit: USDA_KEYED_DEFAULT_HOURLY_BUDGET, windowMs: HOUR_MS },
    );
  });

  it("USDA на DEMO_KEY: 15 на годину і 45 на добу, окремо від лічильника з ключем", async () => {
    expect((await drain("usda", false, 16)).filter(Boolean)).toHaveLength(
      USDA_DEMO_HOURLY_BUDGET,
    );
    // Власний ключ не ділить лічильник із DEMO_KEY.
    expect(await tryConsumeUpstreamBudget("usda", { keyed: true })).toBe(true);

    // Наступні години: годинне вікно оновлюється, добова стеля 45 тримає.
    let allowed = USDA_DEMO_HOURLY_BUDGET;
    for (let hour = 11; hour <= 16; hour++) {
      vi.setSystemTime(new Date(`2026-11-21T${hour}:05:00Z`));
      allowed += (await drain("usda", false, 20)).filter(Boolean).length;
    }
    expect(allowed).toBe(USDA_DEMO_DAILY_BUDGET);
    expect(USDA_DEMO_DAILY_BUDGET).toBeLessThan(50);
  });

  it("consumeUpstreamBudgetOrThrow кидає іменовану помилку, а не повертає miss (G5)", async () => {
    h.envOverrides["UPCITEMDB_DAILY_BUDGET"] = 1;
    await expect(
      consumeUpstreamBudgetOrThrow("upcitemdb", { keyed: false }),
    ).resolves.toBeUndefined();
    await expect(
      consumeUpstreamBudgetOrThrow("upcitemdb", { keyed: false }),
    ).rejects.toMatchObject({ name: UPSTREAM_BUDGET_EXHAUSTED });
  });

  it("warn про вичерпання один на вікно, а не на кожен пропущений запит", async () => {
    h.envOverrides["UPCITEMDB_DAILY_BUDGET"] = 1;
    await drain("upcitemdb", false, 5);
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(h.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "nutrition_upstream_budget_exhausted",
        upstream: "upcitemdb",
        limit: 1,
      }),
    );
    expect(h.recordExternalHttp).toHaveBeenCalledTimes(4);
  });
});
