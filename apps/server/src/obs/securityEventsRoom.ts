/**
 * I7 — Bridge: connects the in-process `securityEvents` emitter to a direct
 * Telegram push via `SERGEANT_ALERT_BOT_TOKEN`.
 *
 * Architecture note: the API server and OpenClaw bot run in separate
 * processes. The server sends Telegram messages directly — the same pattern
 * used by `modules/alerts/telegramShipper.ts`. The formatter lives in
 * `tools/openclaw/src/openclaw/securityRoom.ts` (OpenClaw package) for
 * symmetry with the bot side, but since server → openclaw is not a declared
 * pnpm workspace dependency, we replicate the minimal send logic here.
 *
 * Muting: set `SECURITY_EVENTS_MUTED=1` to suppress Telegram push without
 * removing call sites (useful for load-test windows).
 *
 * Fail-open: Telegram errors are logged at warn level and never propagate to
 * callers.
 */

import { logger } from "./logger.js";
import { onSecurityEvent, type ResolvedSecurityEvent } from "./securityEvents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatter (mirrors securityRoom.ts in the openclaw tool package)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<ResolvedSecurityEvent["severity"], string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
  info: "⚪",
};

function formatMessage(event: ResolvedSecurityEvent): string {
  const emoji = SEVERITY_EMOJI[event.severity] ?? "⚠️";
  const lines = [
    `${emoji} [${event.severity.toUpperCase()}] security_event`,
    `Event: ${event.event}`,
    `Details: ${event.details}`,
  ];
  if (event.userIdHash) lines.push(`UserHash: ${event.userIdHash}`);
  lines.push(`Time: ${event.timestamp}`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram send (thin fetch wrapper — fail-open)
// ─────────────────────────────────────────────────────────────────────────────

async function sendToTelegram(event: ResolvedSecurityEvent): Promise<void> {
  if (process.env["SECURITY_EVENTS_MUTED"] === "1") return;

  const botToken = process.env["SERGEANT_ALERT_BOT_TOKEN"];
  const chatId = process.env["SERGEANT_OPS_CHAT_ID"];
  if (!botToken || !chatId) return; // not configured — skip silently

  const text = formatMessage(event);
  const threadId = process.env["TELEGRAM_TOPIC_ENGINEERING"];

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_notification:
      event.severity === "low" || event.severity === "info",
  };
  if (threadId) {
    const n = Number(threadId);
    if (Number.isFinite(n)) body["message_thread_id"] = n;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const desc = await res.text().catch(() => `HTTP ${res.status}`);
    logger.warn({
      msg: "security_event_telegram_push_failed",
      event: event.event,
      httpStatus: res.status,
      description: desc,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the Telegram push listener. Returns an unsubscribe handle for
 * clean shutdown (useful in tests).
 */
export function registerSecurityEventsRoom(): () => void {
  return onSecurityEvent((event) => {
    sendToTelegram(event).catch((err: unknown) => {
      logger.warn({
        msg: "security_event_telegram_push_error",
        event: event.event,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
