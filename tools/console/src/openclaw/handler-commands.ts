/**
 * Bot command + update registrations split out of `handler.ts` (PR-36).
 *
 * `registerOpenClawCommands(deps)` mounts every `/command` handler plus
 * the `message:text` / `callback_query:data` / `bot.catch` listeners on
 * the grammy `Bot`. Stateful values (rate limiter, sessions, approval
 * store, agent-turn runner, audit logger) are passed in — this module
 * has no module-level mutable state of its own.
 *
 * The `isAllowedDmContext` gate sits at the top of every handler:
 * non-DM updates are silently ignored, non-founder users get
 * "Access denied." (or silent ignore in the message handler if the bot
 * was added to a non-DM chat by mistake).
 */

import type { Bot, Context } from "grammy";
import { InputFile } from "grammy";
import {
  buildDispatcherPayload,
  dispatchToN8n,
  formatApprovalPrompt,
  shouldDelegateOpenClawToAgentNetwork,
} from "../agents/dispatcher.js";
import { COUNCIL_PERSONAS, type OpenClawPersona } from "../agents/personas.js";
import {
  STRATEGIC_MODE_TRIGGERS,
  type StrategicMode,
} from "../agents/strategic-modes.js";
import {
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  splitTelegramMessage,
} from "../security.js";
import {
  formatPendingReply,
  parseAlertsCommand,
  type PendingAlertItem,
} from "./alerts-format.js";
import { ApprovalStore, type ApprovalRecord } from "./approval-store.js";
import { buildAuditCsvFilename, renderWriteAuditCsv } from "./audit-csv.js";
import { parseDuration } from "./duration.js";
import {
  isFounderAllowed,
  isPrivateChat,
  parseFounderTgUserId,
} from "./security.js";
import type { OpenClawSessionStore } from "./session.js";
import type { AgentTurnRunner } from "./handler-agent-turn.js";
import {
  COMMAND_PROMPTS,
  DISPATCHER_COMMANDS,
  HELP_TEXT,
  PERSONA_COMMANDS,
  PERSONA_LABEL,
  WRITE_TOOL_LABEL,
  parseApprovalCallback,
  postJson,
  type BudgetResponse,
  type OpenInvocationResponse,
  type WriteAuditListItem,
  type WriteAuditLogBody,
} from "./handler-constants.js";

/**
 * Diagnostic warn-log on silent rejection. Без цього оператор бачить лише
 * "/help мовчить" і має гадати між (a) webhook-race, (b) DM-only check,
 * (c) `OPENCLAW_FOUNDER_TG_USER_ID` mismatch, (d) bot crashed mid-handler.
 *
 * Rate-limit per (user, chat_type, reason) tuple щоб флуд від групи з
 * багатьма юзерами / botом, який зациклився на одному /команді, не
 * поховав журнал.
 */
function createRejectionLogger(): (reason: string, ctx: Context) => void {
  const recentRejectionLogs = new Map<string, number>();
  const REJECTION_LOG_TTL_MS = 60_000;
  return (reason, ctx) => {
    const userId = ctx.from?.id ?? 0;
    const chatType = ctx.chat?.type ?? "unknown";
    const message = ctx.message;
    const text =
      message && "text" in message && typeof message.text === "string"
        ? message.text
        : "";
    const firstToken = text.split(/\s+/)[0] ?? "";
    const key = `${userId}|${chatType}|${reason}`;
    const now = Date.now();
    const last = recentRejectionLogs.get(key);
    if (last !== undefined && now - last < REJECTION_LOG_TTL_MS) return;
    recentRejectionLogs.set(key, now);
    console.warn(
      `[openclaw] silently rejected update: reason=${reason} ` +
        `chat_type=${chatType} from_user_id=${userId} ` +
        `command=${firstToken || "<non-command>"} ` +
        `(check OPENCLAW_FOUNDER_TG_USER_ID + ensure DM)`,
    );
  };
}

