/**
 * Non-command bot event handlers for the OpenClaw bot.
 *
 * Split out of `handler-commands.ts` (PR-36 follow-up). Owns the
 * free-text DM listener (`bot.on("message:text")`) and the global
 * error sink (`bot.catch`).
 *
 * Free-text DM messages skip slash-handlers and either:
 *   1. dispatch to WF-20 (the agent network) when
 *      `shouldDelegateOpenClawToAgentNetwork` matches, or
 *   2. fall through to the in-process `runAgentTurn` (LLM tool loop).
 *
 * `bot.catch` is intentionally a sink-of-last-resort — most failures
 * are surfaced by the crash-backoff supervisor (PR-46) and the
 * process-level lifecycle handlers (#2550). This just ensures grammy
 * does not swallow errors silently and `update_id` makes it into the
 * console output for correlation with Telegram-side traces.
 */

import { shouldDelegateOpenClawToAgentNetwork } from "../agents/dispatcher.js";
import { isFounderAllowed, isPrivateChat } from "./security.js";
import { dispatchOpenClawAgentTask } from "./handler-agent-commands.js";
import type { HandlerContext } from "./handler-context.js";

export function registerEventHandlers(ctx: HandlerContext): void {
  const { bot, rateLimiter, runAgentTurn } = ctx;

  bot.on("message:text", async (c) => {
    // 1) DM-only.
    if (!isPrivateChat(c.chat?.type)) return; // silent ignore

    // 2) Allowlist.
    const userId = c.from?.id;
    if (!isFounderAllowed(userId, process.env)) {
      // Reply only if message addressed bot напряму — щоб не leak-нути
      // bot info рандомним юзерам, які знайшли handle. У DM-у завжди
      // адресовано.
      await c.reply("Access denied.");
      return;
    }

    // 3) Rate limit per-minute (anti-spam, окреме від budget).
    if (!rateLimiter.allow(String(userId))) {
      await c.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }

    const userMessage = c.message.text.trim();
    if (!userMessage) return;
    // /commands handled outside; ось ми лише message-text-handler.
    if (userMessage.startsWith("/")) return;

    if (shouldDelegateOpenClawToAgentNetwork(userMessage)) {
      await dispatchOpenClawAgentTask(c, userMessage);
      return;
    }

    await runAgentTurn(c, userMessage, "dm");
  });

  bot.catch((err) => {
    console.error("OpenClaw bot error:", err.error, {
      updateId: err.ctx?.update?.update_id,
    });
  });
}
