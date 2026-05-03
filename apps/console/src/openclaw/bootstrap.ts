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
 * W4.1 hardening (docs/deploy/console.md, observed 2026-05-03 21:26 UTC):
 * during the first long-poll → webhook migration, the old long-poll
 * container's graceful-shutdown `getUpdates` raced with the new
 * container's `setWebhook` and silently cleared the webhook on
 * Telegram's side (`getWebhookInfo` then returned `url=""`). The bot
 * accepted updates again only after a manual second `setWebhook`.
 *
 * To make this self-healing on every redeploy, after `setWebhook` we
 * verify with `getWebhookInfo` that Telegram actually retained the URL
 * we just set, and retry up to N times with exponential backoff if the
 * stored URL is wrong / empty. Caps total wall time so a permanent
 * Telegram outage doesn't block container start indefinitely.
 */
const WEBHOOK_VERIFY_MAX_ATTEMPTS = 3;
const WEBHOOK_VERIFY_BASE_DELAY_MS = 500;
const WEBHOOK_VERIFY_MAX_DELAY_MS = 4_000;

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
 * Register the webhook with Telegram. Drops any pending updates queued
 * during long-poll mode so the founder doesn't receive a flood of stale
 * messages on the first boot after migration.
 *
 * After `setWebhook` we read back `getWebhookInfo` and confirm the URL
 * stuck — see W4.1 race comment above. On mismatch we retry the
 * `setWebhook` call (max {@link WEBHOOK_VERIFY_MAX_ATTEMPTS} attempts).
 * Verification failures are thrown so caller (`apps/console/src/index.ts`)
 * can decide between `process.exit(1)` and falling back to long-poll.
 */
export async function registerOpenClawWebhook(
  bot: Bot,
  config: OpenClawWebhookConfig,
): Promise<void> {
  validateWebhookConfig(config);
  let lastInfoUrl = "";
  for (let attempt = 1; attempt <= WEBHOOK_VERIFY_MAX_ATTEMPTS; attempt += 1) {
    await bot.api.setWebhook(config.url, {
      secret_token: config.secretToken,
      drop_pending_updates: attempt === 1,
      allowed_updates: ["message", "callback_query"],
    });
    const info = await bot.api.getWebhookInfo();
    lastInfoUrl = info.url ?? "";
    if (lastInfoUrl === config.url) return;
    if (attempt >= WEBHOOK_VERIFY_MAX_ATTEMPTS) break;
    const delayMs = Math.min(
      WEBHOOK_VERIFY_BASE_DELAY_MS * 2 ** (attempt - 1),
      WEBHOOK_VERIFY_MAX_DELAY_MS,
    );
    console.warn(
      `[openclaw] getWebhookInfo url mismatch after setWebhook ` +
        `(attempt ${attempt}/${WEBHOOK_VERIFY_MAX_ATTEMPTS}). ` +
        `expected=${config.url} actual=${lastInfoUrl || "<empty>"}. ` +
        `retrying in ${delayMs}ms (W4.1 race).`,
    );
    await sleep(delayMs);
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
