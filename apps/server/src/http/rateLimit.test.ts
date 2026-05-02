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

import {
  getIp,
  checkRateLimit,
  checkRateLimitRedis,
  rateLimitExpress,
} from "./rateLimit.js";
import { getRedis } from "../lib/redis.js";

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
