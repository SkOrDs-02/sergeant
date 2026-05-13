/**
 * `/openclaw` slash-command parser + status snapshot renderer (pure, no I/O).
 *
 * `/openclaw status` — debug/health snapshot для founder DM: яка persona
 * дефолтна, які workflow-и активні у n8n, останні invocation-и
 * `openclaw_invocations`, AI-budget state і останній Sentry error. Для
 * ad-hoc diagnostics + smoke-test після redeploy.
 *
 * Modes:
 *   - `/openclaw` (default) → status
 *   - `/openclaw status` → render snapshot
 *   - `/openclaw help` → usage card
 *
 * Парсер exhaustive: будь-який невідомий token мапиться у
 * `subcommand: "unknown"` + людський error-message.
 *
 * Renderer compact HTML, ≤30 рядків (вимога з task-у). Кожна секція
 * fail-soft рендериться окремо — якщо одне з 5 джерел впало, інші
 * рендеряться нормально, та секція показує "недоступно (HTTP NNN)".
 */

import type { OpenClawPersona } from "../agents/personas.js";

export type OpenclawSubcommand = "status" | "help" | "unknown";

export interface ParsedOpenclawCommand {
  /** Розв'язана підкоманда. `unknown` коли token не зрозумілий. */
  subcommand: OpenclawSubcommand;
  /** Сирий argument-токен, як ввів user (для логування / debug-у). */
  rawArgument: string;
  /** Людський error-message для невідомого token-а. Undefined для valid. */
  error?: string;
}

/**
 * Парсить argument після `/openclaw` (тобто `c.match` у grammy). Першим
 * не-whitespace token-ом визначається підкоманда.
 *
 * Empty input → status (default subcommand), так щоб `/openclaw` без
 * аргументів "просто працював".
 */
export function parseOpenclawCommand(
  rawArgument: string,
): ParsedOpenclawCommand {
  const trimmed = (rawArgument ?? "").trim();
  if (trimmed.length === 0) {
    return { subcommand: "status", rawArgument: "" };
  }
  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  switch (firstToken) {
    case "status":
    case "help":
      return { subcommand: firstToken, rawArgument: trimmed };
    default:
      return {
        subcommand: "unknown",
        rawArgument: trimmed,
        error: `Невідома підкоманда «${firstToken}». Доступні: status, help.`,
      };
  }
}

/**
 * Help text для `/openclaw help`. HTML-format щоб гармонувати з HELP_TEXT
 * у `handler-constants.ts`.
 */
export const OPENCLAW_HELP_TEXT = [
  "<b>/openclaw</b> — debug/health snapshot для OpenClaw.",
  "",
  "Usage:",
  "  <code>/openclaw</code> — те саме, що <code>/openclaw status</code>",
  "  <code>/openclaw status</code> — поточний state (persona / WF / invocations / budget / Sentry)",
  "  <code>/openclaw help</code> — ця довідка",
  "",
  "Snapshot включає:",
  "  • default persona + дозволені 5 personas (ADR-0033, Phase 2.5)",
  "  • last 10 invocations з <code>openclaw_invocations</code>",
  "  • active n8n workflows (Tier A/B/C/D, з manifest.json)",
  "  • daily AI budget — spent / cap / залишок",
  "  • останній Sentry error (level: error)",
].join("\n");

// ─────────────────────────────────────────────────────────────────────────
// Snapshot types — shape passed to formatStatusSnapshot()
// ─────────────────────────────────────────────────────────────────────────

export interface InvocationRow {
  id: number;
  invokedAt: string;
  trigger: string;
  status: string;
  userMessage: string;
  durationMs: number;
  costUsd: number;
  toneMode: string | null;
}

export interface WorkflowRow {
  id: string;
  name: string;
  active: boolean;
  tier: string;
}

export interface BudgetState {
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  allowed: boolean;
}

export interface SentryIssue {
  title: string;
  level: string;
  count: string;
  permalink: string;
}

/**
 * Aggregated snapshot, готовий до рендерингу. Кожна з 5 секцій
 * незалежна: пара `{data, error, notConfigured?}` — рівно одна з них
 * non-null. Якщо все три null — секція рендерить "—".
 */
