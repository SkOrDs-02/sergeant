import type { Request, RequestHandler } from "express";
import type Redis from "ioredis";
import { pool } from "../db.js";
import { logger } from "../obs/logger.js";
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
 * Fixed-window rate-limit check backed by Postgres (`rate_limit_buckets`).
 *
 * Replaces the in-memory fallback for the production path: when Redis is
 * unavailable, multiple Railway replicas otherwise share no state and a
 * single user can hit `limit` separately on each instance. The Postgres
 * path keeps semantics identical to {@link checkRateLimitRedis} (fixed
 * window, atomic increment) while being horizontally consistent.
 *
 * Atomicity: `INSERT … ON CONFLICT … DO UPDATE` runs a single row lock
 * over `(rl_key, subject)`. The `CASE` branches against
 * `rate_limit_buckets.started_at` reference the pre-update value, and
 * `NOW()` is `transaction_timestamp()` — stable for the whole statement —
 * so both the count rotation and the `started_at` reset see the same
 * window-elapsed comparison.
 *
 * Graceful degradation: if the migration `035_rate_limit_buckets.sql`
 * has not yet been applied (SQLSTATE `42P01`, undefined table) or any
 * other Postgres error fires, the caller in {@link rateLimitExpress}
 * falls through to {@link checkRateLimit}. Errors are logged at `warn`
 * once per occurrence so a degraded limiter is visible in obs without
 * spamming on every request.
 */
export async function checkRateLimitPg(
  req: Request,
  { key, limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const subject = rateLimitSubject(req);
  const sql = `
    INSERT INTO rate_limit_buckets (rl_key, subject, count, started_at)
    VALUES ($1, $2, 1, NOW())
    ON CONFLICT (rl_key, subject) DO UPDATE
    SET
      count = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_buckets.started_at)) * 1000 >= $3::bigint
          THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      started_at = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_buckets.started_at)) * 1000 >= $3::bigint
          THEN NOW()
        ELSE rate_limit_buckets.started_at
      END
    RETURNING
      count,
      (EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::bigint AS elapsed_ms
  `;

  const result = await pool.query<{ count: number; elapsed_ms: string }>(sql, [
    key,
    subject,
    String(windowMs),
  ]);
  const row = result.rows[0];
  // Coerce bigint → number per AGENTS.md hard rule #1 (the `pg` driver
  // returns int8/bigint columns as JS strings).
  const count = Number(row?.count ?? 0);
  const elapsedMs = Math.max(0, Number(row?.elapsed_ms ?? 0));
  const resetMs = Math.max(0, windowMs - elapsedMs);

  if (count > limit) {
    recordRateLimit(key, "blocked");
    return {
      ok: false,
      remaining: 0,
      resetMs,
      retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
    };
  }
  recordRateLimit(key, "allowed");
  return {
    ok: true,
    remaining: Math.max(0, limit - count),
    resetMs,
    retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
  };
}

// Cleanup probability — fire a sweep ~1/N requests so the table doesn't
// grow indefinitely under churning IPs while keeping per-request overhead
// at zero on the hot path. Tuned for ~1k RPS: at 1/256 we sweep ~4×/sec.
const PG_SWEEP_PROBABILITY = 1 / 256;

// One-shot warn when the Postgres bucket table is unreachable (typically
// because migration `035_rate_limit_buckets.sql` hasn't been applied yet
// or the role lacks SELECT/INSERT). Subsequent failures fall through
// silently to the in-memory limiter — the warn is enough to flag the
// degraded state in obs without spamming on every request.
let pgUndefinedTableLogged = false;

/**
 * Test-only reset for the once-per-process degraded-limiter warn flag.
 * Exposed because vitest reuses a single module instance across `describe`
 * blocks; production paths must never call this.
 */
export function __resetRateLimitPgWarnForTests(): void {
  pgUndefinedTableLogged = false;
}

interface PgErrorLike {
  code?: string;
  message?: string;
}

function pgErr(err: unknown): PgErrorLike {
  return err && typeof err === "object" ? (err as PgErrorLike) : {};
}

async function checkRateLimitPgWithFallback(
  req: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    return await checkRateLimitPg(req, options);
  } catch (err) {
    const code = pgErr(err).code;
    if (code === "42P01" && !pgUndefinedTableLogged) {
      pgUndefinedTableLogged = true;
      logger.warn({
        msg: "rate_limit_pg_table_missing",
        hint: "apply migration 035_rate_limit_buckets.sql; falling back to in-memory limiter",
      });
    }
    return checkRateLimit(req, options);
  }
}

async function maybeSweepPgBuckets(maxWindowMs: number): Promise<void> {
  if (Math.random() >= PG_SWEEP_PROBABILITY) return;
  // Keep rows for 2× the longest configured window so we never evict
  // a still-live bucket out from under a concurrent request that hasn't
  // yet read it back. The application path always re-rotates a bucket
  // on access, so a stale row is at worst a one-window over-count.
  const ttlMs = Math.max(60_000, maxWindowMs * 2);
  try {
    await pool.query(
      "DELETE FROM rate_limit_buckets WHERE started_at < NOW() - ($1::bigint || ' milliseconds')::interval",
      [String(ttlMs)],
    );
  } catch {
    /* sweep is best-effort */
  }
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
        // Redis unavailable — fall back to Postgres (horizontally
        // consistent across replicas), and only to in-memory if even
        // Postgres is broken (test bootstrap, migration not applied).
        rl = await checkRateLimitPgWithFallback(req, { key, limit, windowMs });
      }
    } else {
      rl = await checkRateLimitPgWithFallback(req, { key, limit, windowMs });
    }
    // Best-effort sweep of stale rows; runs ~1/256 calls so the table
    // doesn't grow under churning IPs. No-op when Postgres is degraded.
    void maybeSweepPgBuckets(windowMs);
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
      const message = "Забагато запитів. Спробуй пізніше.";
      // `error` — стара форма для прямих `fetch`-колерів. `message` — те
      // саме поле, яке читає better-fetch (а отже — Better Auth client) при
      // десеріалізації не-2xx body. Без цього 429 на `/api/auth/sign-in`
      // потрапляв у фронт як `result.error.message === undefined` і юзер
      // бачив generic «Помилка входу» замість осмисленого rate-limit
      // повідомлення.
      res.status(429).json({
        error: message,
        message,
        code: "RATE_LIMIT",
        ...(requestId ? { requestId } : {}),
      });
      return;
    }
    next();
  };
}
