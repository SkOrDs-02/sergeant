import type { Request, RequestHandler } from "express";
import type Redis from "ioredis";
import { rateLimitHitsTotal } from "../obs/metrics.js";
import { getRedis } from "../lib/redis.js";

type Outcome = "allowed" | "blocked";

function recordRateLimit(key: string, outcome: Outcome): void {
  try {
    rateLimitHitsTotal.inc({ key, outcome });
  } catch {
    /* metrics must never break a request */
  }
}

/**
 * Resolves the client's originating IP through Express's `req.ip` only —
 * which respects `app.set('trust proxy', …)` and correctly peels exactly the
 * configured number of trusted hops off `X-Forwarded-For`. Anything else
 * (raw header parsing, `X-Real-IP`) is user-controlled when the server is
 * exposed without a proxy and turns rate-limit / anonymous AI-quota into
 * a free-tier bypass: the attacker prepends a fresh fake IP per request and
 * the bucket key changes each time.
 *
 * Trust-proxy is configured in `createApp` (`apps/server/src/app.ts`) and
 * defaults to `1` (single reverse proxy in front of us — Railway / Replit
 * topology). If no trust-proxy is configured, `req.ip` falls back to the
 * raw socket peer, which is the proxy itself — also spoof-safe but means
 * every client behind that proxy shares a bucket. Better to under-distribute
 * than to let a forged header win.
 *
 * Returns `"unknown"` when Express could not surface an IP (e.g. test stubs
 * with no `socket`). All such requests then share a single bucket — that's
 * a deliberately conservative failure mode: the abuser cannot escape the
 * limiter by stripping headers.
 */
export function getIp(req: Request): string {
  const fromExpress = req?.ip;
  if (typeof fromExpress === "string" && fromExpress.trim()) {
    return fromExpress.trim();
  }
  return "unknown";
}

interface Bucket {
  startMs: number;
  count: number;
  // Per-bucket window so the global sweep never evicts a long-window
  // bucket based on another route's short window. Stored with the entry
  // rather than inferred from the current request.
  windowMs: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
  retryAfterSec: number;
}

// In-memory fixed-window rate limit.
// На Railway це пер-процес best-effort, але ріже очевидні спайки.
const buckets = new Map<string, Bucket>();
let lastSweepMs = 0;

function sweepBuckets(now: number): void {
  if (now - lastSweepMs < 30_000) return;
  lastSweepMs = now;

  if (buckets.size === 0) return;
  for (const [k, v] of buckets.entries()) {
    const start = v?.startMs;
    if (typeof start !== "number") {
      buckets.delete(k);
      continue;
    }
    // Each bucket carries its own window; we only evict once the window
    // has elapsed with some slack, so a sweep triggered by a short-window
    // route cannot wipe still-valid state for a long-window route.
    const bucketWindow = Math.max(60_000, Number(v.windowMs) || 0);
    if (now - start > bucketWindow) buckets.delete(k);
  }
}

/**
 * Витягує userId з `req.user.id`, якщо попередній middleware (напр.
 * `requireSession`) вже резолвнув сесію. Це використовується як пріоритетний
 * rate-limit ключ перед IP: мобільні юзери ходять з динамічних IP (LTE,
 * VPN, CGN), а один автентифікований користувач не має "скидувати" лімет
 * просто перейшовши з Wi-Fi на мобільні дані.
 *
 * Контракт узгоджений з `server/aiQuota.ts` → `subjectFor`, який теж
 * префіксує `u:` / `ip:`, тож метрики/логи rate-limit vs AI-квот легко
 * корелювати по одному subject.
 */
export function rateLimitSubject(req: Request): string {
  const user = (req as Request & { user?: { id?: unknown } }).user;
  const id = user && typeof user.id === "string" ? user.id : "";
  if (id) return `u:${id}`;
  return `ip:${getIp(req)}`;
}

// Lua script: atomically INCR, set EXPIRE on first hit, return [count, pttl].
const LUA_INCR_EXPIRE = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {c, ttl}
`;

/**
 * Fixed-window rate-limit check backed by Redis (global across replicas).
 * Falls back to in-memory via {@link checkRateLimit} if Redis throws.
 */
export async function checkRateLimitRedis(
  redis: Redis,
  req: Request,
  { key, limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const subject = rateLimitSubject(req);
  const k = `rl:${key}:${subject}`;
  const windowSecs = Math.max(1, Math.ceil(windowMs / 1000));

  const result = (await redis.eval(
    LUA_INCR_EXPIRE,
    1,
    k,
    String(windowSecs),
  )) as [number, number];
  const count = result[0];
  const pttlMs = Math.max(0, result[1]);

  if (count > limit) {
    recordRateLimit(key, "blocked");
    return {
      ok: false,
      remaining: 0,
      resetMs: pttlMs,
      retryAfterSec: Math.max(1, Math.ceil(pttlMs / 1000)),
    };
  }
  recordRateLimit(key, "allowed");
  return {
    ok: true,
    remaining: Math.max(0, limit - count),
    resetMs: pttlMs,
    retryAfterSec: Math.max(1, Math.ceil(pttlMs / 1000)),
  };
}

/**
 * Fixed-window rate-limit check (in-memory, per-process).
 */
export function checkRateLimit(
  req: Request,
  { key, limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const subject = rateLimitSubject(req);
  const now = Date.now();
  sweepBuckets(now);
  const k = `${key}:${subject}`;
  const cur = buckets.get(k);
  if (!cur || now - cur.startMs >= windowMs) {
    buckets.set(k, { startMs: now, count: 1, windowMs });
    recordRateLimit(key, "allowed");
    return {
      ok: true,
      remaining: limit - 1,
      resetMs: windowMs,
      retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }
  if (cur.count >= limit) {
    recordRateLimit(key, "blocked");
    const resetMs = Math.max(0, windowMs - (now - cur.startMs));
    return {
      ok: false,
      remaining: 0,
      resetMs,
      retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
    };
  }
  cur.count += 1;
  recordRateLimit(key, "allowed");
  const resetMs = Math.max(0, windowMs - (now - cur.startMs));
  return {
    ok: true,
    remaining: Math.max(0, limit - cur.count),
    resetMs,
    retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
  };
}

export function rateLimitExpress({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const redis = getRedis();
    let rl: RateLimitResult;
    if (redis) {
      try {
        rl = await checkRateLimitRedis(redis, req, { key, limit, windowMs });
      } catch {
        // Redis unavailable — fall back to per-process in-memory limiter.
        rl = checkRateLimit(req, { key, limit, windowMs });
      }
    } else {
      rl = checkRateLimit(req, { key, limit, windowMs });
    }
    try {
      res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
    } catch {
      /* ignore */
    }
    if (!rl.ok) {
      try {
        res.setHeader("Retry-After", String(rl.retryAfterSec));
      } catch {
        /* ignore */
      }
      const requestId = (req as Request & { requestId?: string }).requestId;
      res.status(429).json({
        error: "Забагато запитів. Спробуй пізніше.",
        code: "RATE_LIMIT",
        ...(requestId ? { requestId } : {}),
      });
      return;
    }
    next();
  };
}
