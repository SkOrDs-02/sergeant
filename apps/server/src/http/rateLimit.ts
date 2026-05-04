import type { Request, RequestHandler } from "express";
import type Redis from "ioredis";
import { pool } from "../db.js";
import { logger } from "../obs/logger.js";
import {
  rateLimitCostTotal,
  rateLimitDegradedTotal,
  rateLimitHitsTotal,
} from "../obs/metrics.js";
import { getRedis } from "../lib/redis.js";

type Outcome = "allowed" | "blocked";

function recordRateLimit(key: string, outcome: Outcome): void {
  try {
    rateLimitHitsTotal.inc({ key, outcome });
  } catch {
    /* metrics must never break a request */
  }
}

function recordRateLimitCost(key: string, cost: number): void {
  if (!Number.isFinite(cost) || cost <= 0) return;
  try {
    rateLimitCostTotal.inc({ key }, cost);
  } catch {
    /* metrics must never break a request */
  }
}

/**
 * Maximum cost a single request may consume from a bucket. AI streams are
 * the legitimate heavy case (chat, photo analysis); anything beyond ~50
 * means a route is mis-configured (or a caller passed a `cost(req)` that
 * leaks user input). Clamp defensively rather than refuse — letting the
 * limiter run with a saturated cost is strictly safer than throwing 500
 * inside a rate-limit middleware.
 */
const MAX_COST = 50;

/**
 * Resolves the per-request cost for a {@link RateLimitOptions} entry. A
 * route without an explicit `cost(req)` consumes 1 token per call (current
 * behavior). Routes with a `cost` function get the value clamped to
 * `[1, MAX_COST]` and rounded to an integer — Redis `INCRBY` and the
 * Postgres `count + cost` arithmetic both require integer operands.
 */
export function resolveRateLimitCost(
  req: Request,
  options: Pick<RateLimitOptions, "cost">,
): number {
  let raw: number;
  try {
    raw = options.cost ? options.cost(req) : 1;
  } catch {
    raw = 1;
  }
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(MAX_COST, Math.floor(raw));
}

