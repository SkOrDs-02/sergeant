/**
 * OpenClaw DM bot handler (ADR-0031).
 *
 * Boundary semantics (fail-closed):
 *   1) DM-only: ignore non-private chats silently (no auto-leave; bot не
 *      повинен deceive-нути founder-а ніби спілкується у групі).
 *   2) Allowlist: тільки `OPENCLAW_FOUNDER_TG_USER_ID`. Інший user → reply
 *      "Access denied." без жодного routing-у.
 *   3) Budget: pre-call check `/api/internal/openclaw/budget`. Якщо
 *      `allowed=false` → reply про exceeded і exit (audit-log status =
 *      'budget_exceeded'). Жодного Claude-call-у не робиться.
 *   4) Iteration cap: винесений у agent-loop через `maxIterations`.
 *   5) Audit: invocation відкрита перед AI-call-ом, finalized після;
 *      навіть failed paths мають `finalize` з відповідним status-ом.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  buildDispatcherPayload,
  dispatchToN8n,
  formatApprovalPrompt,
  shouldDelegateOpenClawToAgentNetwork,
} from "../agents/dispatcher.js";
import {
  runOpenClawAgent,
  writeToolRoute,
  type OpenClawAgentDeps,
} from "../agents/openclaw.js";
import { COUNCIL_PERSONAS, type OpenClawPersona } from "../agents/personas.js";
import {
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  splitTelegramMessage,
} from "../security.js";
import {
  ApprovalStore,
  PendingApprovalsCollector,
  type ApprovalRecord,
  type WriteToolName,
} from "./approval-store.js";
import {
  isFounderAllowed,
  isPrivateChat,
  parseFounderTgUserId,
  parseOpenClawRateLimitPerMinute,
} from "./security.js";
import { OpenClawSessionStore } from "./session.js";

const DEFAULT_COUNCIL_USD_BUDGET = 2.0;
/**
 * Скільки lifecycle-USD має бути в залишку, щоб дозволити запуск
 * `/council` (sequential 4 personas + cofounder synthesis = ~5 turn-ів).
 * Phase 1 не парсить usage з Anthropic, тому це opportunity-cap проти
 * запуску council вечером, коли денний budget уже з'їдено.
 */
function parseCouncilUsdBudget(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return DEFAULT_COUNCIL_USD_BUDGET;
  return parsed;
}

const PERSONA_LABEL: Record<OpenClawPersona, string> = {
  cofounder: "Cofounder",
  ops: "Ops",
  growth: "Growth",
  eng: "Eng",
  finance: "Finance",
};

// ADR-0036 (Phase 4): callback_data prefix for inline-keyboard buttons.
// `oc:approve:<id>` / `oc:reject:<id>`. Telegram caps callback_data at 64
// bytes; with an 8-char id we land at 19 bytes — comfortable headroom.
const APPROVAL_PREFIX = "oc:";
const APPROVAL_APPROVE = `${APPROVAL_PREFIX}approve:`;
const APPROVAL_REJECT = `${APPROVAL_PREFIX}reject:`;

const WRITE_TOOL_LABEL: Record<WriteToolName, string> = {
  commit_to_strategy_doc: "Commit strategy doc PR",
  create_github_issue: "Create GitHub issue",
  post_to_topic: "Post to topic",
  pause_workflow: "Pause n8n workflow",
  mute_alert: "Mute Sentry issue",
};

/**
 * Build a single-line summary of a write-tool's input for the approval
 * card. Avoids dumping huge file contents — for `commit_to_strategy_doc`
 * we show only the path + commit message (the LLM's narrative reply
 * already includes context for what's changing).
 */
function summariseWriteInput(record: ApprovalRecord): string {
  const inp = record.input as Record<string, unknown>;
  switch (record.tool) {
    case "commit_to_strategy_doc": {
      const path = String(inp.path ?? "?");
      const message = String(inp.message ?? "?");
      return `\`${path}\` — ${message}`;
    }
    case "create_github_issue": {
      const title = String(inp.title ?? "?");
      return `«${title}»`;
    }
    case "post_to_topic": {
      const topic = String(inp.topic ?? "?");
      const text = String(inp.text ?? "");
      const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text;
      return `topic=${topic}: ${preview}`;
    }
    case "pause_workflow": {
      const wid = String(inp.workflowId ?? "?");
      const reason = inp.reason ? ` (${String(inp.reason)})` : "";
      return `workflow=${wid}${reason}`;
    }
    case "mute_alert": {
      const issue = String(inp.issueId ?? "?");
      const until = inp.untilIso ? ` until ${String(inp.untilIso)}` : "";
      return `issue=${issue}${until}`;
    }
  }
}

