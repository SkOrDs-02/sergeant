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

export interface AlertsHistoryFilters {
  /** Days look-back window, 1..30. Default 7. */
  days: number;
  /** Top-N noisy workflows to surface, 1..50. Default 10. */
  limit: number;
}

export interface ParsedAlertsCommand {
  /**
   * `pending` — list unacked. `history` — stats for past N days.
   * `help` — usage hint. `unknown` — caller should reply with usage.
   */
  subcommand: "pending" | "history" | "help" | "unknown";
  filters: AlertsPendingFilters;
  /** Set when `subcommand === "history"`. Pre-validated + clamped. */
  historyFilters?: AlertsHistoryFilters | undefined;
  /** Verbatim `since=<dur>` token (e.g. `24h`) for echo in the header. */
  sinceLabel?: string | undefined;
  /** Set when token parsing detected an unrecoverable error. */
  error?: string | undefined;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const HISTORY_DEFAULT_DAYS = 7;
const HISTORY_MAX_DAYS = 30;
const HISTORY_DEFAULT_LIMIT = 10;
const HISTORY_MAX_LIMIT = 50;

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
  if (first === "history") {
    return parseAlertsHistory(tokens.slice(1));
  }
  if (first !== "pending") {
    // Future-proofing: subcommand router so we can add `/alerts ack <id>`
    // or `/alerts mute <topic> <dur>` without breaking parsing.
    if (first === "help" || first === "?") {
      return { subcommand: "help", filters: {} };
    }
    return {
      subcommand: "unknown",
      filters: {},
      error: `Невідома підкоманда \`${tokens[0]}\`. Спробуй \`/alerts pending\` або \`/alerts history\`.`,
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

/**
 * Tokenises `/alerts history [<days>] [limit=<N>]`. Permissive:
 *   - a bare positive integer → `days` (1..30)
 *   - `limit=<N>` → top-N noisy workflows (1..50)
 *   - anything else surfaces an error so the founder doesn't silently
 *     get the default window when they typo'd a flag.
 */
function parseAlertsHistory(tokens: readonly string[]): ParsedAlertsCommand {
  let days = HISTORY_DEFAULT_DAYS;
  let limit = HISTORY_DEFAULT_LIMIT;
  let daysSet = false;

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (lower.startsWith("limit=")) {
      const n = Number(tok.slice("limit=".length));
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return {
          subcommand: "history",
          filters: {},
          error:
            "Невалідний `limit=` параметр. Приклади: `limit=5`, `limit=20`. Max 50.",
        };
      }
      limit = Math.min(HISTORY_MAX_LIMIT, n);
      continue;
    }
    const n = Number(tok);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
      if (n > HISTORY_MAX_DAYS) {
        return {
          subcommand: "history",
          filters: {},
          error: `Максимум вікно — ${HISTORY_MAX_DAYS} днів. Отримав: ${n}.`,
        };
      }
      days = n;
      daysSet = true;
      continue;
    }
    return {
      subcommand: "history",
      filters: {},
      error: `Невідомий токен \`${tok}\`. Приклад: \`/alerts history 14 limit=20\`.`,
    };
  }

  return {
    subcommand: "history",
    filters: {},
    historyFilters: { days, limit },
    sinceLabel: daysSet ? `${days}d` : `${HISTORY_DEFAULT_DAYS}d`,
  };
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
  sinceLabel?: string | undefined;
  filters?: AlertsPendingFilters | undefined;
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
    return `Всі алерти прочитані ✅${filterEcho}`;
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

// ─────────────────────────────────────────────────────────────────────────
// `/alerts history` reply rendering
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wire shape of one row in `GET /api/internal/alerts/history`. Mirrors
 * `AlertHistoryWorkflowStats` in `apps/server/src/modules/alerts/store.ts`
 * — kept duplicated so the console package has zero server dep (same
 * pattern as `PendingAlertItem` above).
 */
export interface HistoryWorkflowStats {
  workflowId: string;
  total: number;
  acked: number;
  escalated: number;
  repeated: number;
  sentryWarned: number;
  ackRatePct: number;
  avgTtaMinutes: number | null;
}

export interface HistorySummary {
  daysBack: number;
  total: number;
  acked: number;
  escalated: number;
  repeated: number;
  sentryWarned: number;
  ackRatePct: number;
  avgTtaMinutes: number | null;
  workflowCount: number;
}

export interface HistoryReplyPayload {
  workflows: readonly HistoryWorkflowStats[];
  summary: HistorySummary;
}

/**
 * Picks the warning glyph for a row by its ack-rate. Mirrors operator
 * intuition: <30% acked is "this workflow is noise"; 30..69% is "needs
 * tuning"; ≥70% is "healthy". Glyphs land on the row to make eyeballing
 * a 10-row list possible without reading every number.
 */
function ackRateGlyph(ratePct: number, total: number): string {
  if (total === 0) return "⚪";
  if (ratePct >= 70) return "🟢";
  if (ratePct >= 30) return "🟡";
  return "🔴";
}

/**
 * Compact workflow-id for the table — n8n raw ids can be long UUIDs.
 * Anything >18 chars truncates; common `wf-XX` / `wfNN` ids pass through
 * unmodified.
 */
function shortWorkflowId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 17)}…`;
}

/**
 * Renders avg TTA in human terms. <1m → `<1m`, 1..59 → `Xm`, 1h+ → `Xh Ym`.
 * Returns `—` when null (no acks in window).
 */
function formatTta(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = Math.round(minutes - hours * 60);
  return remMin === 0 ? `${hours}h` : `${hours}h ${remMin}m`;
}

/**
 * Renders the full reply text for `/alerts history <days>`. Plaintext to
 * match `/alerts pending`. Keeps the body ≤30 lines (per O5-style spec):
 * up to 10 workflow rows + header + footer summary.
 */
export function formatHistoryReply(payload: HistoryReplyPayload): string {
  const { summary } = payload;
  const header =
    `Alert history — last ${summary.daysBack}d ` +
    `(${summary.total} broadcasts, ${summary.workflowCount} workflows)`;

  if (summary.total === 0) {
    return `${header}\nЖодного алерту за період ✅`;
  }

  const rows = payload.workflows.map((w) => {
    const glyph = ackRateGlyph(w.ackRatePct, w.total);
    const ackPart = `${w.acked}/${w.total} acked (${w.ackRatePct}%)`;
    const tierParts: string[] = [];
    if (w.escalated > 0) tierParts.push(`T1×${w.escalated}`);
    if (w.repeated > 0) tierParts.push(`T2×${w.repeated}`);
    if (w.sentryWarned > 0) tierParts.push(`T3×${w.sentryWarned}`);
    const tiers = tierParts.length === 0 ? "" : ` [${tierParts.join(" ")}]`;
    const tta = `avg-tta ${formatTta(w.avgTtaMinutes)}`;
    return `${glyph} ${shortWorkflowId(w.workflowId)} — ${ackPart}, ${tta}${tiers}`;
  });

  const footer =
    `———\nTotals: ${summary.acked}/${summary.total} acked ` +
    `(${summary.ackRatePct}%), avg-tta ${formatTta(summary.avgTtaMinutes)}, ` +
    `T1 ${summary.escalated} · T2 ${summary.repeated} · T3 ${summary.sentryWarned}`;

  return [header, ...rows, footer].join("\n");
}
