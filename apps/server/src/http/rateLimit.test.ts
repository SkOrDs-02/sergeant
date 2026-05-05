import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

// Metrics are a global singleton — reset between tests so label counts don't
// leak across cases. Inline mock keeps test isolation tight.
vi.mock("../obs/metrics.js", async () => {
  const actual = await vi.importActual("../obs/metrics.js");
  return {
    ...actual,
    rateLimitHitsTotal: { inc: vi.fn() },
  };
});

const redisEvalMock = vi.fn();
vi.mock("../lib/redis.js", () => ({
  getRedis: vi.fn(() => null),
}));

// Postgres mock — `checkRateLimitPg` and the periodic sweep query the
// pool. By default behave as if the migration hasn't been applied
// (SQLSTATE 42P01) so the middleware falls through to the in-memory
// limiter; individual tests opt in to specific row payloads.
const pgQueryMock = vi.fn();
vi.mock("../db.js", () => ({
  pool: {
    query: (...args: unknown[]) => pgQueryMock(...args),
  },
}));

const loggerWarnMock = vi.fn();
vi.mock("../obs/logger.js", () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  getIp,
  checkRateLimit,
  checkRateLimitRedis,
  checkRateLimitPg,
  rateLimitExpress,
  resolveRateLimitCost,
  __resetRateLimitPgWarnForTests,
} from "./rateLimit.js";
import { getRedis } from "../lib/redis.js";

function pgUndefinedTableError(): Error & { code: string } {
  // Mirrors the `pg` driver's shape for SQLSTATE 42P01 — the
  // `checkRateLimitPgWithFallback` branch keys on `err.code`.
  const err = new Error(
    'relation "rate_limit_buckets" does not exist',
  ) as Error & {
    code: string;
  };
  err.code = "42P01";
  return err;
}

function asReq(partial: Partial<Request> & Record<string, unknown>): Request {
  return partial as unknown as Request;
}