function recordRateLimitDegraded(key: string, mode: "inmem" | "closed"): void {
  try {
    rateLimitDegradedTotal.inc({ key, mode });
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
  /**
   * What to do when the limiter is forced into degraded mode (i.e. **both**
   * Redis and Postgres are unreachable, leaving only the per-process
   * in-memory bucket).
   *
   * - `"open"` (default) — serve via the in-memory bucket. Caveat: each
   *   replica has its own `Map`, so on a multi-replica deploy the effective
   *   limit becomes `N×limit` until Redis or Postgres recovers. Pick this
   *   for routes where the cost-of-blocking outweighs the abuse-amplification
   *   risk (e.g. `/api/health`, public read APIs).
   * - `"closed"` — refuse the request with `503 Service Unavailable` +
   *   `Retry-After`. Pick this for security-sensitive routes (`/api/auth/*`)
   *   where letting `N×limit` requests through would meaningfully accelerate
   *   credential-stuffing or password-reset abuse.
   *
   * Either way, the degraded transition is recorded on `rateLimitDegradedTotal`
   * with `mode=inmem` (open) or `mode=closed` (closed) so dashboards can alert
   * on a degraded production limiter.
   */
  failMode?: "open" | "closed";
  /**
   * Per-request cost multiplier. Defaults to `1` (current behavior — every
   * call consumes exactly one token from the bucket). Pass a function to
   * make heavy calls bill more than one token.
   *
   * **Why this exists.** A 30-second AI stream that returns ~50KB of tokens
   * and consumes minutes of upstream Anthropic budget is **not** equivalent
   * to a 30 ms `GET /api/me`. A naive 30-rpm bucket lets a single user
   * fire ~30 chat-streams per minute — sustained, that is hours of model
   * time and tens of MB of egress per minute, but the limiter sees "30
   * requests" and stays green. A `cost: () => 10` makes the same chat
   * route effectively a 3-rpm cap while leaving the cheap `GET` reads on
   * the same key untouched.
   *
   * **Contract.** The function must return a positive number. Values are
   * clamped to `[1, 50]` and rounded down to an integer
   * ({@link resolveRateLimitCost}) — both the Redis `INCRBY` and the
   * Postgres `count + cost` arithmetic require integer operands, and a
   * runaway cost (NaN, Infinity, negative) must never become an
   * unrecoverable 500 inside a middleware.
   *
   * **Observability.** Each accepted request increments
   * `rate_limit_cost_total{key=…}` by the resolved cost so dashboards can
   * compute the actual per-user budget consumption (`p95(sum by user)
   * over rate_limit_cost_total`) — the diagnostic tracker explicitly
   * called this out as the missing observability counterpart to the
   * existing `rate_limit_hits_total{outcome}` counter.
   *
   * Mirrors `aiQuota.ts → AI_QUOTA_TOOL_COST` for the Anthropic side: same
   * idea ("some calls cost more than one"), different layer (rate vs.
   * monthly quota). Routes that bill against both should keep the two
   * cost models aligned.
   */
  cost?: (req: Request) => number;
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

// Lua script: atomically INCRBY cost, set EXPIRE on first hit, return
// [count, pttl]. INCRBY (not INCR) so heavy routes can bill more than 1
// token per call — see `RateLimitOptions.cost`. The first-hit detector
// keys on `c == cost` rather than `c == 1` because a brand-new bucket
// jumps straight to `cost` after the INCRBY; missing this would leave
// the key without a TTL and the bucket would never reset.
const LUA_INCRBY_EXPIRE = `
local cost = tonumber(ARGV[2])
local c = redis.call('INCRBY', KEYS[1], cost)
if c == cost then
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
  { key, limit, windowMs, cost: costFn }: RateLimitOptions,
): Promise<RateLimitResult> {
  const subject = rateLimitSubject(req);
  const k = `rl:${key}:${subject}`;
  const windowSecs = Math.max(1, Math.ceil(windowMs / 1000));
  const cost = resolveRateLimitCost(req, { cost: costFn });

  const result = (await redis.eval(
    LUA_INCRBY_EXPIRE,
    1,
    k,
    String(windowSecs),
    String(cost),
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
  recordRateLimitCost(key, cost);
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
 * Graceful degradation: if the migration `037_rate_limit_buckets.sql`
 * has not yet been applied (SQLSTATE `42P01`, undefined table) or any
 * other Postgres error fires, the caller in {@link rateLimitExpress}
 * falls through to {@link checkRateLimit}. Errors are logged at `warn`
 * once per occurrence so a degraded limiter is visible in obs without
 * spamming on every request.
 */
export async function checkRateLimitPg(
  req: Request,
  { key, limit, windowMs, cost: costFn }: RateLimitOptions,
): Promise<RateLimitResult> {
  const subject = rateLimitSubject(req);
  const cost = resolveRateLimitCost(req, { cost: costFn });
  const sql = `
    INSERT INTO rate_limit_buckets (rl_key, subject, count, started_at)
    VALUES ($1, $2, $4::int, NOW())
    ON CONFLICT (rl_key, subject) DO UPDATE
    SET
      count = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_buckets.started_at)) * 1000 >= $3::bigint
          THEN $4::int
        ELSE rate_limit_buckets.count + $4::int
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
    cost,
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
  recordRateLimitCost(key, cost);
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
// because migration `037_rate_limit_buckets.sql` hasn't been applied yet
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

/**
 * Tries the Postgres-backed limiter and returns `null` on **any** error
 * (table missing, connection refused, pool exhausted, …). Returning a
 * sentinel rather than falling through to in-memory lets the caller decide
 * whether to degrade open or closed — necessary for security-sensitive
 * routes where the in-memory bucket is per-replica and would amount to a
 * silent `N×limit` bypass on multi-replica deploys.
 *
 * Side effect: emits a one-shot `rate_limit_pg_table_missing` warn for
 * SQLSTATE `42P01` (migration not applied yet). Subsequent failures fall
 * through silently — the warn is enough to flag the degraded state in obs
 * without spamming on every request.
 */
