/**
 * OpenClaw bot bootstrap helpers (ADR-0041).
 *
 * Pure functions that wrap `bot.api.setWebhook` / `bot.api.deleteWebhook`
 * with shape validation + dry-run logging. Kept separate from
 * `apps/console/src/index.ts` so they can be unit-tested without
 * spinning up an HTTP listener.
 *
 * Idempotency: Telegram's `setWebhook` is itself idempotent for a fixed
 * (url, secret_token) pair. We always call it on every container boot
 * — cheaper than reading the current webhook info first, and harmless
 * if Telegram already has the same config.
 */
import type { Bot } from "grammy";

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
 * Register the webhook with Telegram. Drops any pending updates queued
 * during long-poll mode so the founder doesn't receive a flood of stale
 * messages on the first boot after migration.
 */
export async function registerOpenClawWebhook(
  bot: Bot,
  config: OpenClawWebhookConfig,
): Promise<void> {
  validateWebhookConfig(config);
  await bot.api.setWebhook(config.url, {
    secret_token: config.secretToken,
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"],
  });
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
