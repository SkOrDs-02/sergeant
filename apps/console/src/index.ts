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
  "*Sergeant Console* — твій AI-помічник по продукту",
  "",
  "*/ops* <питання> — запитати Ops-агента",
  "  Приклади: /ops що там у проді? | /ops скільки нових юзерів сьогодні?",
  "",
  "*/content* <тема> — запитати Marketing-агента",
  "  Приклади: /content пост про новий реліз | /content ідеї для X",
  "",
  "*Без команди* — я сам визначу агента за контекстом.",
  "",
  "_Версія: Phase 1 (Claude API + Telegram bot)_",
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

    // Send "typing..." indicator
    await ctx.replyWithChatAction("typing");

    try {
      const reply = await dispatchToAgent(anthropic, agent, query);
      const safeReply = escapeTelegramMarkdownV2(reply);
      for (const chunk of splitTelegramMessage(safeReply)) {
        await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
      }
    } catch (err) {
      console.error("Agent error:", err);
      await ctx.reply("❌ Сталася помилка. Спробуй ще раз.");
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
