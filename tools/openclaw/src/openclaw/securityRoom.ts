/**
 * I7 — Security events Telegram push for OpenClaw.
 *
 * Architecture note: the server process and the OpenClaw bot process are
 * separate. The server's `securityEvents.ts` emitter fan-outs to in-process
 * listeners only.  For cross-process delivery we use the existing
 * `SERGEANT_ALERT_BOT_TOKEN` + `SERGEANT_OPS_CHAT_ID` that the server already
 * owns (same env var set used by `modules/alerts/telegramShipper.ts`).
 *
 * The server calls `pushSecurityEventToTelegram(event, env)` directly from its
 * own `onSecurityEvent` listener (registered in
 * `apps/server/src/obs/securityEventsRoom.ts`). This file lives in the
 * openclaw tool package so the formatting and Telegram-send logic can be
 * imported by both sides if they ever share a process, and can be unit-tested
 * here alongside the other openclaw formatter tests.
 *
 * Telegram message format:
 *   🔴/🟠/🟡/🟢 [SEVERITY] security event
 *   Event: <name>
 *   Details: <details>
 *   UserHash: <hash>  (only if present)
 *   Time: <ISO>
 *
 * Fail-open: every error is logged + swallowed. The server should never crash
 * because Telegram is unreachable.
 *
 * Muting: set `SECURITY_EVENTS_MUTED=1` in the server env to suppress push
 * without removing call sites.
 */

export interface SecurityEventPayload {
  event: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  userIdHash?: string | undefined;
  details: string;
  timestamp: string;
}

export interface SecurityRoomEnv {
  SERGEANT_ALERT_BOT_TOKEN?: string | undefined;
  SERGEANT_OPS_CHAT_ID?: string | undefined;
  TELEGRAM_TOPIC_ENGINEERING?: string | undefined;
  SECURITY_EVENTS_MUTED?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatter
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<SecurityEventPayload["severity"], string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
  info: "⚪",
};

export function formatSecurityEventMessage(
  event: SecurityEventPayload,
): string {
  const emoji = SEVERITY_EMOJI[event.severity] ?? "⚠️";
  const lines = [
    `${emoji} [${event.severity.toUpperCase()}] security_event`,
    `Event: ${event.event}`,
    `Details: ${event.details}`,
  ];
  if (event.userIdHash) {
    lines.push(`UserHash: ${event.userIdHash}`);
  }
  lines.push(`Time: ${event.timestamp}`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram send (thin wrapper — reuses the same fetch pattern as
// telegramShipper.ts to avoid a shared-state dep across package boundary)
// ─────────────────────────────────────────────────────────────────────────────

export interface SendResult {
  ok: boolean;
  reason?: string | undefined;
}

export async function pushSecurityEventToTelegram(
  event: SecurityEventPayload,
  env: SecurityRoomEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  // Mute switch — operator can set this flag to silence alerts temporarily.
  if (env.SECURITY_EVENTS_MUTED === "1") {
    return { ok: true, reason: "muted" };
  }

  const botToken = env.SERGEANT_ALERT_BOT_TOKEN;
  const chatId = env.SERGEANT_OPS_CHAT_ID;

  if (!botToken || !chatId) {
    return {
      ok: false,
      reason: "SERGEANT_ALERT_BOT_TOKEN or SERGEANT_OPS_CHAT_ID not configured",
    };
  }

  const text = formatSecurityEventMessage(event);

  // Use the engineering topic if available, otherwise post to the supergroup
  // without a thread (ops-level visibility).
  const messageThreadId = env.TELEGRAM_TOPIC_ENGINEERING
    ? Number(env.TELEGRAM_TOPIC_ENGINEERING)
    : undefined;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_notification: event.severity === "low" || event.severity === "info",
  };
  if (messageThreadId !== undefined && Number.isFinite(messageThreadId)) {
    body["message_thread_id"] = messageThreadId;
  }

  try {
    const res = await fetcher(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const desc = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, reason: desc };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