export interface StatusSnapshot {
  generatedAtIso: string;
  activePersona: OpenClawPersona;
  allowedPersonas: ReadonlyArray<OpenClawPersona>;
  invocations: {
    data: ReadonlyArray<InvocationRow> | null;
    error: string | null;
  };
  workflows: {
    data: ReadonlyArray<WorkflowRow> | null;
    error: string | null;
    notConfigured: boolean;
  };
  budget: {
    data: BudgetState | null;
    error: string | null;
  };
  lastError: {
    data: SentryIssue | null;
    error: string | null;
    notConfigured: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// HTML rendering primitives
// ─────────────────────────────────────────────────────────────────────────

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** Escape HTML entities. Telegram HTML mode allows only &amp; &lt; &gt;. */
export function htmlEscape(s: string): string {
  return s.replace(/[&<>]/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Human-readable relative time (UA): "5 хв тому", "2 год тому", "вчора".
 * Empty / invalid ISO → "?".
 */
export function formatRelativeUa(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return "?";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "?";
  const diffMs = now.getTime() - t;
  if (diffMs < 0) return "щойно";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "щойно";
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчора";
  if (days < 30) return `${days} дн тому`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} міс тому`;
  return `${Math.floor(months / 12)} р тому`;
}

/** Truncate to `max` chars з ellipsis. Stable для коротших inputs. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

// ─────────────────────────────────────────────────────────────────────────
// Main renderer
// ─────────────────────────────────────────────────────────────────────────

/**
 * Render the full snapshot as a compact HTML message. Target ≤ 30 рядків
 * (task-вимога). Розбито на 5 sub-renderers, що рендерять окремі секції;
 * вони не throw-ають і завжди повертають single-line або multi-line stub
 * у разі error / not-configured.
 */
export function formatStatusSnapshot(
  snapshot: StatusSnapshot,
  now: Date = new Date(),
): string {
  const lines: string[] = [];
  lines.push("<b>🦅 OpenClaw status</b>");
  lines.push("");
  lines.push(renderPersonaLine(snapshot));
  lines.push(renderBudgetLine(snapshot.budget));
  lines.push("");
  lines.push("<b>n8n WF:</b>");
  lines.push(renderWorkflowsBlock(snapshot.workflows));
  lines.push("");
  lines.push("<b>Last 10 invocations:</b>");
  lines.push(renderInvocationsBlock(snapshot.invocations, now));
  lines.push("");
  lines.push("<b>Last error (Sentry):</b>");
  lines.push(renderLastErrorBlock(snapshot.lastError));
  lines.push("");
  lines.push(
    `<i>snapshot @ ${htmlEscape(formatRelativeUa(snapshot.generatedAtIso, now))}</i>`,
  );
  return lines.join("\n");
}

function renderPersonaLine(snapshot: StatusSnapshot): string {
  const others = snapshot.allowedPersonas
    .filter((p) => p !== snapshot.activePersona)
    .join(", ");
  return [
    "<b>Persona:</b> <code>",
    htmlEscape(snapshot.activePersona),
    "</code> (default)",
    others ? ` · також: <code>${htmlEscape(others)}</code>` : "",
  ].join("");
}

function renderBudgetLine(budget: StatusSnapshot["budget"]): string {
  if (budget.error) {
    return `<b>Budget:</b> недоступно (${htmlEscape(budget.error)})`;
  }
  if (!budget.data) {
    return "<b>Budget:</b> —";
  }
  const { spentUsd, budgetUsd, remainingUsd, allowed } = budget.data;
  const status = allowed ? "OK" : "⚠️ exceeded";
  return [
    `<b>Budget:</b> $${spentUsd.toFixed(4)} / $${budgetUsd.toFixed(2)}`,
    ` (залишок $${remainingUsd.toFixed(4)}, ${status})`,
  ].join("");
}

function renderWorkflowsBlock(workflows: StatusSnapshot["workflows"]): string {
  if (workflows.notConfigured) {
    return "  <i>n8n credentials not configured</i>";
  }
  if (workflows.error) {
    return `  недоступно (${htmlEscape(workflows.error)})`;
  }
  if (!workflows.data || workflows.data.length === 0) {
    return "  —";
  }
  const active = workflows.data.filter((w) => w.active);
  const inactive = workflows.data.filter((w) => !w.active);
  const activeLabel = active.length === 0 ? "—" : `${active.length} active`;
  const inactiveLabel =
    inactive.length === 0 ? "" : ` · ${inactive.length} paused`;
  // Compact: counts on header line + first few active workflow names.
  const sampleNames = active
    .slice(0, 3)
    .map((w) => `<code>${htmlEscape(w.id)}</code>`)
    .join(", ");
  const moreSuffix = active.length > 3 ? `, +${active.length - 3} more` : "";
  return [
    `  ${activeLabel}${inactiveLabel}`,
    sampleNames ? `\n  ${sampleNames}${moreSuffix}` : "",
  ].join("");
}

function renderInvocationsBlock(
  invocations: StatusSnapshot["invocations"],
  now: Date,
): string {
  if (invocations.error) {
    return `  недоступно (${htmlEscape(invocations.error)})`;
  }
  if (!invocations.data || invocations.data.length === 0) {
    return "  —";
  }
  return invocations.data
    .slice(0, 10)
    .map((row) => renderInvocationLine(row, now))
    .join("\n");
}

function renderInvocationLine(row: InvocationRow, now: Date): string {
  const when = formatRelativeUa(row.invokedAt, now);
  const statusGlyph = STATUS_GLYPH[row.status] ?? "·";
  const message = truncate(row.userMessage.replace(/\s+/g, " "), 40);
  return [
    `  ${statusGlyph} <code>${htmlEscape(row.trigger)}</code>`,
    ` · ${htmlEscape(when)} · ${htmlEscape(message)}`,
  ].join("");
}

const STATUS_GLYPH: Record<string, string> = {
  success: "✅",
  error: "❌",
  budget_exceeded: "💸",
  iteration_cap: "🔁",
  allowlist_fail: "🛑",
  dm_only_violation: "🚷",
};

function renderLastErrorBlock(lastError: StatusSnapshot["lastError"]): string {
  if (lastError.notConfigured) {
    return "  <i>Sentry not configured</i>";
  }
  if (lastError.error) {
    return `  недоступно (${htmlEscape(lastError.error)})`;
  }
  if (!lastError.data) {
    return "  немає errors";
  }
  const { title, level, count } = lastError.data;
  const compactTitle = truncate(title.replace(/\s+/g, " "), 60);
  return `  <code>${htmlEscape(level)}</code> · ${htmlEscape(compactTitle)} (×${htmlEscape(count)})`;
}
