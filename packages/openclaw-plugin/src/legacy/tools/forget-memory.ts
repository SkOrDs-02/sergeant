/**
 * `forget_memory` tool — Phase 2 founder-control write-tool (PR-23).
 *
 * Контракт із server (`apps/server/src/routes/internal/openclaw.ts`
 * `ForgetBody` discriminated union):
 *
 *   POST /api/internal/openclaw/forget
 *     {
 *       founderUserId: string,
 *       founderTgUserId: number,
 *       rawCommand: string,
 *       mode: "byId" | "byTopic" | "since" | "previewQuery",
 *       ...mode-specific fields
 *     }
 *
 *   → for byId/byTopic/since:
 *     {
 *       deletedCount: number,
 *       invocationId: number,
 *       mode: ForgetMode
 *     }
 *
 *   → for previewQuery:
 *     {
 *       token: string,           // UUID, 5-min TTL
 *       matches: Array<{ id, content, source, topic, similarity, createdAt }>,
 *       expiresAt: string         // ISO 8601
 *     }
 *
 *   POST /api/internal/openclaw/forget/confirm
 *     { founderUserId, founderTgUserId, rawCommand, token }
 *     → same as byId result shape.
 *
 *   POST /api/internal/openclaw/forget/cancel
 *     { founderUserId, token }
 *     → { cancelled: boolean }
 *
 * Tool exposes ONE `forget_memory` definition; mode is a discriminated
 * union у params-схемі. Shortcut layer (`shortcuts/forget.ts`) парсить
 * regex варіанти і викликає tool з відповідним mode.
 *
 * Не write-tool у Variant B sense — не вимагає approval gate, бо
 * confirmation flow вже зашитий у `previewQuery → confirmForget`. Лише
 * `byId` / `byTopic` / `since` ідуть прямо (rate-limited 3/hour на
 * server-side; не плутати з approval-flow).
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "./../http-client.js";
import { OpenClawHttpError } from "./../http-client.js";
import type { ToolDefinition, ToolResult } from "./../sdk-types.js";

export const ForgetMemoryParamsSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("byId"),
    memoryId: z.number().int().positive(),
    rawCommand: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("byTopic"),
    topic: z.string().min(1).max(200),
    rawCommand: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("since"),
    sinceDate: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
        "sinceDate must be ISO8601 (YYYY-MM-DD or full timestamp)",
      ),
    rawCommand: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("previewQuery"),
    query: z.string().min(1).max(2000),
    topK: z.number().int().min(1).max(20).optional(),
    rawCommand: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("confirm"),
    token: z.string().uuid(),
    rawCommand: z.string().max(500).optional(),
  }),
  z.object({
    mode: z.literal("cancel"),
    token: z.string().uuid(),
    rawCommand: z.string().max(500).optional(),
  }),
]);

export type ForgetMemoryParams = z.infer<typeof ForgetMemoryParamsSchema>;

interface ForgetExecuteResponse {
  deletedCount: number;
  invocationId: number;
  mode: "byId" | "byTopic" | "since" | "previewQuery";
}

interface ForgetMatchPreviewItem {
  id: number;
  content: string;
  source: string;
  topic: string | null;
  similarity: number;
  createdAt: string;
}

interface ForgetPreviewResponse {
  token: string;
  matches: ForgetMatchPreviewItem[];
  expiresAt: string;
}

interface ForgetCancelResponse {
  cancelled: boolean;
}

export interface ForgetMemoryToolOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  /**
   * Telegram-side numeric user-id, обовʼязковий для audit-row у
   * `openclaw_invocations`. Передаємо з config — у `tools/openclaw` —
   * приймальник з `OPENCLAW_FOUNDER_TG_USER_ID`.
   */
  founderTgUserId: number;
}

const FORGET_DESCRIPTION = `Selectively delete entries from the founder's
AI memory store (\`ai_memories\`, source='cofounder'). Soft-delete pattern:
\`deleted_at TIMESTAMPTZ\` is set, then a 7-day cleanup cron hard-deletes.
Mode-dispatched:
  * byId(memoryId)       — delete one row by ai_memories.id
  * byTopic(topic)       — delete all rows for founder × topic
  * since(sinceDate)     — delete all rows created on/after YYYY-MM-DD
  * previewQuery(query)  — semantic search top-5, returns token+preview
                           WITHOUT deleting. Founder confirms via UI.
  * confirm(token)       — execute the staged preview-set deletion
  * cancel(token)        — abandon staged token
Rate-limited (3 deletes/hour/founder). Audit row written in
\`openclaw_invocations\` with \`metadata.deleted_count\`.`;

