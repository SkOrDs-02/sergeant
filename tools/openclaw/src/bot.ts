/**
 * Console bot handler attachment — `attachConsoleHandlers({ bot, anthropic,
 * limiter, env })` реєструє `/start`, `/help` та `message:text` хендлери на
 * переданий `Bot`-інстанс, без побічних ефектів самого `bot.start()`.
 *
 * Винесено з `index.ts` (раніше — інлайн всередині `main()`), щоб e2e-тест
 * (`__tests__/bot.e2e.test.ts`) міг прогнати грамі-апдейт через
 * `bot.handleUpdate(...)` без запуску long-poll, мережевих викликів чи env-mock-ів.
 *
 * Контракт:
 * - `checkAuth(userId)` — фільтр allowlist; виклик до rate-limiter-а.
 * - `dispatchToAgent` — інжектиться (default: реальний router); тести підмінюють.
 * - `replyWithChatAction("typing")` — UX cue, не в критичному шляху, помилки
 *   глобально каплються `bot.catch`.
 */

import type { Bot } from "grammy";
import type Anthropic from "@anthropic-ai/sdk";
import {
  dispatchToAgent as defaultDispatchToAgent,
  parseCommand,
} from "./agents/router.js";
import {
  CONSOLE_GLOBAL_RATE_CAP_HIT_TOTAL,
  incrementCounter,
} from "./obs/metrics.js";
import {
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  isUserAllowed,
  splitTelegramMessage,
  type ConsoleEnv,
} from "./security.js";
import { HELP_TEXT } from "./help-text.js";

export interface AttachConsoleHandlersOptions {
  bot: Bot;
  anthropic: Anthropic;
  limiter: FixedWindowRateLimiter;
  env: ConsoleEnv;
  dispatchToAgent?: typeof defaultDispatchToAgent;
}

export function attachConsoleHandlers(
  options: AttachConsoleHandlersOptions,
): void {
  const {
    bot,
    anthropic,
    limiter,
    env,
    dispatchToAgent = defaultDispatchToAgent,
  } = options;

  const checkAuth = (userId: number | undefined) => isUserAllowed(userId, env);

  bot.command("start", async (ctx) => {
    if (!checkAuth(ctx.from?.id)) {
      await ctx.reply("Access denied.");
      return;
    }
    await ctx.reply(HELP_TEXT, { parse_mode: "MarkdownV2" });
  });

  bot.command("help", async (ctx) => {
    if (!checkAuth(ctx.from?.id)) return;
    await ctx.reply(HELP_TEXT, { parse_mode: "MarkdownV2" });
  });

  bot.on("message:text", async (ctx) => {
    if (!checkAuth(ctx.from?.id)) {
      await ctx.reply("Access denied.");
      return;
    }
    const rateLimitKey = String(ctx.from?.id ?? ctx.chat.id);
    if (!limiter.allow(rateLimitKey)) {
      if (limiter.lastDeny() === "global") {
        incrementCounter(CONSOLE_GLOBAL_RATE_CAP_HIT_TOTAL);
      }
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
}