export interface RegisterCommandsDeps {
  bot: Bot;
  serverUrl: string;
  internalApiKey: string;
  founderUserId: string;
  maxIterations: number;
  rateLimiter: FixedWindowRateLimiter;
  sessions: OpenClawSessionStore;
  approvalStore: ApprovalStore;
  councilUsdBudget: number;
  runAgentTurn: AgentTurnRunner;
  executeApprovedWriteTool: (
    record: ApprovalRecord,
  ) => Promise<{ ok: boolean; status: number; bodyText: string }>;
  logWriteAudit: (body: WriteAuditLogBody) => Promise<void>;
}

/**
 * Mount every OpenClaw bot listener (commands + message + callback
 * + catch). Caller still owns `bot.start()`; this only attaches.
 */
export function registerOpenClawCommands(deps: RegisterCommandsDeps): void {
  const {
    bot,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
    rateLimiter,
    sessions,
    approvalStore,
    councilUsdBudget,
    runAgentTurn,
    executeApprovedWriteTool,
    logWriteAudit,
  } = deps;

  const logRejection = createRejectionLogger();

  const isAllowedDmContext = (ctx: Context): boolean => {
    if (!isPrivateChat(ctx.chat?.type)) {
      logRejection("non-private-chat", ctx);
      return false;
    }
    if (!isFounderAllowed(ctx.from?.id, process.env)) {
      logRejection("non-founder", ctx);
      return false;
    }
    return true;
  };

  bot.command("start", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return; // silent ignore у non-DM
    await ctx.reply(HELP_TEXT, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    await ctx.reply(HELP_TEXT, { parse_mode: "HTML" });
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
  // фільтрами. Syntax:
  //   /audit [tool] [action] [limit] [since=<dur>] [csv]
  // Argument-order is permissive — `since=` and `csv` tokens are matched
  // first, the remaining positional tokens fall back to the historical
  // tool/action/limit parsing (unknown → tool filter so typos still
  // surface something useful).
  //
  // Defaults:
  //   - no `since=`, no `csv`  → 20 rows (legacy behaviour)
  //   - `since=<dur>`           → 100 rows (full ADR-0037 cap)
  //   - `csv` only              → 20 rows, sent as document
  //   - explicit numeric token  → caller-provided limit (capped at 100)
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
    let recordedAfterIso: string | undefined;
    let sinceLabel: string | undefined;
    let asCsv = false;

    const ACTIONS = new Set(["approved", "executed", "rejected"] as const);
    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      if (lower === "csv") {
        asCsv = true;
        continue;
      }
      if (lower.startsWith("since=")) {
        const raw = tok.slice("since=".length);
        const durMs = parseDuration(raw);
        if (durMs == null) {
          await ctx.reply(
            "Невалідний `since=` параметр. Приклади: `since=30m`, " +
              "`since=24h`, `since=7d`. Max 30d.",
          );
          return;
        }
        recordedAfterIso = new Date(Date.now() - durMs).toISOString();
        sinceLabel = raw;
        continue;
      }
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

    const effectiveLimit = limit ?? (recordedAfterIso ? 100 : 20);

    const r = await postJson<{ audits: WriteAuditListItem[] }>(
      `${serverUrl}/api/internal/openclaw/write-audit/list`,
      internalApiKey,
      {
        founderUserId,
        limit: effectiveLimit,
        ...(toolFilter ? { tool: toolFilter } : {}),
        ...(actionFilter ? { action: actionFilter } : {}),
        ...(recordedAfterIso ? { recordedAfterIso } : {}),
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

    if (asCsv) {
      // CSV-export branch: `replyWithDocument` with an in-memory Buffer.
      // Keep the column-set tight (per roadmap §3.3) so the file is safe
      // to forward — no full input/response payloads.
      const csv = renderWriteAuditCsv(
        r.data.audits.map((a) => ({
          recorded_at: a.recorded_at,
          tool: a.tool,
          action: a.action,
          persona: a.persona,
          http_status: a.http_status,
          approval_id: a.approval_id,
        })),
      );
      const filename = buildAuditCsvFilename();
      const captionParts: string[] = [`${r.data.audits.length} write-actions`];
      if (sinceLabel) captionParts.push(`за ${sinceLabel}`);
      if (toolFilter) captionParts.push(`tool=${toolFilter}`);
      if (actionFilter) captionParts.push(`action=${actionFilter}`);
      await ctx.replyWithDocument(
        new InputFile(Buffer.from(csv, "utf8"), filename),
        { caption: captionParts.join(", ") },
      );
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
    const headerWindow = sinceLabel ? ` (since=${sinceLabel})` : "";
    const header = `Останні ${r.data.audits.length} write-actions${headerWindow}:`;
    await ctx.reply([header, ...lines].join("\n"));
  });

  // ADR-0038 (Wave 3 §3.2 PR-3): `/alerts pending` — unacked broadcast
  // queue from `Sergeant_alert_bot`. Reads from `tg_alert_acks` via
  // `/api/internal/alerts/pending`. No `notYetEscalated` filter — the
  // founder wants to see *everything* still un-acked, including rows
  // that WF-103 already DM-pinged about (we mark those with `⚠️esc`).
  // O5: audit row in `openclaw_invocations` for every call.
  // Syntax:
  //   /alerts pending [p0|p1|p2|p3] [topic] [N] [since=<dur>]
  bot.command("alerts", async (ctx) => {
    if (!isAllowedDmContext(ctx)) return;
    if (!rateLimiter.allow(String(ctx.from?.id))) {
      await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const argument = (ctx.match ?? "").toString();
    const parsed = parseAlertsCommand(argument);

    if (parsed.subcommand === "help") {
      await ctx.reply(
        [
          "<b>Usage:</b> <code>/alerts pending [filters]</code>",
          "",
          "Filters:",
          "  • <code>p0</code>/<code>p1</code>/<code>p2</code>/<code>p3</code> — severity",
          "  • <code>since=15m|24h|7d</code> — лише старші за вказаний інтервал",
          "  • число (1..50) — limit (default 20)",
          "  • будь-який інший токен — topic-key",
        ].join("\n"),
        { parse_mode: "HTML" },
      );
      return;
    }
    if (parsed.subcommand === "unknown") {
      await ctx.reply(parsed.error ?? "Невідома підкоманда.");
      return;
    }
    if (parsed.error) {
      await ctx.reply(parsed.error);
      return;
    }

    // O5: open audit row before the data-fetch.
    const founderTgUserId = parseFounderTgUserId(
      process.env["OPENCLAW_FOUNDER_TG_USER_ID"],
    );
    const openRes = await postJson<OpenInvocationResponse>(
      `${serverUrl}/api/internal/openclaw/invocations/open`,
      internalApiKey,
      {
        founderUserId,
        founderTgUserId: founderTgUserId ?? ctx.from?.id ?? 0,
        trigger: "dm",
        userMessage: `/alerts ${argument}`.trim(),
        metadata: {
          telegramChatId: ctx.chat?.id,
          persona: "cofounder",
          subcommand: parsed.subcommand,
        },
      },
    );
    const invocationId = openRes.data?.invocationId;

    const r = await postJson<{ alerts: PendingAlertItem[] }>(
      `${serverUrl}/api/internal/alerts/pending`,
      internalApiKey,
      {
        ...(parsed.filters.topic ? { topic: parsed.filters.topic } : {}),
        ...(parsed.filters.severity
          ? { severity: parsed.filters.severity }
          : {}),
        ...(parsed.filters.olderThanMinutes
          ? { olderThanMinutes: parsed.filters.olderThanMinutes }
          : {}),
        ...(parsed.filters.limit ? { limit: parsed.filters.limit } : {}),
      },
    );
    if (!r.ok || !r.data) {
      if (invocationId) {
        await postJson(
          `${serverUrl}/api/internal/openclaw/invocations/finalize`,
          internalApiKey,
          {
            invocationId,
            status: "error",
            assistantResponse: null,
            errorMessage: `alerts HTTP ${r.status}`,
            inputTokens: 0,
            outputTokens: 0,
          },
        );
      }
      await ctx.reply(`Не зміг прочитати alerts (HTTP ${r.status}).`);
      return;
    }

    const reply = formatPendingReply(r.data.alerts, {
      now: new Date(),
      sinceLabel: parsed.sinceLabel,
      filters: parsed.filters,
    });

    // O5: finalize audit row with success.
    if (invocationId) {
      await postJson(
        `${serverUrl}/api/internal/openclaw/invocations/finalize`,
        internalApiKey,
        {
          invocationId,
          status: "success",
          assistantResponse: reply,
          errorMessage: null,
          inputTokens: 0,
          outputTokens: 0,
        },
      );
    }

    await ctx.reply(reply);
  });

  /**
   * Dispatch a free-text or slash-command request to WF-20 (the agent
   * network). Used by both the `DISPATCHER_COMMANDS` loop and the
   * `message:text` handler when `shouldDelegateOpenClawToAgentNetwork`
   * returns true. Two-phase: preview payload → optional approval prompt
   * → final dispatch.
   */
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
      statusCallbackWebhookUrl:
        process.env["OPENCLAW_AGENT_STATUS_CALLBACK_URL"],
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
          process.env["OPENCLAW_AGENT_STATUS_CALLBACK_URL"],
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

  // ADR-0031, Phase 3 skeleton (PR-34): strategic-mode slash-команди.
  // `/plan <topic>`, `/analyze <anomaly>`, `/okr` запускають agent-turn
  // зі structured-thinking primer-ом (`tools/console/src/agents/strategic-modes.ts`).
  // Cofounder persona (default toolset, synthesis-tone) — модель сама
  // драйвить 4-step workflow через prompt; persistence + write-tool
  // follow-up — Phase 4 territory (ADR-0036).
  const STRATEGIC_MODE_COMMANDS: ReadonlyArray<{
    cmd: "plan" | "analyze" | "okr";
    mode: StrategicMode;
    placeholder: string;
    requiresArgument: boolean;
  }> = [
    {
      cmd: "plan",
      mode: "plan",
      placeholder: "/plan churn-reduction-q3",
      requiresArgument: true,
    },
    {
      cmd: "analyze",
      mode: "analyze",
      placeholder: "/analyze падіння signups вчора",
      requiresArgument: true,
    },
    {
      cmd: "okr",
      mode: "okr",
      placeholder: "/okr — огляд активних OKR",
      requiresArgument: false,
    },
  ];
  for (const {
    cmd,
    mode,
    placeholder,
    requiresArgument,
  } of STRATEGIC_MODE_COMMANDS) {
    bot.command(cmd, async (ctx) => {
      if (!isAllowedDmContext(ctx)) return;
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await ctx.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      const argument = (ctx.match ?? "").toString().trim();
      if (requiresArgument && !argument) {
        await ctx.reply(`Напиши тему після /${cmd}, напр. \`${placeholder}\`.`);
        return;
      }
      const userMessage = argument
        ? argument
        : `Запусти ${mode}-mode без додаткового контексту — використай дані, що тобі доступні.`;
      const trigger = STRATEGIC_MODE_TRIGGERS[mode] as
        | "strategic_plan"
        | "strategic_analyze"
        | "strategic_okr";
      await runAgentTurn(ctx, userMessage, trigger, "cofounder", {
        strategicMode: mode,
        metadataExtras: { strategicMode: mode },
      });
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
      // M16: explicit MarkdownV2 — escape PERSONA_LABEL just in case a
      // future label introduces a special char (`-`, `.`, `!`, …).
      await ctx.reply(
        `*${escapeTelegramMarkdownV2(PERSONA_LABEL[persona])}* ${escapeTelegramMarkdownV2("думає…")}`,
        { parse_mode: "MarkdownV2" },
      );
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

    // M16: literal contains no MarkdownV2 special chars; just flip the parse_mode.
    await ctx.reply("*Cofounder synthesis…*", { parse_mode: "MarkdownV2" });
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
}
