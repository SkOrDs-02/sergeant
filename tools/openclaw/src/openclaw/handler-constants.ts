/**
 * Pure constants and stateless helpers for the OpenClaw bot handler.
 * Split out of `handler.ts` (PR-36) so the orchestrator stays slim and
 * each concern is independently testable.
 *
 * Anything that closes over `bot`/`config`/runtime state lives in the
 * sibling `handler-*.ts` factory modules. This file exports values that
 * are safe to import from anywhere — including tests that need to
 * assert on `HELP_TEXT` or `WRITE_TOOL_LABEL` without spinning up a
 * grammy `Bot` instance.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import type { OpenClawPersona } from "../agents/personas.js";
import type { ApprovalRecord, WriteToolName } from "./approval-store.js";

// ─────────────────────────────────────────────────────────────────────────
// Public config + response shapes (mirrors what handler.ts used to own).
// ─────────────────────────────────────────────────────────────────────────

export interface OpenClawBotConfig {
  bot: Bot;
  anthropic: Anthropic;
  serverUrl: string;
  internalApiKey: string;
  founderUserId: string;
  maxIterations: number;
}

export interface BudgetResponse {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  reason?: string;
}

export interface OpenInvocationResponse {
  invocationId: number;
}

// ADR-0037 (Phase 4.5): write-audit log payload sent to
// `/api/internal/openclaw/write-audit/log` on every approve/reject/executed.
// `responseExcerpt` is truncated client-side as a defence-in-depth even
// though the server also caps at 4 KB — keeps the network payload bounded.
export const RESPONSE_EXCERPT_MAX_BYTES = 4_000;

export interface WriteAuditLogBody {
  approvalId: string;
  tool: string;
  founderUserId: string;
  founderTgUserId: number;
  invocationId?: number | null;
  action: "approved" | "executed" | "rejected";
  input?: Record<string, unknown>;
  httpStatus?: number | null;
  ok?: boolean | null;
  responseExcerpt?: string | null;
  persona?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WriteAuditListItem {
  id: number;
  recorded_at: string;
  approval_id: string;
  tool: string;
  founder_user_id: string;
  founder_tg_user_id: number;
  invocation_id: number | null;
  action: "approved" | "executed" | "rejected";
  input: Record<string, unknown>;
  http_status: number | null;
  ok: boolean | null;
  response_excerpt: string | null;
  persona: string | null;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────
// Persona / write-tool label tables
// ─────────────────────────────────────────────────────────────────────────

export const PERSONA_LABEL: Record<OpenClawPersona, string> = {
  cofounder: "Cofounder",
  ops: "Ops",
  growth: "Growth",
  eng: "Eng",
  finance: "Finance",
};

export const WRITE_TOOL_LABEL: Record<WriteToolName, string> = {
  commit_to_strategy_doc: "Commit strategy doc PR",
  create_github_issue: "Create GitHub issue",
  post_to_topic: "Post to topic",
  pause_workflow: "Pause n8n workflow",
  mute_alert: "Mute Sentry issue",
};

// ADR-0036 (Phase 4): callback_data prefix for inline-keyboard buttons.
// `oc:approve:<id>` / `oc:reject:<id>`. Telegram caps callback_data at 64
// bytes; with an 8-char id we land at 19 bytes — comfortable headroom.
export const APPROVAL_PREFIX = "oc:";
export const APPROVAL_APPROVE = `${APPROVAL_PREFIX}approve:`;
export const APPROVAL_REJECT = `${APPROVAL_PREFIX}reject:`;

// ─────────────────────────────────────────────────────────────────────────
// Council budget (M16: per-session pre-flight headroom).
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_COUNCIL_USD_BUDGET = 2.0;

/**
 * Скільки lifecycle-USD має бути в залишку, щоб дозволити запуск
 * `/council` (sequential 4 personas + cofounder synthesis = ~5 turn-ів).
 * Phase 1 не парсить usage з Anthropic, тому це opportunity-cap проти
 * запуску council вечером, коли денний budget уже з'їдено.
 */
