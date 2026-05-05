export interface ConsoleEnv {
  ALLOWED_USER_IDS?: string;
  CONSOLE_RATE_LIMIT_PER_MIN?: string;
  NODE_ENV?: string;
}

export function parseAllowedUserIds(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

/**
 * Allowlist gate for the Sergeant Console bot. **Fail-closed**: an
 * empty / undefined `ALLOWED_USER_IDS` rejects every user, including
 * outside production. Mirrors `tools/console/src/openclaw/security.ts`
 * (`isFounderAllowed`) and closes the audit gap in
 * [`docs/security/hardening/M15-console-allowlist-fail-closed.md`](../../../docs/security/hardening/M15-console-allowlist-fail-closed.md):
 * a `NODE_ENV` that is not exactly `"production"` (staging, preview,
 * Railway-side typo) must never silently fall through to "let everyone
 * in". To run the bot locally, set `ALLOWED_USER_IDS=<your-tg-id>`.
 */
export function isUserAllowed(
  userId: number | undefined,
  env: ConsoleEnv = process.env,
): boolean {
  if (!userId) return false;
  const allowed = parseAllowedUserIds(env.ALLOWED_USER_IDS);
  if (allowed.size === 0) return false;
  return allowed.has(String(userId));
}

export function parseRateLimitPerMinute(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 12;
  return Math.floor(parsed);
}

/**
 * Reason for the most recent `FixedWindowRateLimiter.allow` denial.
 *
 * - `per_user` — the per-user bucket is full but the global cap (if any)
 *   still has headroom. Caller can keep handling traffic from other users.
 * - `global` — the cross-user cap is exhausted; the bot is over its
 *   collective budget and EVERY user should back off until the window
 *   rolls. Used by M17 (`docs/security/hardening/M17-console-global-rate-cap.md`)
 *   to flag aggregate abuse / runaway prompt-loops across the allowlist.
 */
export type RateLimitDenyReason = "per_user" | "global";

/**
 * Optional secondary global bucket for {@link FixedWindowRateLimiter}.
 * `key` is the cross-user identifier (e.g. `bot:console`) and `limit`
 * is the cross-user request budget per window. Set both to `null` /
 * `undefined` to disable the global cap (single-bucket behaviour).
 */
export interface GlobalRateLimitOptions {
  /** Cross-user bucket key (e.g. `bot:console`). */
  key: string;
  /** Aggregate request budget per window. */
  limit: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  private readonly prunerInterval: ReturnType<typeof setInterval>;

  /** Reason for the most recent {@link allow} denial; `null` after a pass. */
  private lastDenyReason: RateLimitDenyReason | null = null;

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now = () => Date.now(),
    private readonly globalCap: GlobalRateLimitOptions | null = null,
  ) {
    // Prune stale buckets periodically to prevent unbounded memory growth.
    this.prunerInterval = setInterval(() => {
      const current = this.now();
      for (const [key, bucket] of this.buckets) {
        if (bucket.resetAt <= current) this.buckets.delete(key);
      }
    }, windowMs);
    // Allow Node to exit even if this limiter is still alive.
    if (typeof this.prunerInterval === "object") this.prunerInterval.unref();
  }

  /** Stop the background pruner. Call when the limiter is no longer needed. */
  dispose(): void {
    clearInterval(this.prunerInterval);
  }

  /**
   * Check whether one more request from `key` is allowed under both the
   * per-user bucket and the (optional) global cap. M17 — both buckets
   * must have headroom; whichever exhausts first wins. The global bucket
   * is consumed only after the per-user bucket has passed, so a
   * blocked-on-per-user request never spends the cross-user budget.
   */
  allow(key: string): boolean {
    const current = this.now();
    if (!this.tryConsume(key, this.limit, current)) {
      this.lastDenyReason = "per_user";
      return false;
    }
    if (
      this.globalCap &&
      !this.tryConsume(this.globalCap.key, this.globalCap.limit, current)
    ) {
      this.lastDenyReason = "global";
      return false;
    }
    this.lastDenyReason = null;
    return true;
  }

  /**
   * Why the last {@link allow} call returned `false`. Returns `null` if
   * the last call passed (or no call has been made yet). Call-sites use
   * this to emit M17 `console.global_rate_cap_hit_total` only when the
   * cross-user cap (not the per-user bucket) was the deciding factor.
   */
  lastDeny(): RateLimitDenyReason | null {
    return this.lastDenyReason;
  }

  private tryConsume(key: string, limit: number, current: number): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      this.buckets.set(key, { count: 1, resetAt: current + this.windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }
}

/**
 * Default cross-user budget for the console bot (M17). Sized
 * conservatively: at the default per-user `CONSOLE_RATE_LIMIT_PER_MIN=12`
 * one user fits inside the cap, but five concurrent allowlisted users
 * collectively exhaust it before any one user hits their personal limit.
 * Tunable via `CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN`.
 */
export const DEFAULT_CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN = 30;

/**
 * Cross-user bucket key for the console bot (M17). Single value because
 * the console process today runs one bot per Railway service; if the
 * service ever multiplexes bots, key on `bot:<token-hash>` instead.
 */
export const CONSOLE_GLOBAL_RATE_LIMIT_KEY = "bot:console";

export function parseGlobalRateLimitPerMinute(
  value: string | undefined,
  fallback: number = DEFAULT_CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function escapeTelegramMarkdownV2(value: string): string {
  return value.replace(/([\\_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function splitTelegramMessage(
  value: string,
  maxLength = 3900,
): string[] {
  if (value.length <= maxLength) return [value];

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += maxLength) {
    chunks.push(value.slice(index, index + maxLength));
  }
  return chunks;
}
