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
  const botToken = process.env.CONSOLE_BOT_TOKEN;
  if (!botToken) {
    console.error("CONSOLE_BOT_TOKEN is not set");
    process.exit(1);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const bot = new Bot(botToken);
  const anthropic = new Anthropic({ apiKey: anthropicKey });
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
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