const HELP_TEXT = [
  "*OpenClaw* — твій co-founder bot.",
  "",
  "Я аналізую дані Sergeant (PG, Stripe, Sentry, PostHog, GitHub, n8n logs, strategy docs)",
  "і даю advisory-думку. Я не пишу в продакшн.",
  "",
  "*Agent network (WF-20):*",
  "/status, /plan, /assign, /review, /run, /approve, /cancel, /logs",
  "Free-text execution запити про CI/PR/GitHub/n8n/security теж підуть у WF-20.",
  "",
  "*Швидкі cofounder prompts:*",
  "/metrics — детальні метрики за тиждень",
  "/digest — growth-дайджест (PostHog + GitHub releases + n8n)",
  "",
  "*Personas (ADR-0033, Phase 2.5):*",
  "/ops <q> — reliability фокус (Sentry + n8n + healthz)",
  "/growth <q> — PostHog + GitHub releases + strategy docs",
  "/eng <q> — GitHub PRs + schema + engineering topic",
  "/finance <q> — Stripe + cofounder memory + decisions",
  "/cofounder <q> — default синтез (всі tools)",
  "/council <q> — round-table: ops → growth → eng → finance → cofounder synthesis",
  "",
  "*Службові:*",
  "/decisions — останні зафіксовані рішення",
  "/audit — останні write-actions (approve/reject/executed)",
  "/budget — поточний денний spend",
  "/reset — почати нову сесію",
  "/help — ця довідка",
  "",
  "_Phase 1, ADR-0031 + ADR-0032 + ADR-0033._",
].join("\n");

