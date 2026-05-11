/**
 * `read_telegram_topic` tool — reads message history from a Telegram
 * forum topic (used by the ops supergroup).
 *
 * Server contract (`POST /api/internal/openclaw/telegram`):
 *   { topic: string, since?: string, limit?: number }
 *   → { messages: Array<{ id, text, date, from, ... }> }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const ReadTelegramTopicParamsSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe(
      "Topic name or ID within the Sergeant_ops supergroup (e.g. '⚙️ Контрол-план', 'metrics', 'errors').",
    ),
  since: z
    .string()
    .optional()
    .describe("ISO-8601 timestamp — return only messages after this time."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max messages to return (default 20)."),
});

export type ReadTelegramTopicParams = z.infer<
  typeof ReadTelegramTopicParamsSchema
>;

interface TelegramMessage {
  id: number;
  text: string;
  date: string;
  from?: string;
  [key: string]: unknown;
}

interface TelegramResponse {
  messages: TelegramMessage[];
}

export interface ReadTelegramTopicToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Read message history from a Telegram ops forum topic. Use when
checking what was posted ("що нового в #metrics?", "які алерти були?",
"покажи останні повідомлення з контрол-плану").`;

export function createReadTelegramTopicTool(
  opts: ReadTelegramTopicToolOptions,
): ToolDefinition<ReadTelegramTopicParams> {
  return {
    name: "read_telegram_topic",
    description: DESCRIPTION,
    parameters: ReadTelegramTopicParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<TelegramResponse>("/telegram", {
          topic: params.topic,
          since: params.since,
          limit: params.limit,
        });
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: TelegramResponse): ToolResult {
  const messages = Array.isArray(response.messages) ? response.messages : [];
  if (messages.length === 0) {
    return {
      content: [{ type: "text", text: "(no messages found in this topic)" }],
    };
  }

  const lines = messages.map((msg) => {
    const from = msg.from ? `[${msg.from}]` : "";
    const date = (msg.date ?? "").slice(0, 16);
    return `${date} ${from} ${msg.text}`;
  });

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: { messages } },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(Telegram topic error: HTTP ${err.status} — ${err.responseText || err.message})`,
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text",
        text: `(unexpected error: ${err instanceof Error ? err.message : String(err)})`,
      },
    ],
  };
}
