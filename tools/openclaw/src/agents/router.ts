import Anthropic from "@anthropic-ai/sdk";
import { runOpsAgent } from "./ops.js";
import { runMarketingAgent } from "./marketing.js";
import {
  buildDispatcherPayload,
  dispatchToN8n,
  formatApprovalPrompt,
} from "./dispatcher.js";

export type AgentType = "ops" | "marketing" | "dispatcher" | "help" | "unknown";

export interface TelegramDispatchContext {
  telegramUserId: number;
  telegramChatId: number;
  messageId: number;
}

/**
 * Parses the Telegram message to determine which agent should handle it.
 * Commands take priority; free-form text falls back to a cheap classifier.
 */
export function parseCommand(text: string): {
  agent: AgentType;
  query: string;
} {
  const trimmed = text.trim();

  // Explicit /help command
  if (trimmed === "/help" || trimmed === "/start") {
    return { agent: "help", query: "" };
  }

  const dispatcherCommands = [
    "status",
    "plan",
    "assign",
    "review",
    "run",
    "approve",
    "cancel",
    "logs",
  ];
  for (const command of dispatcherCommands) {
    if (trimmed === `/${command}` || trimmed.startsWith(`/${command} `)) {
      return {
        agent: "dispatcher",
        query: trimmed
          // eslint-disable-next-line security/detect-non-literal-regexp -- `command` from `dispatcherCommands` const allowlist (lines 33-42), no user input
          .replace(new RegExp(`^/${command}\\s*`), `${command} `)
          .trim(),
      };
    }
  }

  if (trimmed.startsWith("/ops ") || trimmed === "/ops") {
    return {
      agent: "ops",
      query:
        trimmed.replace(/^\/ops\s*/, "").trim() ||
        "Show current production status.",
    };
  }
  if (trimmed.startsWith("/content ") || trimmed === "/content") {
    return {
      agent: "marketing",
      query:
        trimmed.replace(/^\/content\s*/, "").trim() ||
        "What should we post this week?",
    };
  }
  if (trimmed.startsWith("/marketing ")) {
    return {
      agent: "marketing",
      query: trimmed.replace(/^\/marketing\s*/, "").trim(),
    };
  }

  // Free-form: classify by keywords (cheap heuristic)
  const lower = trimmed.toLowerCase();
  const opsKeywords = [
    "error",
    "sentry",
    "stripe",
    "payment",
    "deploy",
    "crash",
    "down",
    "prod",
    "server",
    "db",
    "alert",
    "billing",
    "users",
    "railway",
    "health",
    "latency",
    "timeout",
    "migration",
    "помилка",
    "сервер",
    "платіж",
    "деплой",
    "база",
    "лог",
    "алерт",
    "впав",
    "не працює",
  ];
  const mktKeywords = [
    "post",
    "tweet",
    "thread",
    "content",
    "marketing",
    "copy",
    "text",
    "changelog",
    "release notes",
    "announcement",
    "funnel",
    "conversion",
    "growth",
    "пост",
    "контент",
    "маркетинг",
    "написати",
    "реліз",
    "анонс",
    "воронка",
    "конверсія",
    "ченджлог",
  ];

  const opsScore = opsKeywords.filter((k) => lower.includes(k)).length;
  const mktScore = mktKeywords.filter((k) => lower.includes(k)).length;

  if (opsScore > mktScore) return { agent: "ops", query: trimmed };
  if (mktScore > opsScore) return { agent: "marketing", query: trimmed };

  return { agent: "unknown", query: trimmed };
}

const HELP_TEXT = [
  "*Sergeant Console* — внутрішній бот для ops та маркетингу.\n",
  "*Команди:*",
  "  /ops <питання> — інфраструктура, білінг, помилки, деплої",
  "  /content <тема> — контент, маркетинг, пости, release notes",
  "  /marketing <тема> — аліас для /content",
  "  /help — ця довідка\n",
  "*Вільний текст:* бот автоматично визначає агента за ключовими словами.",
  "Якщо невпевнений — використай явну команду.",
].join("\n");

/**
 * Classify ambiguous messages using a cheap LLM call (Haiku-class).
 * Falls back to "unknown" if classification fails.
 */
async function classifyWithLlm(
  client: Anthropic,
  query: string,
): Promise<AgentType> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 16,
      system:
        'Classify the user message as "ops" (infrastructure, billing, errors, deployments, server, database) or "marketing" (content, posts, announcements, growth, funnels, release notes). Reply with exactly one word: ops or marketing.',
      messages: [{ role: "user", content: query }],
    });
    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "";
    if (text === "ops" || text === "marketing") return text;
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function dispatchToAgent(
  client: Anthropic,
  agent: AgentType,
  query: string,
  context?: TelegramDispatchContext,
): Promise<string> {
  if (agent === "help") return HELP_TEXT;
  if (agent === "ops") return runOpsAgent(client, query);
  if (agent === "marketing") return runMarketingAgent(client, query);
  if (agent === "dispatcher") {
    if (!context) {
      return "Dispatcher context is missing; cannot route this Telegram command.";
    }
    const payload = buildDispatcherPayload({
      commandText: query,
      telegramUserId: context.telegramUserId,
      telegramChatId: context.telegramChatId,
      messageId: context.messageId,
    });
    if (payload.requiresApproval && payload.action !== "approve") {
      return formatApprovalPrompt(payload);
    }
    return dispatchToN8n(payload);
  }

  // For ambiguous messages, try LLM classification before giving up
  const classified = await classifyWithLlm(client, query);
  if (classified === "ops") return runOpsAgent(client, query);
  if (classified === "marketing") return runMarketingAgent(client, query);

  return [
    "Не впевнений, який агент підходить. Використай команду:",
    "",
    "*/ops* <питання> — інфраструктура, білінг, помилки",
    "*/content* <тема> — контент, маркетинг, пости",
    "*/help* — показати всі команди",
  ].join("\n");
}
