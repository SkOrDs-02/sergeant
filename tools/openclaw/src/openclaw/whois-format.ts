/**
 * `/openclaw whois <tg_id|@username>` — pure parser + HTML renderer.
 *
 * Args parser: numeric Telegram-id (signed integer 1..2^53-1) АБО
 * `@username` (3-64 знаки, alphanumeric+underscore — Telegram spec).
 * Empty input → `kind: "missing"` (handler рендерить help-text).
 *
 * Renderer групує aggregator output (`WhoisSnapshot`) у HTML payload з
 * 5 секцій: user info, allowlist + founder, recent invocations (last 7d),
 * mute-state, top-5 tools. Failures-soft з aggregator-у експонуються як
 * inline-error рядки, що НЕ ламають інший snapshot.
 *
 * Реюз `htmlEscape` / `formatRelativeUa` з `status-format.ts` — щоб
 * Telegram-HTML escape-логіка лишалась single-source.
 */

import { formatRelativeUa, htmlEscape } from "./status-format.js";

// ─────────────────────────────────────────────────────────────────────────
// Argument parser
// ─────────────────────────────────────────────────────────────────────────

export type WhoisArgKind = "numeric" | "username" | "missing" | "invalid";

export interface ParsedWhoisArg {
  kind: WhoisArgKind;
  /** Для `numeric` — числовий tg-id; для `username` — без leading `@`. */
  value: string;
  /** Людська помилка для `invalid`/`missing` (UA, передається у reply). */
  error?: string;
}

// Telegram username spec: must start with a letter (a-z, case-insensitive),
// 3-64 chars, alphanumeric+underscore. We use this stricter form rather
// than `[A-Za-z0-9_]` so 19-digit numeric overflow doesn't sneak through
// as a "username".
const USERNAME_RE = /^@?([A-Za-z][A-Za-z0-9_]{2,63})$/;
const NUMERIC_RE = /^[0-9]{1,15}$/;

/**
 * Декодить аргумент `/openclaw whois <X>`. Trim-ається + перший token
 * (можуть бути додаткові слова — ігноруємо їх, не падаємо). Numeric
 * має fit-итись у Number.MAX_SAFE_INTEGER (15 знаків достатньо для TG
 * id < 10^15).
 */
