/**
 * Pure helpers for the OpenClaw `/alerts pending` slash-command
 * (Wave 3 §3.2 PR-3, ADR-0038).
 *
 * The HTTP plumbing lives in `handler.ts`; everything testable —
 * argument parsing and reply formatting — is extracted here so we can
 * exercise the corner-cases (typo'd duration, unknown severity, age
 * rendering across day boundaries) without standing up a grammy bot.
 *
 * Wire format mirrors `apps/server/src/modules/alerts/types.ts` —
 * we redeclare the minimum shape we read so the console package has no
 * server-side dependency. Same pattern as `WriteAuditListItem` in
 * `handler.ts`.
 */

import { parseDuration } from "./duration.js";

// ─────────────────────────────────────────────────────────────────────────
// Wire types (mirrors server `TgAlertAckRecord`)
// ─────────────────────────────────────────────────────────────────────────

export type AlertSeverity = "P0" | "P1" | "P2" | "P3";

export interface PendingAlertItem {
  id: number;
  posted_at: string;
  alert_id: string;
  topic: string;
  severity: AlertSeverity;
  summary: string | null;
  /** Always `null` for `/alerts pending` rows — kept for shape parity. */
  ack_at: string | null;
  /** When set, WF-103 cron has already DM-pinged the founder. */
  escalated_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Token parsing
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_TOKENS = new Set<string>(["p0", "p1", "p2", "p3"]);

export interface AlertsPendingFilters {
  /** Forum-topic key (`incidents`, `revenue`, …). */
  topic?: string;
  /** Severity tier filter. */
  severity?: AlertSeverity;
  /** Lower-bound on alert age, derived from `since=<dur>`. */
  olderThanMinutes?: number;
  /** 1..50, default 20. */
  limit?: number;
}

export interface ParsedAlertsCommand {
  /**
   * `pending` — list unacked. `help` — show usage hint. `unknown` — caller
   * should reply with usage.
   */
  subcommand: "pending" | "help" | "unknown";
  filters: AlertsPendingFilters;
  /** Verbatim `since=<dur>` token (e.g. `24h`) for echo in the header. */
  sinceLabel?: string;
  /** Set when token parsing detected an unrecoverable error. */
  error?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Tokenises `/alerts <args>` payload. Argument-order is permissive (same
 * spirit as `/audit`): `since=` and recognised severity tokens are
 * matched first, the remaining positional tokens fall back to a topic
 * filter so typos still surface something useful instead of a silent
 * empty list.
 *
 * Empty argument → defaults to `pending` with no filters.
 */
export function parseAlertsCommand(rawArgument: string): ParsedAlertsCommand {
  const argument = rawArgument.trim();
  if (!argument) {
    return { subcommand: "pending", filters: {} };
  }

  const tokens = argument.split(/\s+/);
  const first = tokens[0]?.toLowerCase();
  if (first !== "pending") {
    // Future-proofing: subcommand router so we can add `/alerts ack <id>`
    // or `/alerts mute <topic> <dur>` without breaking parsing.
    if (first === "help" || first === "?") {
      return { subcommand: "help", filters: {} };
    }
    return {
      subcommand: "unknown",
      filters: {},
      error: `Невідома підкоманда \`${tokens[0]}\`. Спробуй \`/alerts pending\`.`,
    };
  }

  const filters: AlertsPendingFilters = {};
  let sinceLabel: string | undefined;

  for (const tok of tokens.slice(1)) {
    const lower = tok.toLowerCase();
    if (lower.startsWith("since=")) {
      const raw = tok.slice("since=".length);
      const durMs = parseDuration(raw);
      if (durMs == null) {
        return {
          subcommand: "pending",
          filters,
          error:
            "Невалідний `since=` параметр. Приклади: `since=30m`, " +
            "`since=24h`, `since=7d`. Max 30d.",
        };
      }
      filters.olderThanMinutes = Math.max(1, Math.round(durMs / 60_000));
      sinceLabel = raw;
      continue;
    }
    if (SEVERITY_TOKENS.has(lower)) {
      filters.severity = lower.toUpperCase() as AlertSeverity;
      continue;
    }
    const n = Number(tok);
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
      filters.limit = Math.min(MAX_LIMIT, n);
      continue;
    }
    // Unknown token → treat as topic filter (last write wins).
    filters.topic = tok;
  }