export function parseCouncilUsdBudget(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return DEFAULT_COUNCIL_USD_BUDGET;
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────
// HELP_TEXT — Telegram-HTML.
// HTML mode (не Markdown). Legacy Markdown ламався на:
//  • brackets `[tool]` / `[csv]` без `(url)` — інтерпретуються як початок
//    untyped link і fail-парсять текст;
//  • непарна кількість `_` через `recorded_at`, `Sergeant_alert_bot`,
//    `_Phase ..._` — Telegram повертав 400 "Can't find end of the entity".
// HTML mode безпечний — потрібно екранити тільки `<`, `>`, `&`. Тримаємо
// розмітку мінімальною: <b>, <i>, <code>.
//
// Re-exported through `handler.ts` для `parse-mode-guard.test.ts` —
// regression-сторож проти reintroduce-у Markdown-варіанту (інцидент
// 2026-05-03, PR #1568).
// ─────────────────────────────────────────────────────────────────────────

export const HELP_TEXT = [
  "<b>OpenClaw</b> — твій co-founder bot.",
  "",
  "Я аналізую дані Sergeant (PG, Stripe, Sentry, PostHog, GitHub, n8n logs, strategy docs)",
  "і даю advisory-думку. Я не пишу в продакшн.",
  "",
  "<b>Agent network (WF-20):</b>",
  "/status, /assign, /review, /run, /approve, /cancel, /logs",
  "Free-text execution запити про CI/PR/GitHub/n8n/security теж підуть у WF-20.",
  "",
  "<b>Швидкі cofounder prompts:</b>",
  "/metrics — детальні метрики за тиждень",
  "/digest — growth-дайджест (PostHog + GitHub releases + n8n)",
  "",
  "<b>Personas (ADR-0033, Phase 2.5):</b>",
  "/ops &lt;q&gt; — reliability фокус (Sentry + n8n + healthz)",
  "/growth &lt;q&gt; — PostHog + GitHub releases + strategy docs",
  "/eng &lt;q&gt; — GitHub PRs + schema + engineering topic",
  "/finance &lt;q&gt; — Stripe + cofounder memory + decisions",
  "/cofounder &lt;q&gt; — default синтез (всі tools)",
  "/council &lt;q&gt; — round-table: ops → growth → eng → finance → cofounder synthesis",
  "",
  "<b>Strategic modes (ADR-0031, Phase 3 skeleton):</b>",
  "/plan &lt;topic&gt; — 4-step planning (goal → context → options → decision)",
  "/analyze &lt;anomaly&gt; — hypothesis-driven root-cause аналіз",
  "/okr — огляд активних OKR (KR progress + bottlenecks + next actions)",
  "",
  "<b>Службові:</b>",
  "/decisions — останні зафіксовані рішення",
  "/audit [tool] [action] [since=24h|7d|30m] [csv] — write-actions журнал;",
  "       <code>since=</code> фільтрує по recorded_at (max 30d), <code>csv</code> шле документ.",
  "/alerts pending [p0|p1] [topic] [since=15m] — unacked Sergeant_alert_bot броадкасти;",
  "       без аргументів — топ-20 unacked, newest-first.",
  "/alerts history [&lt;days&gt;] [limit=&lt;N&gt;] — past-N-days workflow stats;",
  "       default — last 7d, top-10 noisy workflows (ack-rate + avg-tta).",
  "/strategy [list|add|done|abandon|carry] — per-persona weekly goals (PR-34).",
  "       <code>/strategy add finyk: &lt;text&gt;</code>; <code>/strategy list active</code>.",
  "/budget — поточний денний spend",
  "/ritual [morning|weekly|monthly|help] — ad-hoc ritual trigger (WF-25 mirror)",
  "/ai_cost — AI-spend rollup: today/week/month + budget + top endpoints",
  "/perf — server perf snapshot: HTTP/AI latency, DB pool, AI memory queue, top errors",
  "/openclaw [status|help] — debug snapshot: persona / WF / invocations / budget / Sentry",
  "/mute [30m|1h|4h|8h|until-morning|status|off|help] — pause bot pings (P0 alerts override)",
  "/reset — почати нову сесію",
  "/help — ця довідка",
  "",
  "<i>Phase 1, ADR-0031 + ADR-0032 + ADR-0033.</i>",
].join("\n");

// ADR-0032: локальні cofounder prompts, які лишаються в OpenClaw loop. Команди
// agent-network (`/status`, `/review`, `/run`, ...) реєструються нижче окремо і
// йдуть у WF-20.
export const COMMAND_PROMPTS: Record<string, string> = {
  metrics: [
    "Детальний metrics-зріз за останні 7 днів:",
    "1) Stripe (success/failed/gross),",
    "2) PostHog (pageview trend),",
    "3) Sentry (по severity).",
    "Покажи аномалії, якщо побачив.",
  ].join(" "),
  digest: [
    "Growth-дайджест за тиждень:",
    "PostHog pageviews trend,",
    "найновіші GitHub releases (5 шт),",
    "плюс топ-3 n8n workflow executions.",
    "Дай 3 highlights і 1 ризик/блокер.",
  ].join(" "),
};

// ─────────────────────────────────────────────────────────────────────────
// Slash-command tables (DM)
// ─────────────────────────────────────────────────────────────────────────

// ADR-0032: Sergeant Console (ADR-0027) slash-команди (/ops, /content, …)
// зливаються в OpenClaw як preset-prompts через той самий agent-turn loop.
// Тригер ідентифікує запит у audit-log-у (`openclaw_invocations.trigger`).
//
// ADR-0031, Phase 3 (PR-34): `/plan` removed з dispatcher-у — тепер це
// strategic-mode entry-point (4-step planning primer). Execution-orientовані
// дії все одно роутяться через free-text → `shouldDelegateOpenClawToAgentNetwork`.
export const DISPATCHER_COMMANDS = [
  "status",
  "assign",
  "review",
  "run",
  "approve",
  "cancel",
  "logs",
] as const;

export const PERSONA_COMMANDS: ReadonlyArray<{
  cmd: string;
  persona: OpenClawPersona;
}> = [
  { cmd: "ops", persona: "ops" },
  { cmd: "growth", persona: "growth" },
  { cmd: "eng", persona: "eng" },
  { cmd: "finance", persona: "finance" },
  { cmd: "cofounder", persona: "cofounder" },
];

// ─────────────────────────────────────────────────────────────────────────
// summariseWriteInput — single-line preview shown on the approval card.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a single-line summary of a write-tool's input for the approval
 * card. Avoids dumping huge file contents — for `commit_to_strategy_doc`
 * we show only the path + commit message (the LLM's narrative reply
 * already includes context for what's changing).
 */
export function summariseWriteInput(record: ApprovalRecord): string {
  const inp = record.input as Record<string, unknown>;
  switch (record.tool) {
    case "commit_to_strategy_doc": {
      const path = String(inp["path"] ?? "?");
      const message = String(inp["message"] ?? "?");
      return `\`${path}\` — ${message}`;
    }
    case "create_github_issue": {
      const title = String(inp["title"] ?? "?");
      return `«${title}»`;
    }
    case "post_to_topic": {
      const topic = String(inp["topic"] ?? "?");
      const text = String(inp["text"] ?? "");
      const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text;
      return `topic=${topic}: ${preview}`;
    }
    case "pause_workflow": {
      const wid = String(inp["workflowId"] ?? "?");
      const reason = inp["reason"] ? ` (${String(inp["reason"])})` : "";
      return `workflow=${wid}${reason}`;
    }
    case "mute_alert": {
      const issue = String(inp["issueId"] ?? "?");
      const until = inp["untilIso"] ? ` until ${String(inp["untilIso"])}` : "";
      return `issue=${issue}${until}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Inline keyboards — O7: /help discovery + persona quick-row
// ─────────────────────────────────────────────────────────────────────────

/**
 * Persona quick-row for /start (boot) message: one button per specialist
 * persona. Tapping a button sends the command as a new message via
 * `switch_inline_current_chat` — but for DM bots the simplest approach
 * is to rely on Telegram's deep-link trick: the button text IS the
 * slash-command, so the founder taps it and knows to type it. We use
 * `callback_data` with an `oc:persona:` prefix instead so we can handle
 * the tap without requiring the user to type.
 */
export const PERSONA_CALLBACK_PREFIX = "oc:persona:";

export function buildPersonaQuickRow(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔧 /ops", `${PERSONA_CALLBACK_PREFIX}ops`)
    .text("📈 /growth", `${PERSONA_CALLBACK_PREFIX}growth`)
    .text("⚙️ /eng", `${PERSONA_CALLBACK_PREFIX}eng`)
    .text("💰 /finance", `${PERSONA_CALLBACK_PREFIX}finance`);
}

/**
 * Full help inline keyboard — two rows:
 * Row 1: persona commands
 * Row 2: common operational commands
 */
export function buildHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔧 /ops", `${PERSONA_CALLBACK_PREFIX}ops`)
    .text("📈 /growth", `${PERSONA_CALLBACK_PREFIX}growth`)
    .text("⚙️ /eng", `${PERSONA_CALLBACK_PREFIX}eng`)
    .text("💰 /finance", `${PERSONA_CALLBACK_PREFIX}finance`)
    .row()
    .text("🤝 /cofounder", `${PERSONA_CALLBACK_PREFIX}cofounder`)
    .text("🏛 /council", "oc:cmd:council")
    .text("📊 /metrics", "oc:cmd:metrics")
    .text("📋 /digest", "oc:cmd:digest");
}

// ─────────────────────────────────────────────────────────────────────────
// postJson — small fetch wrapper used everywhere we hit the internal API.
// ─────────────────────────────────────────────────────────────────────────

export async function postJson<T>(
  url: string,
  apiKey: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

// ─────────────────────────────────────────────────────────────────────────
// parseApprovalCallback — pure parser for inline-keyboard callback_data.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve approve/reject from the callback_query.data string. Returns
 * `null` if data is malformed or unknown (caller answers the callback
 * with a friendly message in that case).
 */
export function parseApprovalCallback(
  data: string,
): { kind: "approve" | "reject"; id: string } | null {
  if (data.startsWith(APPROVAL_APPROVE)) {
    return { kind: "approve", id: data.slice(APPROVAL_APPROVE.length) };
  }
  if (data.startsWith(APPROVAL_REJECT)) {
    return { kind: "reject", id: data.slice(APPROVAL_REJECT.length) };
  }
  return null;
}
