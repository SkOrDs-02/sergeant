import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request } from "express";

/**
 * Тести RFC-style `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`
 * headers (ініціатива 0008 Phase 2). Перевіряємо тільки
 * header-side-effect-и, а не bucket-логіку (її покриває `rateLimit.test.ts`).
 *
 * Чому новий файл, а не extend існуючого: основний `rateLimit.test.ts`
 * мокає `obs/metrics` суворим snapshot-ом; додавання нових assertion-ів у
 * наявні describe-блоки розламало б ізоляцію mock-state-у. Окремий файл
 * тримає mock-и tight, а assertion-и — фокусованими.
 */

vi.mock("../obs/metrics.js", async () => {
  const actual = await vi.importActual("../obs/metrics.js");
  return {
    ...actual,
    rateLimitHitsTotal: { inc: vi.fn() },
    rateLimitCostTotal: { inc: vi.fn() },
    rateLimitDegradedTotal: { inc: vi.fn() },
  };
});

const redisEvalMock = vi.fn();
vi.mock("../lib/redis.js", () => ({
  getRedis: vi.fn(() => null),
}));

const pgQueryMock = vi.fn();
vi.mock("../db.js", () => ({
  pool: {
    query: (...args: unknown[]) => pgQueryMock(...args),
  },
}));

vi.mock("../obs/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { rateLimitExpress } from "./rateLimit.js";
import { getRedis } from "../lib/redis.js";

function makeReq(ip: string): Request {
  return { ip, headers: {} } as unknown as Request;
}

interface MockRes {
  res: never;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  headers: Record<string, string>;
}

function makeRes(): MockRes {
  const headers: Record<string, string> = {};
  const setHeader = vi.fn((k: string, v: string) => {
    headers[k] = v;
  });
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const res = { setHeader, status, json } as never;
  return { res, status, json, setHeader, headers };
}

describe("rateLimitExpress — RFC RateLimit-* headers", () => {
  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(null);
    redisEvalMock.mockReset();
    pgQueryMock.mockReset();
    // Ловимо «table missing» так само як інші тести у `rateLimit.test.ts` —
    // limiter дегрейдить у in-memory, який детермінований.
    const err = new Error(
      'relation "rate_limit_buckets" does not exist',
    ) as Error & {
      code: string;
    };
    err.code = "42P01";
    pgQueryMock.mockRejectedValue(err);
  });

  it("emits RateLimit-Limit / Remaining / Reset on a passing call (200 path)", async () => {
    const middleware = rateLimitExpress({
      key: "test:headers:ok",
      limit: 10,
      windowMs: 60_000,
    });
    const { res, headers } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.100"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers["RateLimit-Limit"]).toBe("10");
    // Перший hit — bucket щойно створено з cost=1, лишилось 9.
    expect(headers["RateLimit-Remaining"]).toBe("9");
    // Reset — у секундах, ≤ window (60). Точне значення залежить від
    // часу між створенням bucket-а і check-ом, тож перевіряємо діапазон.
    const reset = Number(headers["RateLimit-Reset"]);
    expect(reset).toBeGreaterThanOrEqual(1);
    expect(reset).toBeLessThanOrEqual(60);
  });

  it("emits RateLimit-Remaining=0 + Retry-After when blocked (429 path)", async () => {
    const middleware = rateLimitExpress({
      key: "test:headers:blocked",
      limit: 1,
      windowMs: 60_000,
    });

    // Перший hit — пройшов; bucket = 1/1.
    {
      const { res } = makeRes();
      const next = vi.fn();
      await middleware(makeReq("10.0.0.101"), res, next);
      expect(next).toHaveBeenCalledOnce();
    }

    // Другий hit з того ж IP — має бути 429 з заповненими header-ами.
    const { res, status, headers } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.101"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
    expect(headers["RateLimit-Limit"]).toBe("1");
    expect(headers["RateLimit-Remaining"]).toBe("0");
    expect(headers["Retry-After"]).toBeDefined();
    expect(Number(headers["Retry-After"])).toBeGreaterThanOrEqual(1);
  });

  it("preserves legacy X-RateLimit-Remaining header for backward compat", async () => {
    // Існуючі дашборди / custom-клієнти могли гребти на `X-RateLimit-Remaining`;
    // зміна до RFC headers не повинна їх ламати до окремого cleanup-PR-а.
    const middleware = rateLimitExpress({
      key: "test:headers:legacy",
      limit: 5,
      windowMs: 60_000,
    });
    const { res, headers } = makeRes();
    const next = vi.fn();
    await middleware(makeReq("10.0.0.102"), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers["X-RateLimit-Remaining"]).toBe("4");
    // Та сама величина має дублюватись у RFC-name.
    expect(headers["RateLimit-Remaining"]).toBe("4");
  });
});
