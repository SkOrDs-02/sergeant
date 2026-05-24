/**
 * I7 — Security events typed emitter.
 *
 * Two-layer design:
 *   1. `emitSecurityEvent(event)` — synchronous, never throws. Logs via Pino
 *      at appropriate level, bumps the rate-limit counter, and fans out to
 *      registered listeners.
 *   2. `onSecurityEvent(cb)` / `offSecurityEvent(cb)` — listener registry for
 *      out-of-process push (e.g. Telegram alerts in `securityRoom.ts`).
 *
 * Rate-limit: max `MAX_EVENTS_PER_MINUTE` emissions per event type per 60 s
 * window. Suppressed events are counted in a separate Pino warn — the rate
 * limiter itself never throws.
 *
 * Privacy: `userIdHash` MUST be sha256(userId).slice(0,16) — the raw userId
 * must never appear in this payload (L10 hardening). Callers use `hashUserId`
 * from `lib/userIdHash.ts`.
 *
 * See docs/runbooks/security-events.md for operator playbook.
 */

import { logger } from "./logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityEventName =
  | "mono_webhook_bad_payload"
  | "auth_session_ua_drift"
  | "prompt_injection_attempt"
  | "transcribe_usd_cap_hit"
  | "chat_tool_cap_hit";

export type SecurityEventSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface SecurityEvent {
  event: SecurityEventName;
  severity: SecurityEventSeverity;
  /** sha256(userId).slice(0,16) — never the raw userId (L10). */
  userIdHash?: string | undefined;
  details: string;
  /** ISO 8601 — set automatically if omitted. */
  timestamp?: string | undefined;
}

/** Resolved form with guaranteed timestamp, used by listeners. */
export interface ResolvedSecurityEvent extends SecurityEvent {
  timestamp: string;
}

export type SecurityEventListener = (event: ResolvedSecurityEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit state (per event type)
// ─────────────────────────────────────────────────────────────────────────────

/** Max events per event-type per 60 s window before suppression. */
export const MAX_EVENTS_PER_MINUTE = 10;

interface RateBucket {
  count: number;
  windowStartMs: number;
}

const rateBuckets = new Map<SecurityEventName, RateBucket>();

function isRateLimited(event: SecurityEventName, nowMs: number): boolean {
  const WINDOW_MS = 60_000;
  let bucket = rateBuckets.get(event);
  if (!bucket || nowMs - bucket.windowStartMs >= WINDOW_MS) {
    bucket = { count: 0, windowStartMs: nowMs };
    rateBuckets.set(event, bucket);
  }
  if (bucket.count >= MAX_EVENTS_PER_MINUTE) return true;
  bucket.count++;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Listener registry
// ─────────────────────────────────────────────────────────────────────────────

const listeners: SecurityEventListener[] = [];

/**
 * Register a listener. Called once at boot by `securityRoom.ts`
 * (or other push consumers). Returns an unsubscribe function.
 */
export function onSecurityEvent(cb: SecurityEventListener): () => void {
  listeners.push(cb);
  return () => offSecurityEvent(cb);
}

export function offSecurityEvent(cb: SecurityEventListener): void {
  const idx = listeners.indexOf(cb);
  if (idx !== -1) listeners.splice(idx, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity → Pino level mapping
// ─────────────────────────────────────────────────────────────────────────────

function pinoLevel(
  severity: SecurityEventSeverity,
): "error" | "warn" | "info" | "debug" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warn";
    case "low":
      return "info";
    case "info":
      return "debug";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public emitter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a security event. Never throws. Rate-limited per event type.
 *
 * @example
 * emitSecurityEvent({
 *   event: "mono_webhook_bad_payload",
 *   severity: "high",
 *   details: "Zod validation failed: amount is NaN",
 * });
 */
export function emitSecurityEvent(event: SecurityEvent): void {
  const nowMs = Date.now();

  if (isRateLimited(event.event, nowMs)) {
    // Emit a single Pino warn per suppressed event to keep visibility without
    // spamming downstream consumers.
    try {
      logger.warn({
        msg: "security_event_rate_limited",
        event: event.event,
        severity: event.severity,
      });
    } catch {
      /* logger must never crash the call site */
    }
    return;
  }

  const resolved: ResolvedSecurityEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date(nowMs).toISOString(),
  };

  const logPayload = {
    msg: "security_event",
    event: resolved.event,
    severity: resolved.severity,
    details: resolved.details,
    timestamp: resolved.timestamp,
    ...(resolved.userIdHash ? { userIdHash: resolved.userIdHash } : {}),
  };

  try {
    const level = pinoLevel(resolved.severity);
    logger[level](logPayload);
  } catch {
    /* logger must never crash the call site */
  }

  // Fan-out to listeners (fire-and-forget; listener errors are isolated).
  for (const cb of listeners) {
    try {
      cb(resolved);
    } catch (err) {
      try {
        logger.warn({
          msg: "security_event_listener_error",
          event: resolved.event,
          err: err instanceof Error ? err.message : String(err),
        });
      } catch {
        /* ignore */
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers (exported only for Vitest — not part of production surface)
// ─────────────────────────────────────────────────────────────────────────────

/** Reset internal rate-limit state. For tests only. */
export function _resetRateLimitState(): void {
  rateBuckets.clear();
}

/** Current listener count. For tests only. */
export function _listenerCount(): number {
  return listeners.length;
}
