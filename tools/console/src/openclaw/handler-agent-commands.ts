/**
 * Agent-turn slash-commands for the OpenClaw bot.
 *
 * Split out of `handler-commands.ts` (PR-36 follow-up). Owns every
 * command that drives the LLM agent loop: the dispatcher-routed
 * commands (`DISPATCHER_COMMANDS`), preset prompts (`COMMAND_PROMPTS`),
 * persona-scoped commands (`PERSONA_COMMANDS`), strategic-mode commands
 * (`STRATEGIC_MODE_COMMANDS`), and `/council` round-table mode.
 *
 * `dispatchOpenClawAgentTask` is exported because the
 * `bot.on("message:text")` event handler in `handler-events.ts` reuses
 * the same two-phase preview → approval → dispatch flow when
 * `shouldDelegateOpenClawToAgentNetwork(text)` is `true`.
 */

import type { Context } from "grammy";
import {
  buildDispatcherPayload,
  dispatchToN8n,
  formatApprovalPrompt,
} from "../agents/dispatcher.js";
import { COUNCIL_PERSONAS, type OpenClawPersona } from "../agents/personas.js";
import {
  STRATEGIC_MODE_TRIGGERS,
  type StrategicMode,
} from "../agents/strategic-modes.js";
import { escapeTelegramMarkdownV2, splitTelegramMessage } from "../security.js";
import type { HandlerContext } from "./handler-context.js";
import {
  COMMAND_PROMPTS,
  DISPATCHER_COMMANDS,
  PERSONA_COMMANDS,
  PERSONA_LABEL,
  postJson,
  type BudgetResponse,
} from "./handler-constants.js";

/**
 * Dispatch a free-text or slash-command request to WF-20 (the agent
 * network). Used by the `DISPATCHER_COMMANDS` loop here and by the
 * `message:text` handler in `handler-events.ts` when
 * `shouldDelegateOpenClawToAgentNetwork` returns true. Two-phase:
 * preview payload → optional approval prompt → final dispatch.
 *
 * Stateless — only needs the grammy `Context` and the user's command
 * text. The status-callback URL is sourced from the environment.
 */
export async function dispatchOpenClawAgentTask(
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
    statusCallbackWebhookUrl: process.env["OPENCLAW_AGENT_STATUS_CALLBACK_URL"],
  });

  if (previewPayload.requiresApproval && previewPayload.action !== "approve") {
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

export function registerAgentCommands(ctx: HandlerContext): void {
  const {
    bot,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
    rateLimiter,
    councilUsdBudget,
    runAgentTurn,
    isAllowedDmContext,
  } = ctx;

  // ADR-0032: Sergeant Console (ADR-0027) slash-команди (/ops, /content, …)
  // зливаються в OpenClaw як preset-prompts через той самий agent-turn loop.
  // Тригер ідентифікує запит у audit-log-у (`openclaw_invocations.trigger`).
  for (const cmd of DISPATCHER_COMMANDS) {
    bot.command(cmd, async (c) => {
      if (!isAllowedDmContext(c)) return;
      const userId = c.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await c.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      const argument = (c.match ?? "").toString().trim();
      const commandText = argument ? `${cmd} ${argument}` : cmd;
      await dispatchOpenClawAgentTask(c, commandText);
    });
  }

  for (const [cmd, preset] of Object.entries(COMMAND_PROMPTS)) {
    bot.command(cmd, async (c) => {
      if (!isAllowedDmContext(c)) return;
      const userId = c.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await c.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      await runAgentTurn(c, preset, "dm");
    });
  }

  // ADR-0033 (Phase 2.5): persona-scoped slash-команди. Очікуємо
  // argument: `/ops <q>`. Порожня команда → короткий hint.
  for (const { cmd, persona } of PERSONA_COMMANDS) {
    bot.command(cmd, async (c) => {
      if (!isAllowedDmContext(c)) return;
      const userId = c.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await c.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      const argument = (c.match ?? "").toString().trim();
      if (!argument) {
        await c.reply(
          `Напиши питання після /${cmd}, напр. \`/${cmd} як виглядає ${PERSONA_LABEL[persona].toLowerCase()} ситуація зараз?\``,
        );
        return;
      }
      await runAgentTurn(c, argument, "dm", persona);
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
    bot.command(cmd, async (c) => {
      if (!isAllowedDmContext(c)) return;
      const userId = c.from?.id;
      if (!userId) return;
      if (!rateLimiter.allow(String(userId))) {
        await c.reply("Rate limit exceeded. Спробуй за хвилину.");
        return;
      }
      const argument = (c.match ?? "").toString().trim();
      if (requiresArgument && !argument) {
        await c.reply(`Напиши тему після /${cmd}, напр. \`${placeholder}\`.`);
        return;
      }
      const userMessage = argument
        ? argument
        : `Запусти ${mode}-mode без додаткового контексту — використай дані, що тобі доступні.`;
      const trigger = STRATEGIC_MODE_TRIGGERS[mode] as
        | "strategic_plan"
        | "strategic_analyze"
        | "strategic_okr";
      await runAgentTurn(c, userMessage, trigger, "cofounder", {
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
  bot.command("council", async (c) => {
    if (!isAllowedDmContext(c)) return;
    const userId = c.from?.id;
    if (!userId) return;
    if (!rateLimiter.allow(String(userId))) {
      await c.reply("Rate limit exceeded. Спробуй за хвилину.");
      return;
    }
    const question = (c.match ?? "").toString().trim();
    if (!question) {
      await c.reply(
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
      await c.reply(
        `Не вистачає бюджету: $${spent.toFixed(2)} / $${cap.toFixed(2)}. /council потребує мінімум $${councilUsdBudget.toFixed(2)} залишку.`,
      );
      return;
    }
    if (headroom.data.remainingUsd < councilUsdBudget) {
      await c.reply(
        `Council вимагає ≥3 $${councilUsdBudget.toFixed(2)} budget headroom; зараз залишок $${headroom.data.remainingUsd.toFixed(4)}. Спробуй окрему /ops або завтра.`,
      );
      return;
    }

    await c.reply(
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
      await c.reply(
        `*${escapeTelegramMarkdownV2(PERSONA_LABEL[persona])}* ${escapeTelegramMarkdownV2("думає…")}`,
        { parse_mode: "MarkdownV2" },
      );
      const turn = await runAgentTurn(c, question, "dm", persona, {
        maxIterationsOverride: PER_TURN_ITER_CAP,
        metadataExtras: { council: true, councilStep: persona },
      });
      if (!turn.ok) {
        await c.reply(
          `Council aborted on persona=${persona}. Дивись logs / спробуй окрему /${persona}.`,
        );
        return;
      }
      specialistReplies.push({ persona, reply: turn.reply });
      const safeReply = escapeTelegramMarkdownV2(
        `*${PERSONA_LABEL[persona]}*\n${turn.reply}`,
      );
      for (const chunk of splitTelegramMessage(safeReply)) {
        await c.reply(chunk, { parse_mode: "MarkdownV2" });
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
    await c.reply("*Cofounder synthesis…*", { parse_mode: "MarkdownV2" });
    await runAgentTurn(c, synthesisPrompt, "dm", "cofounder", {
      maxIterationsOverride: Math.min(4, maxIterations),
      metadataExtras: { council: true, councilStep: "synthesis" },
    });
  });
}
