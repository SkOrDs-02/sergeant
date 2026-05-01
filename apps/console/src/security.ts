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

export function isUserAllowed(
  userId: number | undefined,
  env: ConsoleEnv = process.env,
): boolean {
  if (!userId) return false;

  const allowed = parseAllowedUserIds(env.ALLOWED_USER_IDS);
  if (allowed.size > 0) return allowed.has(String(userId));

  return env.NODE_ENV !== "production";
}

export function parseRateLimitPerMinute(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 12;
  return Math.floor(parsed);
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  private readonly prunerInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now = () => Date.now(),
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

  allow(key: string): boolean {
    const current = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= current) {
      this.buckets.set(key, { count: 1, resetAt: current + this.windowMs });
      return true;
    }

    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }
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
