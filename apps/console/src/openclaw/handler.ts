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

const HELP_TEXT = [
  "*OpenClaw* — твій co-founder bot.",
  "",
  "Я аналізую дані Sergeant (PG, GitHub, n8n logs, strategy docs)",
  "і даю advisory-думку. Я не пишу в продакшн.",
  "",
  "/decisions — останні зафіксовані рішення",
  "/budget — поточний денний spend",
  "/reset — почати нову сесію",
  "/help — ця довідка",
  "",
  "_Phase 1, ADR-0031._",
].join("\n");

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

    const founderTgUserId = parseFounderTgUserId(
      process.env.OPENCLAW_FOUNDER_TG_USER_ID,
    );
    if (!userId || !founderTgUserId) {
      await ctx.reply("OpenClaw not configured (missing founder TG id).");
      return;
    }

    // 4) Open invocation row у audit-log (status=success, потім finalize-имо).
    const openRes = await postJson<OpenInvocationResponse>(
      `${serverUrl}/api/internal/openclaw/invocations/open`,
      internalApiKey,
      {
        founderUserId,
        founderTgUserId,
        trigger: "dm",
        userMessage,
        metadata: { telegramChatId: ctx.chat?.id },
      },
    );
    const invocationId = openRes.data?.invocationId;

    // 5) Budget pre-check.
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
      return;
    }

    // 6) Run agent loop.
    await ctx.replyWithChatAction("typing");
    const startedAt = Date.now();
    try {
      const { reply, toneMode } = await runOpenClawAgent({
        client: anthropic,
        userMessage,
        founderHandle: ctx.from?.username
          ? `@${ctx.from.username}`
          : `id:${userId}`,
        trigger: "dm",
        maxIterations,
        deps: { ...deps, invocationId },
      });
      const durationMs = Date.now() - startedAt;
      sessions.recordTurn(userId, {
        lastInvocationId: invocationId,
        lastToneMode: toneMode,
      });

      const safe = escapeTelegramMarkdownV2(reply);
      for (const chunk of splitTelegramMessage(safe)) {
        await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
      }

      if (invocationId) {
        // Phase 1 не парсить cost з Anthropic-response (run-agent-loop не
        // поверrtaє usage). Залишаємо 0 — Phase 2 wires precise accounting
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
          },
        );
      }
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      console.error("OpenClaw agent error:", message);
      await ctx.reply("❌ Помилка під час обробки. Спробуй ще раз.");
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
    }
  });

  bot.catch((err) => {
    console.error("OpenClaw bot error:", err.error, {
      updateId: err.ctx?.update?.update_id,
    });
  });

  return { sessions, rateLimiter };
}