export function createForgetMemoryTool(
  opts: ForgetMemoryToolOptions,
): ToolDefinition<ForgetMemoryParams> {
  return {
    name: "forget_memory",
    description: FORGET_DESCRIPTION,
    parameters: ForgetMemoryParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const rawCommand = params.rawCommand ?? `/forget ${params.mode}`;

        if (params.mode === "byId") {
          const response = await opts.http.post<ForgetExecuteResponse>(
            "/forget",
            {
              founderUserId: opts.founderUserId,
              founderTgUserId: opts.founderTgUserId,
              rawCommand,
              mode: "byId",
              memoryId: params.memoryId,
            },
          );
          return formatExecuteResult(response);
        }

        if (params.mode === "byTopic") {
          const response = await opts.http.post<ForgetExecuteResponse>(
            "/forget",
            {
              founderUserId: opts.founderUserId,
              founderTgUserId: opts.founderTgUserId,
              rawCommand,
              mode: "byTopic",
              topic: params.topic,
            },
          );
          return formatExecuteResult(response);
        }

        if (params.mode === "since") {
          const response = await opts.http.post<ForgetExecuteResponse>(
            "/forget",
            {
              founderUserId: opts.founderUserId,
              founderTgUserId: opts.founderTgUserId,
              rawCommand,
              mode: "since",
              sinceDate: params.sinceDate,
            },
          );
          return formatExecuteResult(response);
        }

        if (params.mode === "previewQuery") {
          const response = await opts.http.post<ForgetPreviewResponse>(
            "/forget",
            {
              founderUserId: opts.founderUserId,
              founderTgUserId: opts.founderTgUserId,
              rawCommand,
              mode: "previewQuery",
              query: params.query,
              topK: params.topK,
            },
          );
          return formatPreviewResult(response);
        }

        if (params.mode === "confirm") {
          const response = await opts.http.post<ForgetExecuteResponse>(
            "/forget/confirm",
            {
              founderUserId: opts.founderUserId,
              founderTgUserId: opts.founderTgUserId,
              rawCommand,
              token: params.token,
            },
          );
          return formatExecuteResult(response);
        }

        // cancel
        const response = await opts.http.post<ForgetCancelResponse>(
          "/forget/cancel",
          {
            founderUserId: opts.founderUserId,
            token: params.token,
          },
        );
        return {
          content: [
            {
              type: "text",
              text: response.cancelled
                ? "❌ Forget-preview скасовано."
                : "(token уже неактивний — нічого скасовувати)",
            },
            { type: "structured", data: { cancelled: response.cancelled } },
          ],
        };
      } catch (err) {
        return formatForgetError(err);
      }
    },
  };
}

function formatExecuteResult(response: ForgetExecuteResponse): ToolResult {
  const lines = [
    `🗑️ Видалено ${response.deletedCount} memory row(s).`,
    `(soft-delete; hard-delete через 7 днів. Mode: ${response.mode}.)`,
  ];
  return {
    content: [
      { type: "text", text: lines.join("\n") },
      {
        type: "structured",
        data: {
          deletedCount: response.deletedCount,
          invocationId: response.invocationId,
          mode: response.mode,
        },
      },
    ],
  };
}

function formatPreviewResult(response: ForgetPreviewResponse): ToolResult {
  const matches = Array.isArray(response.matches) ? response.matches : [];
  if (matches.length === 0) {
    return {
      content: [
        { type: "text", text: "(нічого не знайдено для preview)" },
        {
          type: "structured",
          data: {
            token: response.token,
            matches: [],
            expiresAt: response.expiresAt,
          },
        },
      ],
    };
  }

  const lines: string[] = [
    `🔍 Знайдено ${matches.length} кандидатів на видалення:`,
    "",
  ];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const sim = Number.isFinite(m.similarity) ? m.similarity.toFixed(3) : "n/a";
    const date = (m.createdAt ?? "").slice(0, 10);
    const topic = m.topic ? ` <${m.topic}>` : "";
    const snippet =
      m.content.length > 80 ? `${m.content.slice(0, 77)}…` : m.content;
    lines.push(
      `${i + 1}.${topic} (sim=${sim}, ${date}, id=${m.id}) ${snippet}`,
    );
  }
  lines.push("");
  lines.push(`✅ Підтвердити: \`/forget confirm ${response.token}\``);
  lines.push(`❌ Скасувати: \`/forget cancel ${response.token}\``);
  lines.push(`(token expires at ${response.expiresAt})`);

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      {
        type: "structured",
        data: {
          token: response.token,
          matches,
          expiresAt: response.expiresAt,
        },
      },
    ],
  };
}

function formatForgetError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    if (err.status === 429) {
      return {
        content: [
          {
            type: "text",
            text: `⏱️ Rate-limit: 3 deletes/hour. Спробуй пізніше. (${err.responseText.slice(0, 200)})`,
          },
        ],
      };
    }
    if (err.status === 410) {
      return {
        content: [
          {
            type: "text",
            text: `🪙 Token expired or invalid. Перезапусти preview-команду. (${err.responseText.slice(0, 200)})`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `forget_memory failed: HTTP ${err.status} (${err.responseText.slice(0, 200)})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `forget_memory failed: ${message}` }],
  };
}
