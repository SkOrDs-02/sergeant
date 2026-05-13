/**
 * OpenClaw bot bootstrap helpers (ADR-0041).
 *
 * Pure functions that wrap `bot.api.setWebhook` / `bot.api.deleteWebhook`
 * with shape validation + dry-run logging. Kept separate from
 * `tools/console/src/index.ts` so they can be unit-tested without
 * spinning up an HTTP listener.
 *
 * Idempotency: Telegram's `setWebhook` is itself idempotent for a fixed
 * (url, secret_token) pair. We always call it on every container boot
 * — cheaper than reading the current webhook info first, and harmless
 * if Telegram already has the same config.
 */
import type { Bot } from "grammy";
import { Sentry } from "../obs/sentry.js";

export interface OpenClawWebhookConfig {
  /** Public HTTPS URL Telegram should POST updates to. */
  url: string;
  /**
   * Shared secret. Telegram echoes it in
   * `X-Telegram-Bot-Api-Secret-Token`. Min 1, max 256 chars; allowed
   * characters per Bot API: `A-Z a-z 0-9 _ -`. We enforce ≥32 to nudge
   * operators toward strong values; same regex as Telegram's docs.
   */
  secretToken: string;
}

const MIN_SECRET_LEN = 32;
const SECRET_RE = /^[A-Za-z0-9_-]+$/;

/**
 * W4.1 / B.6 hardening (sprint-roadmap O6, tg-improvements-roadmap
 * §4.4, observed 2026-05-03 21:26 UTC):
 *
 * Two failure-modes are folded into one retry loop:
 *
 *   1. **URL-mismatch race.** During the first long-poll → webhook
 *      migration, the old long-poll container's graceful-shutdown
 *      `getUpdates` raced with the new container's `setWebhook` and
 *      silently cleared the webhook on Telegram's side
 *      (`getWebhookInfo` then returned `url=""`). The bot accepted
 *      updates again only after a manual second `setWebhook`.
 *   2. **Transient Telegram API outage at cold start.** A single
 *      `setWebhook` call at boot used to be optimistic — if
 *      `api.telegram.org` was unreachable for ~1s the bot started
 *      _without_ a webhook and the operator only noticed when an
 *      update never arrived. Now we retry both the `setWebhook` AND
 *      the `getWebhookInfo` verification on any thrown error.
 *
 * Caps total wall time so a permanent Telegram outage doesn't block
 * container start indefinitely (sum of the schedule below ≈ 48s).
 */
const WEBHOOK_VERIFY_MAX_ATTEMPTS = 5;
/**
 * Exponential backoff schedule applied _between_ attempts. With
 * {@link WEBHOOK_VERIFY_MAX_ATTEMPTS} = 5 we use indices `0..3`
 * (cumulative wall ≈ 18s). Index `4` (30s) is reserved so we can bump
 * `MAX_ATTEMPTS` to 6 in the future without touching the constants.
 *
 * Ordered to match the user-spec — `[1s, 2s, 5s, 10s, 30s]`.
 */
const WEBHOOK_VERIFY_BACKOFF_DELAYS_MS = [
  1_000, 2_000, 5_000, 10_000, 30_000,
] as const;

/**
 * Validate a `(url, secretToken)` pair the way Telegram does, _before_
 * calling `setWebhook` — gives a clearer error than Telegram's
 * "Bad Request: webhook secret_token is invalid".
 */
export function validateWebhookConfig(config: OpenClawWebhookConfig): void {
  if (!config.url) throw new Error("OPENCLAW_WEBHOOK_URL is empty.");
  let parsed: URL;
  try {
    parsed = new URL(config.url);
  } catch {
    throw new Error(`OPENCLAW_WEBHOOK_URL is not a valid URL: ${config.url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `OPENCLAW_WEBHOOK_URL must use https:// (got ${parsed.protocol}//).`,
    );
  }
  if (!config.secretToken) {
    throw new Error("OPENCLAW_WEBHOOK_SECRET is empty.");
  }
  if (config.secretToken.length < MIN_SECRET_LEN) {
    throw new Error(
      `OPENCLAW_WEBHOOK_SECRET must be ≥${MIN_SECRET_LEN} chars (got ${config.secretToken.length}).`,
    );
  }
  if (!SECRET_RE.test(config.secretToken)) {
    throw new Error(
      "OPENCLAW_WEBHOOK_SECRET must match /^[A-Za-z0-9_-]+$/ (Bot API limit).",
    );
  }
}

/**
 * Sleep helper. Inlined (instead of pulling `node:timers/promises`) so
 * tests can stub it via `vi.useFakeTimers` without touching transitive
 * imports.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stringify an error for logs / Sentry breadcrumb. We deliberately do
 * NOT include `err.stack` — Sentry already attaches the stack via
 * `captureMessage` extras and a 4 KiB breadcrumb is too noisy.
 */
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err);
}

/**
 * Register the webhook with Telegram. Drops any pending updates queued
 * during long-poll mode so the founder doesn't receive a flood of stale
 * messages on the first boot after migration.
 *
 * After `setWebhook` we read back `getWebhookInfo` and confirm the URL
 * stuck — see W4.1 / B.6 race + outage comments above. On mismatch OR
 * any thrown error from the Telegram API we retry the whole pair (max
 * {@link WEBHOOK_VERIFY_MAX_ATTEMPTS} attempts, backoff per
 * {@link WEBHOOK_VERIFY_BACKOFF_DELAYS_MS}). Verification exhaustion
 * is thrown so caller (`tools/console/src/index.ts`) can decide between
 * `process.exit(1)` and falling back to long-poll.
 *
 * Observability:
 *
 *   - Each retry emits a `level="warning"` Sentry breadcrumb with the
 *     failure reason (`api_error` vs `url_mismatch`).
 *   - Final exhaustion emits a `level="error"` `Sentry.captureMessage`
 *     so on-call sees "webhook never registered" as a first-class
 *     Sentry issue (not just a process crash).
 *   - Successful recovery after any retry still emits the existing
 *     `[openclaw] webhook recovered after race` breadcrumb for parity
 *     with W4.1.
 */