// ADR-0032: локальні cofounder prompts, які лишаються в OpenClaw loop. Команди
// agent-network (`/status`, `/review`, `/run`, ...) реєструються нижче окремо і
// йдуть у WF-20.
const COMMAND_PROMPTS: Record<string, string> = {
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

export interface OpenClawBotConfig {
  bot: Bot;
  anthropic: Anthropic;
  serverUrl: string;
  internalApiKey: string;
  founderUserId: string;
  maxIterations: number;
}

interface BudgetResponse {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  reason?: string;
}

interface OpenInvocationResponse {
  invocationId: number;
}

// ADR-0037 (Phase 4.5): write-audit log payload sent to
// `/api/internal/openclaw/write-audit/log` on every approve/reject/executed.
// `responseExcerpt` is truncated client-side as a defence-in-depth even
// though the server also caps at 4 KB — keeps the network payload bounded.
const RESPONSE_EXCERPT_MAX_BYTES = 4_000;

interface WriteAuditLogBody {
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

interface WriteAuditListItem {
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

async function postJson<T>(
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

/**
 * Прикріплює handler-и до OpenClaw bot-у. Caller відповідає за `bot.start()`.
 *
 * `bot` лишається параметром (а не `bot.start()` всередині), щоб caller міг
 * запускати декілька bot-ів у `Promise.all` — стандартний grammy-pattern
 * для multi-bot процесів.
 */
export function attachOpenClawHandlers(config: OpenClawBotConfig): {
  sessions: OpenClawSessionStore;
  rateLimiter: FixedWindowRateLimiter;
} {
  const {
    bot,
    anthropic,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
  } = config;

  const sessions = new OpenClawSessionStore();
  const rateLimiter = new FixedWindowRateLimiter(
    parseOpenClawRateLimitPerMinute(process.env.OPENCLAW_RATE_LIMIT_PER_MIN),
  );
  const councilUsdBudget = parseCouncilUsdBudget(
    process.env.OPENCLAW_COUNCIL_USD_BUDGET,
  );

  // ADR-0036 (Phase 4): single approval-store shared across all agent
  // turns in this process. Per-turn `PendingApprovalsCollector` is created
  // inside `runAgentTurn` and drained afterwards.
  const approvalStore = new ApprovalStore();

  /**
   * ADR-0037 (Phase 4.5): fire-and-forget log of one write-audit row.
   *
   * Fail-soft: a 5xx / network error MUST NOT block the user-visible
   * Approve/Reject feedback. We only `console.warn` on failure so the
   * Railway log still surfaces persistence problems.
   */
  async function logWriteAudit(body: WriteAuditLogBody): Promise<void> {
    const truncatedExcerpt =
      body.responseExcerpt == null
        ? body.responseExcerpt
        : body.responseExcerpt.length > RESPONSE_EXCERPT_MAX_BYTES
          ? body.responseExcerpt.slice(0, RESPONSE_EXCERPT_MAX_BYTES)
          : body.responseExcerpt;
    try {
      const r = await postJson<{ ok: boolean; id?: number }>(
        `${serverUrl}/api/internal/openclaw/write-audit/log`,
        internalApiKey,
        { ...body, responseExcerpt: truncatedExcerpt },
      );
      if (!r.ok) {
        console.warn("[openclaw] write-audit log failed", {
          status: r.status,
          tool: body.tool,
          action: body.action,
          approvalId: body.approvalId,
        });
      }
    } catch (err) {
      console.warn("[openclaw] write-audit log error", {
        error: err instanceof Error ? err.message : String(err),
        tool: body.tool,
        action: body.action,
        approvalId: body.approvalId,
      });
    }
  }

  const baseDeps: OpenClawAgentDeps = {
    serverUrl,
    internalApiKey,
    founderUserId,
  };

  const isAllowedDmContext = (ctx: Context): boolean => {
    if (!isPrivateChat(ctx.chat?.type)) return false;
    if (!isFounderAllowed(ctx.from?.id, process.env)) return false;
    return true;
  };

  bot.command("start", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return; // silent ignore у non-DM
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown" });
  });

  bot.command("help", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown" });
  });

  bot.command("reset", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    if (ctx.from?.id) sessions.reset(ctx.from.id);
    await ctx.reply("OK, нова сесія.");
  });

  bot.command("budget", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    const r = await postJson<BudgetResponse>(
      `${serverUrl}/api/internal/openclaw/budget`,
      internalApiKey,
      { founderUserId },
    );
    if (!r.ok || !r.data) {
      await ctx.reply(`Не зміг прочитати budget (HTTP ${r.status}).`);
      return;
    }
    const { spentUsd, budgetUsd, remainingUsd } = r.data;
    await ctx.reply(
      `Сьогодні: $${spentUsd.toFixed(4)} / $${budgetUsd.toFixed(2)} (залишок $${remainingUsd.toFixed(4)}).`,
    );
  });

  bot.command("decisions", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    interface DecisionsResp {
      decisions: Array<{
        id: number;
        decided_at: string;
        topic: string;
        git_pr_url: string | null;
      }>;
    }
    const r = await postJson<DecisionsResp>(
      `${serverUrl}/api/internal/openclaw/decisions/list`,
      internalApiKey,
      { founderUserId, limit: 10 },
    );
    if (!r.ok || !r.data) {
      await ctx.reply(`Не зміг прочитати decisions (HTTP ${r.status}).`);
      return;
    }
    if (r.data.decisions.length === 0) {
      await ctx.reply("Жодних decisions ще не зафіксовано.");
      return;
    }
    const lines = r.data.decisions.map((d) => {
      const date = d.decided_at.slice(0, 10);
      const pr = d.git_pr_url ? ` — ${d.git_pr_url}` : "";
      return `• ${date} #${d.id} ${d.topic}${pr}`;
    });
    await ctx.reply(lines.join("\n"));
  });

  // ADR-0037 (Phase 4.5): `/audit` — last N write-actions з опційними
  // фільтрами. Syntax: `/audit [tool] [action] [limit]`. Argument-order
  // is fixed (positional), parsed permissively — unknown values become
  // `tool` filter so a typo still surfaces something useful.
  bot.command("audit", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    if (!rateLimiter.allow(String(ctx.from?.id))) {
      await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const argument = (ctx.match ?? "").toString().trim();
    const tokens = argument ? argument.split(/\s+/) : [];

    let toolFilter: string | undefined;
    let actionFilter: "approved" | "executed" | "rejected" | undefined;
    let limit: number | undefined;

    const ACTIONS = new Set(["approved", "executed", "rejected"] as const);
    for (const tok of tokens) {
      const n = Number(tok);
      if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
        limit = Math.min(100, n);
        continue;
      }
      if (ACTIONS.has(tok as "approved" | "executed" | "rejected")) {
        actionFilter = tok as "approved" | "executed" | "rejected";
        continue;
      }
      // Unknown token → treat as tool name (last write wins on duplicate).
      toolFilter = tok;
    }

    const r = await postJson<{ audits: WriteAuditListItem[] }>(
      `${serverUrl}/api/internal/openclaw/write-audit/list`,
      internalApiKey,
      {
        founderUserId,
        limit: limit ?? 20,
        ...(toolFilter ? { tool: toolFilter } : {}),
        ...(actionFilter ? { action: actionFilter } : {}),
      },
    );
    if (!r.ok || !r.data) {
      await ctx.reply(`Не зміг прочитати write-audit (HTTP ${r.status}).`);
      return;
    }
    if (r.data.audits.length === 0) {
      await ctx.reply("Жодних write-actions у журналі.");
      return;
    }

    const ACTION_GLYPH: Record<string, string> = {
      approved: "✅",
      executed: "▶️",
      rejected: "❌",
    };
    // Format: `HH:MM glyph tool [persona] (id=…)` — newest first. We
    // intentionally show only time-of-day (date contained in the
    // grouping/timezone of the answer); LLM never reads this output, so
    // pure plaintext is fine.
    const lines = r.data.audits.map((a) => {
      const t = a.recorded_at.slice(11, 16);
      const glyph = ACTION_GLYPH[a.action] ?? "•";
      const persona = a.persona ? ` [${a.persona}]` : "";
      const status =
        a.action === "executed" && a.http_status != null
          ? ` (HTTP ${a.http_status}${a.ok ? "" : " ⚠"})`
          : "";
      return `${t} ${glyph} ${a.tool}${persona}${status} (id=${a.approval_id})`;
    });
    const header = `Останні ${r.data.audits.length} write-actions:`;
    await ctx.reply([header, ...lines].join("\n"));
  });

  /**
   * Runs one OpenClaw agent turn (used by both free-form DM messages and
   * slash-command shortcuts like `/status`, `/metrics`).
   *
   * Returns void; errors are logged and surfaced to the user. Caller
   * already handled DM-only + allowlist + rate-limit gates.
   */
  async function runAgentTurn(
    ctx: Context,
    userMessage: string,
    trigger: "dm" | "morning_ritual" | "weekly_review" | "monthly_okr",
    persona?: OpenClawPersona,
    options?: {
      /** Skip auto-reply to chat (caller will batch-reply or aggregate). */
      silent?: boolean;
      /** Override iteration cap (default — config.maxIterations). */
      maxIterationsOverride?: number;
      /** Pre-checked budget; skip the second HTTP probe. */
      skipBudgetCheck?: boolean;
      /** Tag in audit-log metadata to mark council sub-turns. */
      metadataExtras?: Record<string, unknown>;
    },
  ): Promise<{ reply: string; ok: boolean }> {
    const userId = ctx.from?.id;
    const founderTgUserId = parseFounderTgUserId(
      process.env.OPENCLAW_FOUNDER_TG_USER_ID,
    );
    if (!userId || !founderTgUserId) {
      await ctx.reply("OpenClaw not configured (missing founder TG id).");
      return { reply: "", ok: false };
    }

    // 1) Open invocation row у audit-log (status=success, потім finalize-имо).
    const openRes = await postJson<OpenInvocationResponse>(
      `${serverUrl}/api/internal/openclaw/invocations/open`,
      internalApiKey,
      {
        founderUserId,
        founderTgUserId,
        trigger,
        userMessage,
        metadata: {
          telegramChatId: ctx.chat?.id,
          persona: persona ?? "cofounder",
          ...(options?.metadataExtras ?? {}),
        },
      },
    );
    const invocationId = openRes.data?.invocationId;

    // 2) Budget pre-check (skipped — caller уже перевірив, як у council mode).
    if (!options?.skipBudgetCheck) {
      const budget = await postJson<BudgetResponse>(
        `${serverUrl}/api/internal/openclaw/budget`,
        internalApiKey,
        { founderUserId },
      );
      if (!budget.ok || !budget.data?.allowed) {
        const spent = budget.data?.spentUsd ?? 0;
        const cap = budget.data?.budgetUsd ?? 0;
        await ctx.reply(
          `OpenClaw quota exceeded for today ($${spent.toFixed(2)} / $${cap.toFixed(2)}). Спробуй завтра.`,
        );
        if (invocationId) {
          await postJson(
            `${serverUrl}/api/internal/openclaw/invocations/finalize`,
            internalApiKey,
            {
              invocationId,
              status: "budget_exceeded",
              assistantResponse: null,
              errorMessage: "daily budget exceeded",
            },
          );
        }
        return { reply: "", ok: false };
      }
    }

    // 3) Run agent loop.
    if (!options?.silent) await ctx.replyWithChatAction("typing");
    const startedAt = Date.now();

    // ADR-0036 (Phase 4): per-turn collector. The agent executor pushes
    // approval-records into this whenever the LLM emits a write-tool
    // call. After the turn finishes we drain it and post inline-keyboard
    // buttons.
    const pendingCollector = new PendingApprovalsCollector();

    try {
      const {
        reply,
        toneMode,
        persona: personaUsed,
      } = await runOpenClawAgent({
        client: anthropic,
        userMessage,
        founderHandle: ctx.from?.username
          ? `@${ctx.from.username}`
          : `id:${userId}`,
        trigger,
        maxIterations: options?.maxIterationsOverride ?? maxIterations,
        persona,
        deps: {
          ...baseDeps,
          founderTgUserId,
          invocationId,
          approvalStore,
          pendingCollector,
        },
      });
      const durationMs = Date.now() - startedAt;
      sessions.recordTurn(userId, {
        lastInvocationId: invocationId,
        lastToneMode: toneMode,
      });

      if (!options?.silent) {
        const safe = escapeTelegramMarkdownV2(reply);
        for (const chunk of splitTelegramMessage(safe)) {
          await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
        }
      }

      // ADR-0036 (Phase 4): drain queued approvals and post inline-
      // keyboard cards. We do this AFTER the narrative reply so the
      // founder sees both the LLM's reasoning and the proposed action.
      // We drain even when silent=true (council sub-turns): if a
      // specialist persona proposed a write-action, founder still needs
      // to be able to approve/reject it.
      const queued = pendingCollector.drain();
      for (const record of queued) {
        await postApprovalCard(ctx, record);
      }

      if (invocationId) {
        // Phase 1 не парсить cost з Anthropic-response (run-agent-loop не
        // повертає usage). Залишаємо 0 — Phase 2 wires precise accounting
        // через intercept-у `runAgentLoop` або custom client wrapper.
        await postJson(
          `${serverUrl}/api/internal/openclaw/invocations/finalize`,
          internalApiKey,
          {
            invocationId,
            status: "success",
            assistantResponse: reply,
            durationMs,
            toneMode,
            metadata: { persona: personaUsed },
          },
        );
      }
      return { reply, ok: true };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      console.error("OpenClaw agent error:", message);
      if (!options?.silent) {
        await ctx.reply("Помилка під час обробки. Спробуй ще раз.");
      }
      if (invocationId) {
        await postJson(
          `${serverUrl}/api/internal/openclaw/invocations/finalize`,
          internalApiKey,
          {
            invocationId,
            status: "error",
            errorMessage: message,
            durationMs,
          },
        );
      }
      return { reply: "", ok: false };
    }
  }

  /**
   * ADR-0036 (Phase 4): post an inline-keyboard card summarising a
   * pending write-tool approval. Card shows tool label + summary; two
   * buttons (Approve / Reject) carry the approval-id in callback_data.
   *
   * Telegram strips MarkdownV2 tags from button text — only the body
   * uses MarkdownV2. We escape carefully to keep the inline `path` /
   * `topic` chunks readable while staying valid.
   */
  async function postApprovalCard(
    ctx: Context,
    record: ApprovalRecord,
  ): Promise<void> {
    const label = WRITE_TOOL_LABEL[record.tool];
    const summary = summariseWriteInput(record);
    const body = [
      `*${label}*`,
      "",
      summary,
      "",
      `_id: \`${record.id}\` · expires in 10 min_`,
    ].join("\n");

    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `${APPROVAL_APPROVE}${record.id}`)
      .text("✋ Reject", `${APPROVAL_REJECT}${record.id}`);

    const safe = escapeTelegramMarkdownV2(body);
    await ctx.reply(safe, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  }

  /**
   * Resolve the approval record + decide approve/reject from the
   * callback_query.data string. Returns `null` if data is malformed,
   * unknown, or the record is missing/expired/already-resolved (we
   * answer the callback in caller with a friendly message).
   */
  function parseApprovalCallback(
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

  /**
   * Execute an approved write-tool. Resolves the route via the shared
   * registry on the agent module and posts to the corresponding
   * `/api/internal/openclaw/write/*` endpoint. Returns the raw response
   * body (string) which the caller surfaces to the founder so that PR
   * URLs / error messages are visible.
   */
  async function executeApprovedWriteTool(
    record: ApprovalRecord,
  ): Promise<{ ok: boolean; status: number; bodyText: string }> {
    const route = writeToolRoute(record.tool);
    if (!route) {
      return {
        ok: false,
        status: 0,
        bodyText: `Unknown write-tool route for ${record.tool}.`,
      };
    }
    try {
      const res = await fetch(`${serverUrl}${route}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${internalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(record.input),
      });
      const bodyText = await res.text();
      return { ok: res.ok, status: res.status, bodyText };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, bodyText: `Network error: ${message}` };
    }
  }

  async function dispatchOpenClawAgentTask(
    ctx: Context,
    commandText: string,
  ): Promise<void> {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const messageId =
      ctx.message?.message_id ?? ctx.callbackQuery?.message?.message_id;
    if (!userId || !chatId || !messageId) {
      await ctx.reply("Dispatcher context is missing; cannot route this task.");
      return;
    }

    const previewPayload = buildDispatcherPayload({
      source: "openclaw",
      commandText,
      telegramUserId: userId,
      telegramChatId: chatId,
      messageId,
      statusCallbackWebhookUrl: process.env.OPENCLAW_AGENT_STATUS_CALLBACK_URL,
    });

    if (
      previewPayload.requiresApproval &&
      previewPayload.action !== "approve"
    ) {
      const approvalPayload = buildDispatcherPayload({
        source: "openclaw",
        taskId: previewPayload.taskId,
        approvalId: `dispatch-${previewPayload.taskId}`,
        commandText,
        telegramUserId: userId,
        telegramChatId: chatId,
        messageId,
        statusCallbackWebhookUrl:
          process.env.OPENCLAW_AGENT_STATUS_CALLBACK_URL,
      });
      await ctx.reply(formatApprovalPrompt(approvalPayload));
      return;
    }

    const response = await dispatchToN8n(previewPayload);
    await ctx.reply(response);
  }

  // ADR-0032: Sergeant Console (ADR-0027) slash-команди (/ops, /content, …)
  // зливаються в OpenClaw як preset-prompts через той самий agent-turn loop.
  // Тригер ідентифікує запит у audit-log-у (`openclaw_invocations.trigger`).
  const DISPATCHER_COMMANDS = [
    "status",
    "plan",
    "assign",
    "review",
    "run",
    "approve",
    "cancel",
    "logs",
  ];

  for (const cmd of DISPATCHER_COMMANDS) {
    bot.command(cmd, async (ctx) => {
      if (!isAllowedDmContext(ctx)) return;
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      const argument = (ctx.match ?? "").toString().trim();
      const commandText = argument ? `${cmd} ${argument}` : cmd;
      await dispatchOpenClawAgentTask(ctx, commandText);
    });
  }

  for (const [cmd, preset] of Object.entries(COMMAND_PROMPTS)) {
    bot.command(cmd, async (ctx) => {
      if (!isAllowedDmContext(ctx)) return;
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      await runAgentTurn(ctx, preset, "dm");
    });
  }

  // ADR-0033 (Phase 2.5): persona-scoped slash-команди. Очікуємо
  // argument: `/ops <q>`. Порожня команда → короткий hint.
  const PERSONA_COMMANDS: ReadonlyArray<{
    cmd: string;
    persona: OpenClawPersona;
  }> = [
    { cmd: "ops", persona: "ops" },
    { cmd: "growth", persona: "growth" },
    { cmd: "eng", persona: "eng" },
    { cmd: "finance", persona: "finance" },
    { cmd: "cofounder", persona: "cofounder" },
  ];

  for (const { cmd, persona } of PERSONA_COMMANDS) {
    bot.command(cmd, async (ctx) => {
      if (!isAllowedDmContext(ctx)) return;
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      const argument = (ctx.match ?? "").toString().trim();
      if (!argument) {
        await ctx.reply(
          `Напиши питання після /${cmd}, напр. \`/${cmd} як виглядає ${PERSONA_LABEL[persona].toLowerCase()} ситуація зараз?\``,
        );
        return;
      }
      await runAgentTurn(ctx, argument, "dm", persona);
    });
  }

  /**
   * `/council <q>` — round-table mode (ADR-0033).
   *
   * Sequential execution чотирьох specialist-персон потім cofounder
   * synthesis. Sequential а не parallel — для cost predictability і бо Anthropic
   * client один (rate-limit shared). Iteration cap у кожної specialist-turn-и
   * обрізаний до ≤3 (разом ≤5 turn-ів, орієнтовно ~$0.50 в sonnet-cost-і).
   */
  bot.command("council", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!rateLimiter.allow(String(userId))) {
      await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }
    const question = (ctx.match ?? "").toString().trim();
    if (!question) {
      await ctx.reply(
        "Напиши питання після /council, напр. `/council чи вводимо B2B в Q3?`",
      );
      return;
    }

    // Pre-check budget headroom — рахуємо реальний daily-spend і виходимо
    // fail-fast якщо залишок менше council-cap-у. Phase 1 не парсить usage,
    // тому реально це опирається на daily $5 бар'єр (з manual decrement-ом).
    const headroom = await postJson<BudgetResponse>(
      `${serverUrl}/api/internal/openclaw/budget`,
      internalApiKey,
      { founderUserId },
    );
    if (!headroom.ok || !headroom.data?.allowed) {
      const spent = headroom.data?.spentUsd ?? 0;
      const cap = headroom.data?.budgetUsd ?? 0;
      await ctx.reply(
        `Не вистачає бюджету: $${spent.toFixed(2)} / $${cap.toFixed(2)}. /council потребує мінімум $${councilUsdBudget.toFixed(2)} залишку.`,
      );
      return;
    }
    if (headroom.data.remainingUsd < councilUsdBudget) {
      await ctx.reply(
        `Council вимагає ≥3 $${councilUsdBudget.toFixed(2)} budget headroom; зараз залишок $${headroom.data.remainingUsd.toFixed(4)}. Спробуй окрему /ops або завтра.`,
      );
      return;
    }

    await ctx.reply(
      `Рада розпочата. Присутні: ops → growth → eng → finance → cofounder synthesis.`,
    );

    // 4 specialist turns — sequential, with shorter iteration cap.
    const PER_TURN_ITER_CAP = Math.min(3, maxIterations);
    const specialistReplies: Array<{
      persona: OpenClawPersona;
      reply: string;
    }> = [];

    for (const persona of COUNCIL_PERSONAS) {
      await ctx.reply(`*${PERSONA_LABEL[persona]}* думає…`, {
        parse_mode: "Markdown",
      });
      const turn = await runAgentTurn(ctx, question, "dm", persona, {
        maxIterationsOverride: PER_TURN_ITER_CAP,
        metadataExtras: { council: true, councilStep: persona },
      });
      if (!turn.ok) {
        await ctx.reply(
          `Council aborted on persona=${persona}. Дивись logs / спробуй окрему /${persona}.`,
        );
        return;
      }
      specialistReplies.push({ persona, reply: turn.reply });
      const safeReply = escapeTelegramMarkdownV2(
        `*${PERSONA_LABEL[persona]}*\n${turn.reply}`,
      );
      for (const chunk of splitTelegramMessage(safeReply)) {
        await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
      }
    }

    // Final cofounder synthesis — бачить питання + 4 specialist-відповіді,
    // об'єднує їх у синтез. Cofounder primer + full-toolset (якщо захоче
    // дореалвати дані — може).
    const synthesisPrompt = [
      `Оригінальне питання: ${question}`,
      "",
      "Думки ради з різних кутів:",
      ...specialistReplies.map(
        ({ persona, reply }) => `\n--- ${PERSONA_LABEL[persona]} ---\n${reply}`,
      ),
      "",
      "Твоє завдання як cofounder-фасилітатора:",
      "1) Брифли збиги і розбіжності між specialist-думками.",
      "2) Сформулюй рекомендацію з 1–3 наступних кроків.",
      "3) Якщо вирішення вимагає повної фіксації — запропонуй record_decision.",
      "Будь стислий, леди з висновку.",
    ].join("\n");

    await ctx.reply("*Cofounder synthesis…*", { parse_mode: "Markdown" });
    await runAgentTurn(ctx, synthesisPrompt, "dm", "cofounder", {
      maxIterationsOverride: Math.min(4, maxIterations),
      metadataExtras: { council: true, councilStep: "synthesis" },
    });
  });

  bot.on("message:text", async (ctx) => {
    // 1) DM-only.
    if (!isPrivateChat(ctx.chat?.type)) return; // silent ignore

    // 2) Allowlist.
    const userId = ctx.from?.id;
    if (!isFounderAllowed(userId, process.env)) {
      // Reply only if message addressed bot напряму — щоб не leak-нути
      // bot info рандомним юзерам, які знайшли handle. У DM-у завжди
      // адресовано.
      await ctx.reply("Access denied.");
      return;
    }

    // 3) Rate limit per-minute (anti-spam, окреме від budget).
    if (!rateLimiter.allow(String(userId))) {
      await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const userMessage = ctx.message.text.trim();
    if (!userMessage) return;
    // /commands handled outside; ось ми лише message-text-handler.
    if (userMessage.startsWith("/")) return;

    if (shouldDelegateOpenClawToAgentNetwork(userMessage)) {
      await dispatchOpenClawAgentTask(ctx, userMessage);
      return;
    }

    await runAgentTurn(ctx, userMessage, "dm");
  });

  // ADR-0036 (Phase 4): inline-keyboard callback handler — approves
  // or rejects a pending write-tool. Fail-closed: only the founder
  // may resolve approvals; expired / unknown ids return a friendly
  // "expired" answer-callback rather than executing.
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const parsed = parseApprovalCallback(data);
    if (!parsed) {
      // Not ours — answer empty so the spinner stops, but otherwise
      // ignore (other features may add their own callbacks later).
      await ctx.answerCallbackQuery();
      return;
    }

    if (!isFounderAllowed(ctx.from?.id, process.env)) {
      await ctx.answerCallbackQuery({
        text: "Access denied.",
        show_alert: true,
      });
      return;
    }

    const record = approvalStore.get(parsed.id);
    if (!record) {
      await ctx.answerCallbackQuery({
        text: "Approval expired or unknown. Спробуй ще раз.",
        show_alert: true,
      });
      try {
        await ctx.editMessageReplyMarkup({});
      } catch {
        // Old card may already be edited / removed; not fatal.
      }
      return;
    }

    if (parsed.kind === "reject") {
      approvalStore.markRejected(parsed.id);
      await ctx.answerCallbackQuery({ text: "Rejected." });
      try {
        await ctx.editMessageReplyMarkup({});
      } catch {
        // Card may have been edited concurrently — best-effort UI cleanup.
      }
      const note = `❌ Rejected: ${WRITE_TOOL_LABEL[record.tool]} (id ${record.id}).`;
      await ctx.reply(note);
      console.log("[openclaw] write-tool rejected", {
        tool: record.tool,
        id: record.id,
        founderTgUserId: ctx.from?.id,
        invocationId: record.invocationId,
      });
      // ADR-0037 (Phase 4.5): persist the rejection so post-mortems
      // survive a console restart. Fire-and-forget, fail-soft.
      void logWriteAudit({
        approvalId: record.id,
        tool: record.tool,
        founderUserId: record.founderUserId,
        founderTgUserId: record.founderTgUserId,
        invocationId: record.invocationId ?? null,
        action: "rejected",
        input: record.input,
        persona: record.persona ?? null,
      });
      return;
    }

    // Approve path — mark first so a double-click can't double-execute,
    // then call the write endpoint.
    approvalStore.markExecuted(parsed.id);
    await ctx.answerCallbackQuery({ text: "Executing…" });
    try {
      await ctx.editMessageReplyMarkup({});
    } catch {
      // Best-effort; we still post the result below.
    }

    // ADR-0037 (Phase 4.5): write `approved` row BEFORE the HTTP call.
    // Pairing this with the later `executed` row by `approval_id` lets
    // us measure approve-to-executed latency AND detect "approved but
    // never executed" failures (executor crashed mid-flight).
    void logWriteAudit({
      approvalId: record.id,
      tool: record.tool,
      founderUserId: record.founderUserId,
      founderTgUserId: record.founderTgUserId,
      invocationId: record.invocationId ?? null,
      action: "approved",
      input: record.input,
      persona: record.persona ?? null,
    });

    const result = await executeApprovedWriteTool(record);
    const headline = result.ok
      ? `✅ Executed: ${WRITE_TOOL_LABEL[record.tool]}`
      : `⚠️ Failed: ${WRITE_TOOL_LABEL[record.tool]} (HTTP ${result.status})`;
    const safe = escapeTelegramMarkdownV2(
      [headline, "", "```", result.bodyText.slice(0, 3500), "```"].join("\n"),
    );
    for (const chunk of splitTelegramMessage(safe)) {
      await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
    }
    console.log("[openclaw] write-tool executed", {
      tool: record.tool,
      id: record.id,
      ok: result.ok,
      status: result.status,
      founderTgUserId: ctx.from?.id,
      invocationId: record.invocationId,
    });
    // ADR-0037 (Phase 4.5): pair-row to the `approved` above. Carries
    // upstream HTTP status + truncated response excerpt so post-mortems
    // see exactly what the API returned.
    void logWriteAudit({
      approvalId: record.id,
      tool: record.tool,
      founderUserId: record.founderUserId,
      founderTgUserId: record.founderTgUserId,
      invocationId: record.invocationId ?? null,
      action: "executed",
      input: record.input,
      httpStatus: result.status,
      ok: result.ok,
      responseExcerpt: result.bodyText,
      persona: record.persona ?? null,
    });
  });

  bot.catch((err) => {
    console.error("OpenClaw bot error:", err.error, {
      updateId: err.ctx?.update?.update_id,
    });
  });

  return { sessions, rateLimiter };
}
