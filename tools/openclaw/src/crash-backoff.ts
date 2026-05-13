import { Sentry as DefaultSentry } from "./obs/sentry.js";

/**
 * In-process crash-backoff supervisor for the Telegram bot loops
 * (OpenClaw) hosted in `tools/openclaw/`.
 *
 * Pain P9 in `docs/launch/tech/telegram-improvements-roadmap.md` — when
 * the bot crashes (auth, network, Anthropic 429, unhandled rejection)
 * Railway's `restartPolicyType = ON_FAILURE` rescheduler kicks in within
 * ~10s. Without any in-process backoff that creates a tight crash-loop:
 * the bot dies → Railway restarts → first long-poll fails → bot dies
 * again — burning Anthropic quota and saturating Sentry / log pipelines.
 *
 * This supervisor sits one layer above `startBotWithConflictRetry` and
 * applies a coarse exponential schedule across CRASHES, not across
 * Telegram 409s. The schedule (5s → 15s → 45s → 2min, capped) keeps the
 * worst-case downtime at the Railway-restart-equivalent for one or two
 * blips, but stretches to 2 minutes once the bot is genuinely unhealthy
 * so we stop hammering whichever dependency is failing.
 *
 * A successful uptime of more than `SUCCESS_UPTIME_RESET_MS` resets the
 * consecutive-crash counter so a single bad day does not permanently
 * push the backoff to its cap. The sliding-window alert (>= 5 crashes
 * within `ALERT_WINDOW_MS`) escalates a Sentry breadcrumb from
 * `warning` to `error` so on-call dashboards page the founder when the
 * supervisor itself can't recover the bot.
 */
export const BACKOFF_DELAYS_MS = [5_000, 15_000, 45_000, 120_000] as const;

export const SUCCESS_UPTIME_RESET_MS = 5 * 60_000;
export const ALERT_WINDOW_MS = 10 * 60_000;
export const ALERT_RESTART_THRESHOLD = 5;

export function computeBackoffDelayMs(consecutiveCrashes: number): number {
  if (consecutiveCrashes < 1) return 0;
  const idx = Math.min(consecutiveCrashes - 1, BACKOFF_DELAYS_MS.length - 1);
  return BACKOFF_DELAYS_MS[idx]!;
}

export type CrashBackoffBreadcrumbLevel = "info" | "warning" | "error";

export interface CrashBackoffBreadcrumb {
  category?: string;
  message?: string;
  level?: CrashBackoffBreadcrumbLevel;
  data?: Record<string, unknown>;
}

export interface CrashBackoffSentryLike {
  addBreadcrumb: (b: CrashBackoffBreadcrumb) => void;
}

export interface CrashBackoffOptions {
  /** Human label used in logs and breadcrumb messages (e.g. "openclaw"). */
  label: string;
  /** Replaces `setTimeout` in tests so a fake-clock can drive the loop. */
  sleep?: (ms: number) => Promise<void>;
  /** Replaces `Date.now()` in tests. */
  now?: () => number;
  /** Optional console.warn replacement for assertion in tests. */
  warn?: (message: string) => void;
  /** Sentry-like sink (defaults to the real `@sentry/node` import). */
  sentry?: CrashBackoffSentryLike;
  /**
   * Cap on retries. `Infinity` in production keeps the supervisor alive
   * until the bot exits gracefully; tests pass a finite number so they
   * terminate.
   */
  maxRuns?: number;
}

export interface CrashBackoffResult {
  /** How many times `fn()` was invoked, including the successful run. */
  runs: number;
  /** How many of those invocations rejected. */
  crashes: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name || "Error";
    const message = err.message || "(no message)";
    return `${name}: ${message}`;
  }
  try {
    return String(err);
  } catch {
    return "<unstringifiable error>";
  }
}

/**
 * Run `fn` under the crash-backoff supervisor. Returns when `fn`
 * resolves normally (graceful shutdown). Throws only if `maxRuns` is
 * reached without a successful run — production callers leave
 * `maxRuns` at its default `Infinity`, so this path is test-only.
 */
export async function runWithCrashBackoff(
  fn: () => Promise<void>,
  opts: CrashBackoffOptions,
): Promise<CrashBackoffResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const warn = opts.warn ?? ((msg) => console.warn(msg));
  const sentry = opts.sentry ?? DefaultSentry;
  const label = opts.label;
  const maxRuns = opts.maxRuns ?? Number.POSITIVE_INFINITY;

  // Timestamps of recent crashes, used for the sliding-window alert.
  const crashTimestamps: number[] = [];
  let consecutiveCrashes = 0;
  let runs = 0;
  let crashes = 0;
  let lastError: unknown;

  while (runs < maxRuns) {
    runs += 1;
    const startedAt = now();
    try {
      await fn();
      return { runs, crashes };
    } catch (err) {
      lastError = err;
      const crashedAt = now();
      const uptimeMs = Math.max(0, crashedAt - startedAt);

      // Reset the consecutive counter when the bot proved it could run
      // for a meaningful window before crashing — a fresh fault, not a
      // continuation of the previous outage.
      if (uptimeMs >= SUCCESS_UPTIME_RESET_MS) {
        consecutiveCrashes = 0;
      }
      consecutiveCrashes += 1;
      crashes += 1;

      // Drop timestamps that fell out of the alert window.
      const windowStart = crashedAt - ALERT_WINDOW_MS;
      while (crashTimestamps.length > 0 && crashTimestamps[0]! < windowStart) {
        crashTimestamps.shift();
      }
      crashTimestamps.push(crashedAt);
      const restartsInWindow = crashTimestamps.length;

      const breadcrumbLevel: CrashBackoffBreadcrumbLevel =
        restartsInWindow >= ALERT_RESTART_THRESHOLD ? "error" : "warning";
      const errorDescription = describeError(err);
      const delayMs = computeBackoffDelayMs(consecutiveCrashes);

      sentry.addBreadcrumb({
        category: "openclaw.crash-backoff",
        message: `[${label}] bot crashed (consecutive=${consecutiveCrashes}, in_window=${restartsInWindow})`,
        level: breadcrumbLevel,
        data: {
          label,
          consecutiveCrashes,
          restartsInWindow,
          windowMs: ALERT_WINDOW_MS,
          alertThreshold: ALERT_RESTART_THRESHOLD,
          uptimeMs,
          backoffDelayMs: delayMs,
          lastError: errorDescription,
        },
      });

      warn(
        `[${label}] bot crashed after ${uptimeMs}ms uptime ` +
          `(consecutive=${consecutiveCrashes}, in_window=${restartsInWindow}). ` +
          `Backing off ${delayMs}ms before restart. Last error: ${errorDescription}`,
      );

      if (runs >= maxRuns) break;
      await sleep(delayMs);
    }
  }

  // `maxRuns` exhausted (test-only); surface the last error so callers
  // can fail loudly instead of pretending the bot ever started.
  if (lastError !== undefined) {
    throw lastError;
  }
  return { runs, crashes };
}