export async function registerOpenClawWebhook(
  bot: Bot,
  config: OpenClawWebhookConfig,
): Promise<void> {
  validateWebhookConfig(config);
  let lastInfoUrl = "";
  let lastFailureReason: "api_error" | "url_mismatch" = "url_mismatch";
  let lastApiError: string | undefined;
  for (let attempt = 1; attempt <= WEBHOOK_VERIFY_MAX_ATTEMPTS; attempt += 1) {
    try {
      await bot.api.setWebhook(config.url, {
        secret_token: config.secretToken,
        drop_pending_updates: attempt === 1,
        allowed_updates: ["message", "callback_query"],
      });
      const info = await bot.api.getWebhookInfo();
      lastInfoUrl = info.url ?? "";
      if (lastInfoUrl === config.url) {
        if (attempt > 1) {
          Sentry.addBreadcrumb({
            category: "openclaw.webhook",
            message: `[openclaw] webhook recovered after race (attempt ${attempt})`,
            level: "info",
            data: { url: config.url, attempt },
          });
        }
        return;
      }
      lastFailureReason = "url_mismatch";
      lastApiError = undefined;
    } catch (err) {
      lastFailureReason = "api_error";
      lastApiError = errMessage(err);
    }
    if (attempt >= WEBHOOK_VERIFY_MAX_ATTEMPTS) break;
    const delayMs =
      WEBHOOK_VERIFY_BACKOFF_DELAYS_MS[attempt - 1] ??
      WEBHOOK_VERIFY_BACKOFF_DELAYS_MS[
        WEBHOOK_VERIFY_BACKOFF_DELAYS_MS.length - 1
      ] ??
      1_000;
    const reasonDetail =
      lastFailureReason === "api_error"
        ? `api_error=${lastApiError ?? "<unknown>"}`
        : `expected=${config.url} actual=${lastInfoUrl || "<empty>"}`;
    Sentry.addBreadcrumb({
      category: "openclaw.webhook",
      message: `[openclaw] setWebhook retry (attempt ${attempt}/${WEBHOOK_VERIFY_MAX_ATTEMPTS}, reason=${lastFailureReason})`,
      level: "warning",
      data: {
        url: config.url,
        attempt,
        maxAttempts: WEBHOOK_VERIFY_MAX_ATTEMPTS,
        delayMs,
        reason: lastFailureReason,
        ...(lastApiError ? { apiError: lastApiError } : {}),
      },
    });
    console.warn(
      `[openclaw] setWebhook ${lastFailureReason} ` +
        `(attempt ${attempt}/${WEBHOOK_VERIFY_MAX_ATTEMPTS}). ` +
        `${reasonDetail}. retrying in ${delayMs}ms (W4.1/B.6).`,
    );
    await sleep(delayMs);
  }
  // All attempts exhausted — surface to Sentry at error-level so
  // on-call sees "webhook never registered" instead of just a process
  // crash log line on Railway.
  Sentry.captureMessage(
    `[openclaw] setWebhook failed after ${WEBHOOK_VERIFY_MAX_ATTEMPTS} attempts`,
    {
      level: "error",
      tags: {
        module: "openclaw",
        op: "setWebhook",
        reason: lastFailureReason,
      },
      extra: {
        url: config.url,
        attempts: WEBHOOK_VERIFY_MAX_ATTEMPTS,
        lastInfoUrl: lastInfoUrl || null,
        lastApiError: lastApiError ?? null,
      },
    },
  );
  if (lastFailureReason === "api_error") {
    throw new Error(
      `OpenClaw webhook registration failed after ${WEBHOOK_VERIFY_MAX_ATTEMPTS} attempts: ` +
        `Telegram API error — ${lastApiError ?? "<unknown>"}. ` +
        `Check api.telegram.org reachability + OPENCLAW_BOT_TOKEN, then redeploy.`,
    );
  }
  throw new Error(
    `OpenClaw webhook verification failed after ${WEBHOOK_VERIFY_MAX_ATTEMPTS} attempts: ` +
      `Telegram reports url=${lastInfoUrl || "<empty>"}, expected=${config.url}. ` +
      `Check OPENCLAW_WEBHOOK_URL / OPENCLAW_WEBHOOK_SECRET, then redeploy.`,
  );
}

/**
 * Detach any registered webhook so the bot can fall back to long-poll
 * (e.g. when an operator unsets `OPENCLAW_USE_WEBHOOK` and redeploys).
 * Telegram returns OK whether or not a webhook was previously set, so
 * this is safe to call unconditionally on long-poll boot.
 */
export async function unregisterOpenClawWebhook(bot: Bot): Promise<void> {
  await bot.api.deleteWebhook({ drop_pending_updates: false });
}

/**
 * Resolve `OPENCLAW_USE_WEBHOOK` to a strict boolean. Anything other
 * than `true` / `1` / `yes` is treated as long-poll mode — fail-closed
 * vs. accidentally enabling webhook with bad URL/secret config.
 */
export function shouldUseWebhook(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