describe("getIp", () => {
  it("returns req.ip when Express populated it (trust-proxy path)", () => {
    const req = asReq({
      ip: "203.0.113.10",
      headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.10" },
    });
    expect(getIp(req)).toBe("203.0.113.10");
  });

  it("ignores a spoofed X-Forwarded-For first entry when req.ip is present", () => {
    // Regression for the rate-limit / quota bypass: with trust proxy = 1,
    // Railway appends the real client IP at the end of XFF. A client sending
    // `X-Forwarded-For: 1.1.1.1` must NOT end up bucketed as 1.1.1.1.
    const req = asReq({
      ip: "198.51.100.7",
      headers: { "x-forwarded-for": "1.1.1.1, 198.51.100.7" },
    });
    expect(getIp(req)).toBe("198.51.100.7");
  });

  it("ignores raw X-Forwarded-For when req.ip is missing (spoof-safe)", () => {
    // Regression: previously we fell back to parsing XFF directly, which
    // turned "no trust-proxy / detached socket" into a free-tier bypass —
    // the attacker controls the entire header on a directly-exposed server.
    // Now the safe failure mode is "unknown" so all such requests share a
    // single bucket rather than each minting a fresh fake IP.
    const req = asReq({
      headers: { "x-forwarded-for": "1.1.1.1, 198.51.100.7" },
    });
    expect(getIp(req)).toBe("unknown");
  });

  it("ignores X-Real-IP when req.ip is missing (spoof-safe)", () => {
    // X-Real-IP has no append semantic — it is whatever the last sender
    // wrote. Trusting it without a proxy guarantee = trusting the client.
    const req = asReq({ headers: { "x-real-ip": "10.0.0.42" } });
    expect(getIp(req)).toBe("unknown");
  });

  it('returns "unknown" when nothing is available', () => {
    expect(getIp(asReq({ headers: {} }))).toBe("unknown");
  });

  it("trims whitespace on req.ip", () => {
    expect(getIp(asReq({ ip: "  10.0.0.1  ", headers: {} }))).toBe("10.0.0.1");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  function makeReq(ip: string): Request {
    return asReq({ ip, headers: {} });
  }

  it("allows up to the limit and blocks the limit+1 hit", () => {
    // Unique key per test so shared in-process Map state doesn't collide.
    const key = `t_allow_${Math.random().toString(36).slice(2)}`;
    const req = makeReq("192.0.2.1");

    const r1 = checkRateLimit(req, { key, limit: 2, windowMs: 60_000 });
    const r2 = checkRateLimit(req, { key, limit: 2, windowMs: 60_000 });
    const r3 = checkRateLimit(req, { key, limit: 2, windowMs: 60_000 });

    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(1);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(0);
    expect(r3.ok).toBe(false);
    expect(r3.remaining).toBe(0);
    // retryAfter is a positive integer (seconds)
    expect(r3.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates buckets per-IP", () => {
    const key = `t_iso_${Math.random().toString(36).slice(2)}`;
    const a = checkRateLimit(makeReq("10.0.0.1"), {
      key,
      limit: 1,
      windowMs: 60_000,
    });
    const b = checkRateLimit(makeReq("10.0.0.2"), {
      key,
      limit: 1,
      windowMs: 60_000,
    });
    const aAgain = checkRateLimit(makeReq("10.0.0.1"), {
      key,
      limit: 1,
      windowMs: 60_000,
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(aAgain.ok).toBe(false);
  });

  it("isolates buckets per-key (same IP, different route)", () => {
    const req = makeReq("192.0.2.9");
    const a = checkRateLimit(req, {
      key: `ka_${Date.now()}`,
      limit: 1,
      windowMs: 60_000,
    });
    const b = checkRateLimit(req, {
      key: `kb_${Date.now()}`,
      limit: 1,
      windowMs: 60_000,
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("rolls the window after windowMs elapses", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const key = `t_window_${Math.random().toString(36).slice(2)}`;
      const req = makeReq("192.0.2.5");
      const first = checkRateLimit(req, { key, limit: 1, windowMs: 1_000 });
      const blocked = checkRateLimit(req, { key, limit: 1, windowMs: 1_000 });
      expect(first.ok).toBe(true);
      expect(blocked.ok).toBe(false);

      vi.advanceTimersByTime(1_500);
      const reopened = checkRateLimit(req, { key, limit: 1, windowMs: 1_000 });
      expect(reopened.ok).toBe(true);
      expect(reopened.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a long-window bucket when a short-window route triggers a sweep", () => {
    // Regression for the shared-TTL bug: sweepBuckets previously used the
    // current request's windowMs as a global eviction threshold. After the
    // fix, each bucket's own window is used.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const longKey = `long_${Math.random().toString(36).slice(2)}`;
      const shortKey = `short_${Math.random().toString(36).slice(2)}`;
      const ip = "192.0.2.77";
      const req = makeReq(ip);

      // Occupy the long-window bucket (1h) with a single hit.
      const opened = checkRateLimit(req, {
        key: longKey,
        limit: 1,
        windowMs: 60 * 60_000,
      });
      expect(opened.ok).toBe(true);

      // Advance past the sweep debounce (>30s), then fire a short-window hit
      // whose windowMs would previously have evicted the long-window bucket.
      vi.advanceTimersByTime(2 * 60_000);
      const shortHit = checkRateLimit(makeReq("10.9.8.7"), {
        key: shortKey,
        limit: 10,
        windowMs: 15_000,
      });
      expect(shortHit.ok).toBe(true);

      // Long bucket must still be saturated — the earlier hit was NOT swept.
      const replay = checkRateLimit(req, {
        key: longKey,
        limit: 1,
        windowMs: 60 * 60_000,
      });
      expect(replay.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retryAfterSec is at least 1 second even for sub-second windows", () => {
    const key = `t_retry_${Math.random().toString(36).slice(2)}`;
    const req = makeReq("192.0.2.100");
    checkRateLimit(req, { key, limit: 1, windowMs: 100 });
    const blocked = checkRateLimit(req, { key, limit: 1, windowMs: 100 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});

describe("resolveRateLimitCost", () => {
  function makeReq(): Request {
    return { ip: "192.0.2.10", headers: {} } as unknown as Request;
  }

  it("defaults to 1 when no cost function is provided", () => {
    expect(resolveRateLimitCost(makeReq(), {})).toBe(1);
  });

  it("returns the function's value when within range", () => {
    expect(resolveRateLimitCost(makeReq(), { cost: () => 10 })).toBe(10);
    expect(resolveRateLimitCost(makeReq(), { cost: () => 1 })).toBe(1);
  });

  it("clamps cost to MAX_COST=50", () => {
    expect(resolveRateLimitCost(makeReq(), { cost: () => 9999 })).toBe(50);
  });

  it("floors fractional cost", () => {
    expect(resolveRateLimitCost(makeReq(), { cost: () => 3.9 })).toBe(3);
  });

  it("returns 1 for non-finite cost (NaN, Infinity, -Infinity)", () => {
    // Defensive: a non-finite cost almost certainly means a buggy
    // `cost(req)` (e.g. user input leaked in). Falling back to 1
    // protects the bucket from silent saturation by NaN-arithmetic.
    expect(resolveRateLimitCost(makeReq(), { cost: () => NaN })).toBe(1);
    expect(resolveRateLimitCost(makeReq(), { cost: () => Infinity })).toBe(1);
    expect(resolveRateLimitCost(makeReq(), { cost: () => -Infinity })).toBe(1);
  });

  it("returns 1 for cost below 1 (negative or zero)", () => {
    expect(resolveRateLimitCost(makeReq(), { cost: () => 0 })).toBe(1);
    expect(resolveRateLimitCost(makeReq(), { cost: () => -5 })).toBe(1);
    expect(resolveRateLimitCost(makeReq(), { cost: () => 0.5 })).toBe(1);
  });

  it("returns 1 when cost(req) throws — never lets a bug crash the limiter", () => {
    expect(
      resolveRateLimitCost(makeReq(), {
        cost: () => {
          throw new Error("boom");
        },
      }),
    ).toBe(1);
  });
});

describe("checkRateLimit — cost-multiplier", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("seeds a fresh bucket at the full cost (not 1)", () => {
    // Regression guard: a heavy first-hit must count for its full
    // weight, otherwise the limiter would let `limit / cost` heavy
    // requests through per window instead of `limit`.
    const key = `t_cost_seed_${Math.random().toString(36).slice(2)}`;
    const r = checkRateLimit(makeReq("192.0.2.50"), {
      key,
      limit: 60,
      windowMs: 60_000,
      cost: () => 10,
    });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(50);
  });

  it("rejects when adding cost would push the bucket over limit (9/10 + cost=10 → block)", () => {
    // The cost-multiplier specifically prevents this case: a 9-token
    // bucket at limit=10 must NOT accept a cost=10 chat-stream that
    // would land the count at 19. Cheap reads (cost=1) on the same key
    // would still pass — that's the whole point of the multiplier.
    const key = `t_cost_block_${Math.random().toString(36).slice(2)}`;
    const req = makeReq("192.0.2.51");
    // Saturate to 9/10 with cheap calls.
    for (let i = 0; i < 9; i++) {
      const r = checkRateLimit(req, { key, limit: 10, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
    // Heavy call (cost=10) must be blocked.
    const heavy = checkRateLimit(req, {
      key,
      limit: 10,
      windowMs: 60_000,
      cost: () => 10,
    });
    expect(heavy.ok).toBe(false);
    expect(heavy.remaining).toBe(1);
    // Cheap call still passes — sanity check that the bucket itself
    // wasn't consumed by the failed heavy call.
    const cheap = checkRateLimit(req, { key, limit: 10, windowMs: 60_000 });
    expect(cheap.ok).toBe(true);
  });

  it("accumulates cost across mixed cheap+heavy calls in the same window", () => {
    const key = `t_cost_mix_${Math.random().toString(36).slice(2)}`;
    const req = makeReq("192.0.2.52");
    // 5 + 3*1 = 8/20
    const heavy = checkRateLimit(req, {
      key,
      limit: 20,
      windowMs: 60_000,
      cost: () => 5,
    });
    expect(heavy.ok).toBe(true);
    expect(heavy.remaining).toBe(15);
    for (let i = 0; i < 3; i++) {
      checkRateLimit(req, { key, limit: 20, windowMs: 60_000 });
    }
    const r = checkRateLimit(req, { key, limit: 20, windowMs: 60_000 });
    expect(r.ok).toBe(true);
    // 5 + 3 + 1 = 9 used, 11 remaining after this call.
    expect(r.remaining).toBe(11);
  });

  it("equates limit=10/cost=10 with limit=1/cost=1 (effective cap parity)", () => {
    // The cost-multiplier mechanic is supposed to be isomorphic with a
    // smaller bucket: cost: 10 against limit 10 must fire exactly once
    // per window — same observable behavior as limit: 1, cost: 1.
    const key = `t_cost_parity_${Math.random().toString(36).slice(2)}`;
    const req = makeReq("192.0.2.53");
    const first = checkRateLimit(req, {
      key,
      limit: 10,
      windowMs: 60_000,
      cost: () => 10,
    });
    const second = checkRateLimit(req, {
      key,
      limit: 10,
      windowMs: 60_000,
      cost: () => 10,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("ignores cost-multiplier when no cost option is set (backward compat)", () => {
    // A route that didn't opt into cost must behave exactly as it did
    // before this PR — one token per call. Regression guard for every
    // existing limit-X-windowMs configuration in `routes/*.ts`.
    const key = `t_cost_compat_${Math.random().toString(36).slice(2)}`;
    const req = makeReq("192.0.2.54");
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit(req, { key, limit: 5, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
    const blocked = checkRateLimit(req, { key, limit: 5, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
  });
});

describe("checkRateLimitRedis — cost-multiplier", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  it("passes cost to the Lua INCRBY (third ARGV slot)", async () => {
    const evalMock = vi.fn().mockResolvedValue([10, 60_000]);
    const fakRedis = { eval: evalMock } as never;
    const result = await checkRateLimitRedis(fakRedis, makeReq("1.2.3.4"), {
      key: "test:redis:cost",
      limit: 60,
      windowMs: 60_000,
      cost: () => 10,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(50);
    // 4th call arg is the cost (after the script body, key count, key, window).
    const args = evalMock.mock.calls[0];
    expect(args?.[4]).toBe("10");
  });

  it("defaults the Lua cost ARGV to '1' when no cost function is set", async () => {
    const evalMock = vi.fn().mockResolvedValue([1, 4900]);
    const fakRedis = { eval: evalMock } as never;
    await checkRateLimitRedis(fakRedis, makeReq("1.2.3.5"), {
      key: "test:redis:no-cost",
      limit: 5,
      windowMs: 5_000,
    });
    const args = evalMock.mock.calls[0];
    expect(args?.[4]).toBe("1");
  });
});

describe("checkRateLimitPg — cost-multiplier", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  beforeEach(() => {
    pgQueryMock.mockReset();
  });

  it("passes cost as the 4th SQL parameter", async () => {
    pgQueryMock.mockResolvedValue({
      rows: [{ count: 10, elapsed_ms: "1000" }],
    });
    const result = await checkRateLimitPg(makeReq("1.2.3.6"), {
      key: "test:pg:cost",
      limit: 60,
      windowMs: 60_000,
      cost: () => 10,
    });
    expect(result.ok).toBe(true);
    expect(pgQueryMock).toHaveBeenCalledOnce();
    const args = pgQueryMock.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(args?.[3]).toBe(10);
  });

  it("defaults SQL cost parameter to 1 when no cost function is set", async () => {
    pgQueryMock.mockResolvedValue({
      rows: [{ count: 1, elapsed_ms: "0" }],
    });
    await checkRateLimitPg(makeReq("1.2.3.7"), {
      key: "test:pg:no-cost",
      limit: 5,
      windowMs: 60_000,
    });
    const args = pgQueryMock.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(args?.[3]).toBe(1);
  });
});

describe("checkRateLimitRedis", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  it("returns ok=true when count is within limit", async () => {
    const fakRedis = { eval: vi.fn().mockResolvedValue([1, 4800]) } as never;
    const result = await checkRateLimitRedis(fakRedis, makeReq("1.2.3.4"), {
      key: "test:redis",
      limit: 5,
      windowMs: 5_000,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetMs).toBe(4800);
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("returns ok=false when count exceeds limit", async () => {
    const fakRedis = { eval: vi.fn().mockResolvedValue([6, 3000]) } as never;
    const result = await checkRateLimitRedis(fakRedis, makeReq("1.2.3.4"), {
      key: "test:redis:block",
      limit: 5,
      windowMs: 5_000,
    });
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBe(3000);
  });

  it("retryAfterSec is at least 1 second when pttl is very small", async () => {
    const fakRedis = { eval: vi.fn().mockResolvedValue([2, 50]) } as never;
    const result = await checkRateLimitRedis(fakRedis, makeReq("1.2.3.4"), {
      key: "test:redis:retry",
      limit: 1,
      windowMs: 100,
    });
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});

describe("rateLimitExpress — Redis path", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(null);
    redisEvalMock.mockReset();
    // Default to "Postgres unreachable" so the middleware falls all the
    // way through to the in-memory limiter — keeps these tests focused
    // on Redis-vs-fallback rather than the Postgres branch (covered in
    // its own describe block).
    pgQueryMock.mockReset();
    pgQueryMock.mockRejectedValue(pgUndefinedTableError());
    loggerWarnMock.mockReset();
  });

  it("uses Redis when getRedis() returns a client", async () => {
    const fakeRedis = { eval: redisEvalMock.mockResolvedValue([1, 4900]) };
    vi.mocked(getRedis).mockReturnValue(fakeRedis as never);

    const middleware = rateLimitExpress({
      key: "mw:redis",
      limit: 5,
      windowMs: 5_000,
    });
    const req = makeReq("10.0.0.1");
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as never;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(redisEvalMock).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("falls back to in-memory when Redis eval throws", async () => {
    const fakeRedis = {
      eval: redisEvalMock.mockRejectedValue(new Error("ECONNREFUSED")),
    };
    vi.mocked(getRedis).mockReturnValue(fakeRedis as never);

    const middleware = rateLimitExpress({
      key: "mw:fallback",
      limit: 5,
      windowMs: 5_000,
    });
    const req = makeReq("10.0.0.2");
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as never;
    const next = vi.fn();

    await middleware(req, res, next);

    // fallback to in-memory: next() must still be called despite Redis failure
    expect(next).toHaveBeenCalledOnce();
  });

  it("uses in-memory when getRedis() returns null", async () => {
    vi.mocked(getRedis).mockReturnValue(null);

    const middleware = rateLimitExpress({
      key: "mw:nuls",
      limit: 5,
      windowMs: 5_000,
    });
    const req = makeReq("10.0.0.3");
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as never;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(redisEvalMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 429 body with both `error` and `message` fields when blocked", async () => {
    // Контракт із Better Auth client / better-fetch: вони читають саме
    // `message` при десеріалізації не-2xx body. Якщо віддавати тільки
    // `error`, юзер на /sign-in бачить generic «Помилка входу» замість
    // реального rate-limit повідомлення. Тому тримаємо обидва поля
    // синхронізованими.
    vi.mocked(getRedis).mockReturnValue(null);
    const key = `mw:body_${Math.random().toString(36).slice(2)}`;
    const middleware = rateLimitExpress({ key, limit: 1, windowMs: 60_000 });
    const req = makeReq("10.0.0.99");
    const allowedRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as never;
    await middleware(req, allowedRes, vi.fn());

    const blockedJson = vi.fn();
    const blockedRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: blockedJson,
    } as never;
    const next = vi.fn();
    await middleware(req, blockedRes, next);

    expect(next).not.toHaveBeenCalled();
    expect(blockedJson).toHaveBeenCalledTimes(1);
    const body = blockedJson.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        error: "Забагато запитів. Спробуй пізніше.",
        message: "Забагато запитів. Спробуй пізніше.",
        code: "RATE_LIMIT",
      }),
    );
  });
});

describe("checkRateLimitPg", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  beforeEach(() => {
    pgQueryMock.mockReset();
  });

  it("allows when count is within limit and reports remaining", async () => {
    pgQueryMock.mockResolvedValueOnce({
      rows: [{ count: 3, elapsed_ms: "200" }],
    });
    const result = await checkRateLimitPg(makeReq("203.0.113.10"), {
      key: "pg:allow",
      limit: 5,
      windowMs: 5_000,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.resetMs).toBe(4_800);
    // INSERT … ON CONFLICT … RETURNING — windowMs flows through as a
    // string so the bigint cast in SQL is unambiguous.
    expect(pgQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO rate_limit_buckets"),
      // Cost is the 4th param (defaults to 1 when no cost(req) is set).
      ["pg:allow", expect.any(String), "5000", 1],
    );
  });

  it("blocks once count exceeds limit", async () => {
    pgQueryMock.mockResolvedValueOnce({
      rows: [{ count: 6, elapsed_ms: "2000" }],
    });
    const result = await checkRateLimitPg(makeReq("203.0.113.11"), {
      key: "pg:block",
      limit: 5,
      windowMs: 5_000,
    });
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBe(3_000);
  });

  it("clamps retryAfterSec to a 1s floor for tiny windows", async () => {
    // Same regression as the Redis path: better-fetch / Better Auth
    // refuse `Retry-After: 0` and surface a generic error to the user.
    pgQueryMock.mockResolvedValueOnce({
      rows: [{ count: 2, elapsed_ms: "50" }],
    });
    const result = await checkRateLimitPg(makeReq("203.0.113.12"), {
      key: "pg:retry",
      limit: 1,
      windowMs: 100,
    });
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("treats a fresh-bucket return (count=1) as allowed when limit > 1", async () => {
    // Mirrors the SQL `INSERT VALUES (..., 1, NOW())` path on first hit
    // — the row is returned with `count=1` and elapsed_ms=0.
    pgQueryMock.mockResolvedValueOnce({
      rows: [{ count: 1, elapsed_ms: "0" }],
    });
    const result = await checkRateLimitPg(makeReq("203.0.113.13"), {
      key: "pg:fresh",
      limit: 5,
      windowMs: 60_000,
    });
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetMs).toBe(60_000);
  });

  it("clamps remaining at 0 when count somehow lands above limit", async () => {
    // Defensive: a concurrent over-write could in theory return a count
    // above the limit. The contract still reports `remaining=0` rather
    // than negative, so downstream `X-RateLimit-Remaining` stays valid.
    pgQueryMock.mockResolvedValueOnce({
      rows: [{ count: 10, elapsed_ms: "100" }],
    });
    const result = await checkRateLimitPg(makeReq("203.0.113.14"), {
      key: "pg:over",
      limit: 5,
      windowMs: 5_000,
    });
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("rateLimitExpress — Postgres path", () => {
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  function makeRes(): {
    res: never;
    json: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  } {
    const json = vi.fn();
    const setHeader = vi.fn();
    const res = {
      setHeader,
      status: vi.fn().mockReturnThis(),
      json,
    } as never;
    return { res, json, setHeader };
  }

  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(null);
    redisEvalMock.mockReset();
    pgQueryMock.mockReset();
    loggerWarnMock.mockReset();
    // Reset the once-per-process degraded-limiter warn flag so the
    // "warns once" assertion below isn't pre-tripped by earlier tests
    // in this file.
    __resetRateLimitPgWarnForTests();
  });

  it("uses Postgres when Redis is unavailable", async () => {
    pgQueryMock.mockResolvedValue({
      rows: [{ count: 1, elapsed_ms: "0" }],
    });

    const middleware = rateLimitExpress({
      key: "mw:pg",
      limit: 5,
      windowMs: 5_000,
    });
    const { res } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.10"), res, next);

    // First call is the limiter INSERT/UPDATE; sweeps fire only ~1/256
    // and are best-effort — assert the limiter call landed.
    expect(pgQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO rate_limit_buckets"),
      expect.any(Array),
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("falls back to in-memory when Postgres table is missing and warns once", async () => {
    pgQueryMock.mockRejectedValue(pgUndefinedTableError());

    const middleware = rateLimitExpress({
      key: "mw:pg-missing",
      limit: 5,
      windowMs: 5_000,
    });

    // Two calls — only the first should emit the missing-table warn so
    // a degraded production limiter doesn't flood obs on every request.
    const a = makeRes();
    const b = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.20"), a.res, next);
    await middleware(makeReq("10.0.0.20"), b.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "rate_limit_pg_table_missing" }),
    );
  });

  it("falls back to in-memory and still serves when Postgres rejects with a transient error", async () => {
    // Connection refused / pool exhaustion shouldn't take the limiter
    // offline — just degrade to per-process counting until Postgres
    // recovers.
    const transient = new Error("connection terminated") as Error & {
      code: string;
    };
    transient.code = "08006";
    pgQueryMock.mockRejectedValue(transient);

    const middleware = rateLimitExpress({
      key: "mw:pg-transient",
      limit: 5,
      windowMs: 5_000,
    });
    const { res } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.30"), res, next);
    expect(next).toHaveBeenCalledOnce();
    // Transient errors don't trip the missing-table warn — they're a
    // pool/network problem, not a schema mismatch.
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});

describe("rateLimitExpress — fail-closed mode", () => {
  // Fail-closed is the safety guarantee for `/api/auth/*`: when both Redis
  // AND Postgres are unreachable, in-memory bucketing is per-replica and
  // would otherwise let `N×limit` requests through. Refusing with 503 stops
  // credential-stuffing amplification while the backend recovers.
  function makeReq(ip: string): Request {
    return { ip, headers: {} } as unknown as Request;
  }

  function makeRes(): {
    res: never;
    json: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  } {
    const json = vi.fn();
    const setHeader = vi.fn();
    const status = vi.fn().mockReturnThis();
    const res = {
      setHeader,
      status,
      json,
    } as never;
    return { res, json, setHeader, status };
  }

  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(null);
    redisEvalMock.mockReset();
    pgQueryMock.mockReset();
    loggerWarnMock.mockReset();
    __resetRateLimitPgWarnForTests();
  });

  it("refuses with 503 + Retry-After when Redis is null and Postgres is unavailable", async () => {
    pgQueryMock.mockRejectedValue(pgUndefinedTableError());

    const middleware = rateLimitExpress({
      key: "mw:auth:closed",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
    });
    const { res, json, setHeader, status } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.40"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(setHeader).toHaveBeenCalledWith("Retry-After", "5");
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        code: "RATE_LIMIT_UNAVAILABLE",
      }),
    );
    // Both `error` and `message` populated for better-fetch / direct
    // fetch callers — same contract as the 429 path.
    expect(typeof body?.["error"]).toBe("string");
    expect(typeof body?.["message"]).toBe("string");
  });

  it("refuses with 503 when Redis throws AND Postgres is unavailable", async () => {
    const fakeRedis = {
      eval: redisEvalMock.mockRejectedValue(new Error("ECONNREFUSED")),
    };
    vi.mocked(getRedis).mockReturnValue(fakeRedis as never);
    pgQueryMock.mockRejectedValue(pgUndefinedTableError());

    const middleware = rateLimitExpress({
      key: "mw:auth:closed-2",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
    });
    const { res, status } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.41"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
  });

  it("DOES NOT refuse when Redis works — fail-closed only activates on degraded backend", async () => {
    const fakeRedis = { eval: redisEvalMock.mockResolvedValue([1, 60_000]) };
    vi.mocked(getRedis).mockReturnValue(fakeRedis as never);

    const middleware = rateLimitExpress({
      key: "mw:auth:closed-redis-ok",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
    });
    const { res, status } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.42"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalledWith(503);
  });

  it("DOES NOT refuse when Postgres works — fail-closed only activates on degraded backend", async () => {
    pgQueryMock.mockResolvedValue({
      rows: [{ count: 1, elapsed_ms: "0" }],
    });

    const middleware = rateLimitExpress({
      key: "mw:auth:closed-pg-ok",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
    });
    const { res, status } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.43"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalledWith(503);
  });

  it("still 429-blocks when Redis returns over-limit (failMode does not affect normal limit hits)", async () => {
    // Regression guard: a fail-closed route should still surface the
    // canonical 429 for legitimate rate-limit hits, NOT 503. 503 is
    // reserved for the degraded-backend path.
    const fakeRedis = { eval: redisEvalMock.mockResolvedValue([21, 30_000]) };
    vi.mocked(getRedis).mockReturnValue(fakeRedis as never);

    const middleware = rateLimitExpress({
      key: "mw:auth:closed-blocked",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
    });
    const { res, status } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.44"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
    expect(status).not.toHaveBeenCalledWith(503);
  });

  it("default failMode is 'open' — preserves backward compat for non-auth routes", async () => {
    pgQueryMock.mockRejectedValue(pgUndefinedTableError());

    // No explicit `failMode` — should behave exactly like before this
    // change: degrade to in-memory and serve the request.
    const middleware = rateLimitExpress({
      key: "mw:public:default",
      limit: 100,
      windowMs: 60_000,
    });
    const { res, status } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.50"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalledWith(503);
  });
});
