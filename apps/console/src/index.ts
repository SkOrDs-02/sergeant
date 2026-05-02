import "dotenv/config";
import { Bot } from "grammy";
import Anthropic from "@anthropic-ai/sdk";
import { parseCommand, dispatchToAgent } from "./agents/router.js";
import {
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  isUserAllowed,
  parseRateLimitPerMinute,
  splitTelegramMessage,
} from "./security.js";
import { attachOpenClawHandlers } from "./openclaw/index.js";

const DEFAULT_OPENCLAW_MAX_ITERATIONS = 8;

function parseOpenClawMaxIterations(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OPENCLAW_MAX_ITERATIONS;
  }
  return Math.floor(parsed);
}

const HELP_TEXT = [
  "*Sergeant Console* - Telegram control surface for ops, marketing, and AI agents",
  "",
  "*/ops* <question> - ask the Ops agent",
  "*/content* <topic> - ask the Marketing agent",
  "",
  "*/status* <scope> - read-only agent/system status",
  "*/plan* <task> - ask n8n to prepare a specialist-agent plan",
  "*/assign* <specialist> <task> - request agent work; risky work needs approval",
  "*/review* <target> - review PR, issue, CI, or workflow state",
  "*/run* <check> - request a controlled check or automation",
  "*/approve* <task-id|command> - approve a risky dispatcher action",
  "*/cancel* <task-id> - cancel a queued dispatcher task",
  "*/logs* <target> - fetch read-only logs or summaries",
  "",
  "Free text still routes to ops or marketing by context.",
  "",
  "_Version: Telegram control plane + n8n dispatcher_",
].join("\n");

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // ADR-0032: Sergeant Console (ADR-0027) consolidated into OpenClaw. The
  // legacy console bot is kept dormant in this process so we can revive it
  // once team scales beyond a solo founder; until then, missing
  // CONSOLE_BOT_TOKEN is the *expected* state, not a fatal error. Match the
  // OpenClaw fail-closed pattern: warn + skip, keep the process alive for
  // whichever bot is actually configured.
  const botToken = process.env.CONSOLE_BOT_TOKEN;
  let consolePromise: Promise<void> | undefined;
  if (!botToken) {
    console.warn(
      "Sergeant Console not started: CONSOLE_BOT_TOKEN is not set (ADR-0032: dormant; OpenClaw is the active surface).",
    );
  } else {
    const bot = new Bot(botToken);
    const limiter = new FixedWindowRateLimiter(
      parseRateLimitPerMinute(process.env.CONSOLE_RATE_LIMIT_PER_MIN),
    );
    const checkAuth = (userId: number | undefined) =>
      isUserAllowed(userId, process.env);

    bot.command("start", async (ctx) => {
      if (!checkAuth(ctx.from?.id)) {
        await ctx.reply("Access denied.");
        return;
      }
      await ctx.reply(HELP_TEXT, { parse_mode: "Markdown" });
    });

    bot.command("help", async (ctx) => {
      if (!checkAuth(ctx.from?.id)) return;
      await ctx.reply(HELP_TEXT, { parse_mode: "Markdown" });
    });

    bot.on("message:text", async (ctx) => {
      if (!checkAuth(ctx.from?.id)) {
        await ctx.reply("Access denied.");
        return;
      }
      const rateLimitKey = String(ctx.from?.id ?? ctx.chat.id);
      if (!limiter.allow(rateLimitKey)) {
        await ctx.reply("Rate limit exceeded. Try again in a minute.");
        return;
      }

      const text = ctx.message.text;
      const { agent, query } = parseCommand(text);

      await ctx.replyWithChatAction("typing");

      try {
        const reply = await dispatchToAgent(anthropic, agent, query, {
          telegramUserId: ctx.from?.id ?? 0,
          telegramChatId: ctx.chat.id,
          messageId: ctx.message.message_id,
        });
        const safeReply = escapeTelegramMarkdownV2(reply);
        for (const chunk of splitTelegramMessage(safeReply)) {
          await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
        }
      } catch (err) {
        console.error("Agent error:", err);
        await ctx.reply("Agent error. Try again.");
      }
    });

    bot.catch((err) => {
      console.error("Bot error:", err.error, {
        updateId: err.ctx?.update?.update_id,
      });
    });

    console.log("Sergeant Console starting…");
    consolePromise = bot.start();
  }

  // OpenClaw — DM-only co-founder bot (ADR-0031). Fail-closed якщо env-и не
  // налаштовані — main bot стартує далі, OpenClaw тихо вимкнений з warning-ом.
  const openclawToken = process.env.OPENCLAW_BOT_TOKEN;
  const founderUserId = process.env.OPENCLAW_FOUNDER_USER_ID;
  const serverUrl = process.env.SERVER_INTERNAL_URL ?? "http://localhost:3000";
  const internalApiKey = process.env.INTERNAL_API_KEY ?? "";

  let openclawPromise: Promise<void> | undefined;
  if (!openclawToken) {
    console.warn(
      "OpenClaw not started: OPENCLAW_BOT_TOKEN is not set (Phase 1 fail-closed).",
    );
  } else if (!founderUserId) {
    console.warn("OpenClaw not started: OPENCLAW_FOUNDER_USER_ID is not set.");
  } else if (!internalApiKey) {
    console.warn(
      "OpenClaw not started: INTERNAL_API_KEY is not set (server tools unreachable).",
    );
  } else {
    const openclawBot = new Bot(openclawToken);
    attachOpenClawHandlers({
      bot: openclawBot,
      anthropic,
      serverUrl,
      internalApiKey,
      founderUserId,
      maxIterations: parseOpenClawMaxIterations(
        process.env.OPENCLAW_MAX_ITERATIONS,
      ),
    });
    console.log("OpenClaw starting…");
    openclawPromise = openclawBot.start();
  }

  // Sanity: if neither bot is configured, the process has nothing to do.
  // Exit non-zero so platform restart-loops or operators notice the misconfig
  // (otherwise we'd silently sleep forever holding a Railway slot).
  if (!consolePromise && !openclawPromise) {
    console.error(
      "No bots started: set OPENCLAW_BOT_TOKEN (and friends) or CONSOLE_BOT_TOKEN.",
    );
    process.exit(1);
  }

  const promises: Array<Promise<void>> = [];
  if (consolePromise) promises.push(consolePromise);
  if (openclawPromise) promises.push(openclawPromise);
  await Promise.all(promises);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