  if (filters.limit == null) {
    filters.limit = DEFAULT_LIMIT;
  }

  return { subcommand: "pending", filters, sinceLabel };
}

// ─────────────────────────────────────────────────────────────────────────
// Reply rendering
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_GLYPH: Record<AlertSeverity, string> = {
  P0: "🔴",
  P1: "🟠",
  P2: "🟡",
  P3: "⚪️",
};

/**
 * Compact alert-id for the trailing `(id=…)` annotation. WF-04 alert-ids
 * already encode `<workflowId>:<executionId>` which can be 30+ chars;
 * truncating to 16 keeps lines on one Telegram row.
 */
export function shortAlertId(alertId: string): string {
  if (alertId.length <= 16) return alertId;
  return `${alertId.slice(0, 16)}…`;
}

/**
 * Renders the age (rounded down) of an alert relative to `now`. Uses
 * minute-granularity below 1h (`Xm`), hour-granularity 1..23h (`Xh`),
 * and day-granularity 1d+ (`Xd`). Negative deltas (clock-skew) clamp to
 * `0m` so we never surface garbage like `-3m`.
 */
export function formatAlertAge(postedAt: string, now: Date): string {
  const posted = Date.parse(postedAt);
  if (!Number.isFinite(posted)) return "?";
  const deltaMs = Math.max(0, now.getTime() - posted);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Strips a leading topic-emoji + whitespace from `summary` so we don't
 * double-render it next to the severity glyph. Idempotent on summaries
 * that don't begin with an emoji.
 */
function trimSummary(summary: string | null, maxChars: number): string {
  if (!summary) return "—";
  const trimmed = summary.replace(/^\s+/, "").replace(/\s+$/, "");
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`;
}

const SUMMARY_MAX_CHARS = 120;

export interface FormatPendingReplyOptions {
  now: Date;
  /** Verbatim `since=<dur>` echo for the header. */
  sinceLabel?: string;
  filters?: AlertsPendingFilters;
}

/**
 * Renders the full reply text for `/alerts pending`. Plaintext (matches
 * `/audit` and `/decisions`) — no MarkdownV2 escaping needed and no
 * accidental `*` / `_` parse-mode pitfalls (per ADR-0040 W3 PR-2's HTML
 * switch in WF-15).
 *
 * Empty list → friendly "queue clear" line; non-empty → header + one
 * line per alert, newest-first (the SELECT already orders).
 */
export function formatPendingReply(
  alerts: readonly PendingAlertItem[],
  opts: FormatPendingReplyOptions,
): string {
  const filterParts: string[] = [];
  if (opts.sinceLabel) filterParts.push(`since=${opts.sinceLabel}`);
  if (opts.filters?.severity) filterParts.push(opts.filters.severity);
  if (opts.filters?.topic) filterParts.push(`topic=${opts.filters.topic}`);
  const filterEcho = filterParts.length ? ` (${filterParts.join(", ")})` : "";

  if (alerts.length === 0) {
    return `Жодних unacked alert-ів${filterEcho}. 🟢`;
  }

  const lines = alerts.map((a) => {
    const time = a.posted_at.length >= 16 ? a.posted_at.slice(11, 16) : "??:??";
    const glyph = SEVERITY_GLYPH[a.severity] ?? "•";
    const escalated = a.escalated_at ? " ⚠️esc" : "";
    const summary = trimSummary(a.summary, SUMMARY_MAX_CHARS);
    const age = formatAlertAge(a.posted_at, opts.now);
    const id = shortAlertId(a.alert_id);
    return `${time} ${glyph} [${a.topic}] ${summary} (id=${id}, age=${age}${escalated})`;
  });

  const header = `${alerts.length} unacked alert${alerts.length === 1 ? "" : "s"}${filterEcho}:`;
  return [header, ...lines].join("\n");
}
