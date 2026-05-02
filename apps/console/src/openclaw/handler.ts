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
import {
  runOpenClawAgent,
  type OpenClawAgentDeps,
} from "../agents/openclaw.js";
import { COUNCIL_PERSONAS, type OpenClawPersona } from "../agents/personas.js";
import {
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  splitTelegramMessage,
} from "../security.js";
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

const HELP_TEXT = [
  "*OpenClaw* — твій co-founder bot.",
  "",
  "Я аналізую дані Sergeant (PG, Stripe, Sentry, PostHog, GitHub, n8n logs, strategy docs)",
  "і даю advisory-думку. Я не пишу в продакшн.",
  "",
  "*Швидкі команди (preset-prompts):*",
  "/status — короткий ops-зріз (Stripe + Sentry + healthz)",
  "/metrics — детальні метрики за тиждень",
  "/digest — growth-дайджест (PostHog + GitHub releases + n8n)",
  "/logs — останні n8n executions з помилками",
  "/review — recent PRs / merges за тиждень",
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
  "/budget — поточний денний spend",
  "/reset — почати нову сесію",
  "/help — ця довідка",
  "",
  "_Phase 1, ADR-0031 + ADR-0032 + ADR-0033._",
].join("\n");

// ADR-0032: команди типу /status — це prefilled-message, який запускає той
// самий agent-loop, що і вільний DM-текст. Так LLM зможе при потребі смикати
// додаткові tools (recall, decisions) для контексту, а tone-modes/audit/budget
// guardrails застосовуються однаково.
const COMMAND_PROMPTS: Record<string, string> = {
  status: [
    "Дай короткий operational status зараз: Stripe charges за останні 7 днів,",
    "Sentry unresolved issues (level=error), і /healthz сервера.",
    "Формат — bullet-list, без зайвих коментарів.",
  ].join(" "),
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
  logs: [
    "Покажи останні n8n executions, фокус на failed/error.",
    "Якщо є патерн — назви який workflow повторюється.",
  ].join(" "),
  review: [
    "Recent GitHub releases (5) + recent PRs (issue_type=pr, is:closed) за тиждень.",
    "Виділи: що merged, що warrants review, ризики deploy-у.",
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

  const deps: OpenClawAgentDeps = {
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
        deps: { ...deps, invocationId },
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

  // ADR-0032: Sergeant Console (ADR-0027) slash-команди (/ops, /content, …)
  // зливаються в OpenClaw як preset-prompts через той самий agent-turn loop.
  // Тригер ідентифікує запит у audit-log-у (`openclaw_invocations.trigger`).
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

    await runAgentTurn(ctx, userMessage, "dm");
  });

  bot.catch((err) => {
    console.error("OpenClaw bot error:", err.error, {
      updateId: err.ctx?.update?.update_id,
    });
  });

  return { sessions, rateLimiter };
}