async function tryCheckRateLimitPg(
  req: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult | null> {
  try {
    return await checkRateLimitPg(req, options);
  } catch (err) {
    const code = pgErr(err).code;
    if (code === "42P01" && !pgUndefinedTableLogged) {
      pgUndefinedTableLogged = true;
      logger.warn({
        msg: "rate_limit_pg_table_missing",
        hint: "apply migration 037_rate_limit_buckets.sql; falling back to in-memory limiter",
      });
    }
    return null;
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
  { key, limit, windowMs, cost: costFn }: RateLimitOptions,
): RateLimitResult {
  const subject = rateLimitSubject(req);
  const now = Date.now();
  sweepBuckets(now);
  const k = `${key}:${subject}`;
  const cur = buckets.get(k);
  const cost = resolveRateLimitCost(req, { cost: costFn });
  if (!cur || now - cur.startMs >= windowMs) {
    // Fresh bucket — seed at `cost` (not 1). A heavy first hit must
    // count for its full weight, otherwise the next call could find a
    // "1-token" bucket and we'd silently let `limit / cost` heavy
    // requests through per window instead of `limit`.
    buckets.set(k, { startMs: now, count: cost, windowMs });
    recordRateLimit(key, "allowed");
    recordRateLimitCost(key, cost);
    return {
      ok: true,
      remaining: Math.max(0, limit - cost),
      resetMs: windowMs,
      retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }
  // Reject if adding `cost` would push the bucket over `limit`. This is
  // intentionally stricter than the previous `cur.count >= limit` check:
  // a 9/10 bucket must NOT accept a `cost=10` AI stream that would land
  // it at 19 — that is precisely the case the cost-multiplier exists to
  // prevent. Cheap (cost=1) calls keep their old behavior.
  if (cur.count + cost > limit) {
    recordRateLimit(key, "blocked");
    const resetMs = Math.max(0, windowMs - (now - cur.startMs));
    return {
      ok: false,
      remaining: Math.max(0, limit - cur.count),
      resetMs,
      retryAfterSec: Math.max(1, Math.ceil(resetMs / 1000)),
    };
  }
  cur.count += cost;
  recordRateLimit(key, "allowed");
  recordRateLimitCost(key, cost);
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
  failMode = "open",
  cost,
}: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const redis = getRedis();
    let rl: RateLimitResult | null = null;
    const options: RateLimitOptions = { key, limit, windowMs, cost };

    if (redis) {
      try {
        rl = await checkRateLimitRedis(redis, req, options);
      } catch {
        // Redis unavailable — try Postgres next.
        rl = await tryCheckRateLimitPg(req, options);
      }
    } else {
      rl = await tryCheckRateLimitPg(req, options);
    }

    // Both Redis and Postgres failed (or weren't available). Decide what to
    // do based on `failMode`: degrade to per-process in-memory bucket
    // (`open`) or refuse with 503 (`closed`). Either way the transition is
    // recorded on `rateLimitDegradedTotal` so a sustained degraded limiter
    // is alertable.
    if (!rl) {
      if (failMode === "closed") {
        recordRateLimitDegraded(key, "closed");
        try {
          // 5s is a deliberate floor: long enough that retries don't
          // hammer a recovering Redis/Postgres, short enough that real
          // users with a transient network blip don't see a 30s wall.
          res.setHeader("Retry-After", "5");
        } catch {
          /* ignore */
        }
        const requestId = (req as Request & { requestId?: string }).requestId;
        const message =
          "Сервіс тимчасово недоступний. Спробуй за кілька секунд.";
        res.status(503).json({
          error: message,
          message,
          code: "RATE_LIMIT_UNAVAILABLE",
          ...(requestId ? { requestId } : {}),
        });
        return;
      }
      recordRateLimitDegraded(key, "inmem");
      rl = checkRateLimit(req, options);
    }

    // Best-effort sweep of stale rows; runs ~1/256 calls so the table
    // doesn't grow under churning IPs. No-op when Postgres is degraded.
    void maybeSweepPgBuckets(windowMs);
    try {
      // RFC-9239 (draft-ietf-httpapi-ratelimit-headers) `RateLimit-*`
      // headers — це сучасний стандарт; lib-cli (better-fetch / axios-
      // retry-rate-limit) уже їх читають. Тримаємо також старий
      // `X-RateLimit-Remaining` для backward-compat: дашборди і custom-
      // клієнти, які гребли на тому хедері, не зламаються до окремого
      // PR-а на cleanup.
      const resetSec = Math.max(1, Math.ceil(rl.resetMs / 1000));
      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(rl.remaining));
      res.setHeader("RateLimit-Reset", String(resetSec));
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