export function parseWhoisArg(rawArgument: string): ParsedWhoisArg {
  const trimmed = (rawArgument ?? "").trim();
  if (trimmed.length === 0) {
    return {
      kind: "missing",
      value: "",
      error: "Очікую <tg_id> або <code>@username</code>.",
    };
  }
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  if (NUMERIC_RE.test(firstToken)) {
    return { kind: "numeric", value: firstToken };
  }
  const usernameMatch = firstToken.match(USERNAME_RE);
  if (usernameMatch && usernameMatch[1]) {
    return { kind: "username", value: usernameMatch[1] };
  }
  return {
    kind: "invalid",
    value: firstToken,
    error: `Невалідний аргумент «${firstToken}». Очікую numeric tg-id або <code>@username</code>.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Snapshot types — mirror server-side `WhoisResult` shape
// ─────────────────────────────────────────────────────────────────────────

export type WhoisTelegramErrorCode =
  | "forbidden"
  | "rate_limit"
  | "api_error"
  | "not_found";

export interface WhoisTelegramErrorPayload {
  code: WhoisTelegramErrorCode;
  message: string;
  retryAfter?: number;
}

export interface WhoisToolUsage {
  tool: string;
  count: number;
}

export interface WhoisMuteState {
  mutedUntilIso: string | null;
  setAtIso: string;
  reason: string | null;
}

export interface WhoisSnapshot {
  tgUserId: number;
  resolvedFrom: "numeric" | "username";
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  inAllowlist: boolean;
  isFounder: boolean;
  invocations7d: number;
  lastSeenIso: string | null;
  topTools: ReadonlyArray<WhoisToolUsage>;
  muteState: WhoisMuteState | null;
  telegramError: WhoisTelegramErrorPayload | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Help text
// ─────────────────────────────────────────────────────────────────────────

export const WHOIS_HELP_TEXT = [
  "<b>/openclaw whois</b> — debug-snapshot per Telegram user.",
  "",
  "Usage:",
  "  <code>/openclaw whois 123456789</code> — за numeric tg-id",
  "  <code>/openclaw whois @username</code> — за @username (Bot API getChat)",
  "",
  "Snapshot:",
  "  • user info: id / name / @username",
  "  • allowlist: чи цей користувач у allowlist (зараз = isFounder)",
  "  • last-7d invocations count + last-seen (UA relative)",
  "  • mute-state (тільки якщо це founder)",
  "  • top-5 tool-call names by count",
].join("\n");

// ─────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────

function renderUserLine(snapshot: WhoisSnapshot): string {
  const idCode = `<code>${snapshot.tgUserId || "?"}</code>`;
  const fullName = [snapshot.firstName, snapshot.lastName]
    .filter((s): s is string => Boolean(s && s.length > 0))
    .map(htmlEscape)
    .join(" ");
  const handle = snapshot.username ? `@${htmlEscape(snapshot.username)}` : null;
  const parts: string[] = [idCode];
  if (fullName) parts.push(fullName);
  if (handle) parts.push(handle);
  return `<b>User:</b> ${parts.join(" — ")}`;
}

function renderAllowlistLine(snapshot: WhoisSnapshot): string {
  const allow = snapshot.inAllowlist ? "yes" : "no";
  const founder = snapshot.isFounder ? "yes" : "no";
  return `<b>Allowlist:</b> ${allow} · <b>Founder:</b> ${founder}`;
}

function renderActivityLine(snapshot: WhoisSnapshot, now: Date): string {
  const last = snapshot.lastSeenIso
    ? htmlEscape(formatRelativeUa(snapshot.lastSeenIso, now))
    : "ніколи";
  return `<b>Activity:</b> ${snapshot.invocations7d} invocations (7d) · last: ${last}`;
}

function renderMuteLine(snapshot: WhoisSnapshot, now: Date): string {
  if (!snapshot.isFounder) return "<b>Mute:</b> n/a (не founder)";
  if (!snapshot.muteState) return "<b>Mute:</b> off";
  const { mutedUntilIso, reason } = snapshot.muteState;
  if (!mutedUntilIso) {
    return reason
      ? `<b>Mute:</b> off · «${htmlEscape(reason)}»`
      : "<b>Mute:</b> off";
  }
  const expiry = new Date(mutedUntilIso).getTime();
  if (Number.isNaN(expiry) || expiry <= now.getTime()) {
    return "<b>Mute:</b> expired";
  }
  const inFuture = formatRelativeUa(
    new Date(now.getTime() - (expiry - now.getTime())).toISOString(),
    now,
  );
  // formatRelativeUa rolls forward time → "5 хв тому" семантика
  // інвертована у «ще ≈5 хв». Спрощуємо: показуємо ISO + reason.
  const reasonSuffix = reason ? ` · «${htmlEscape(reason)}»` : "";
  return `<b>Mute:</b> active until ${htmlEscape(mutedUntilIso)} (≈${htmlEscape(inFuture)})${reasonSuffix}`;
}

function renderToolsBlock(snapshot: WhoisSnapshot): string[] {
  if (snapshot.topTools.length === 0) {
    return ["<b>Top tools (7d):</b> —"];
  }
  const lines: string[] = ["<b>Top tools (7d):</b>"];
  for (const t of snapshot.topTools.slice(0, 5)) {
    lines.push(`  • <code>${htmlEscape(t.tool)}</code> × ${t.count}`);
  }
  return lines;
}

function renderTelegramErrorLine(snapshot: WhoisSnapshot): string | null {
  const err = snapshot.telegramError;
  if (!err) return null;
  const codeLabel: Record<WhoisTelegramErrorCode, string> = {
    forbidden: "forbidden (bot blocked)",
    rate_limit: "rate-limit",
    api_error: "API error",
    not_found: "not found",
  };
  const tail = err.retryAfter ? ` · retry after ${err.retryAfter}s` : "";
  return `<i>⚠ Telegram: ${htmlEscape(codeLabel[err.code])}${tail}</i>`;
}

/**
 * Compact HTML payload — ≤12 рядків у звичайному state-у. Кожна секція
 * fail-soft (Telegram error → одна `⚠`-стрічка, не блокує rest).
 */
export function formatWhoisSnapshot(
  snapshot: WhoisSnapshot,
  now: Date = new Date(),
): string {
  const lines: string[] = [];
  lines.push("<b>🦅 OpenClaw whois</b>");
  lines.push("");
  lines.push(renderUserLine(snapshot));
  lines.push(renderAllowlistLine(snapshot));
  lines.push(renderActivityLine(snapshot, now));
  lines.push(renderMuteLine(snapshot, now));
  lines.push(...renderToolsBlock(snapshot));
  const errLine = renderTelegramErrorLine(snapshot);
  if (errLine) {
    lines.push("");
    lines.push(errLine);
  }
  return lines.join("\n");
}

/**
 * Single-line fallback коли aggregator повернув 5xx або HTTP-error —
 * щоб handler міг швидко reply-нути без full-snapshot path-у.
 */
export function formatWhoisEndpointFailure(
  status: number,
  message: string,
): string {
  return [
    "<b>🦅 OpenClaw whois</b>",
    "",
    `<i>Aggregator endpoint failed: HTTP ${status}.</i>`,
    `<code>${htmlEscape(message)}</code>`,
  ].join("\n");
}
