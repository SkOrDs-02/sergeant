/**
 * `recall_memory` tool — Phase 0.5 PoC read tool.
 *
 * Перевіряє у PoC:
 *   1. HTTP-клієнт + типи (sdk-types ↔ server response shape).
 *   2. Серіалізація tool-result у форматі OpenClaw SDK
 *      (`{ content: [{ type: "text", text }] }`).
 *   3. Persona/topic-фільтри з міграції 054 — server side filter
 *      `WHERE persona = $persona OR topic = 'shared'` (server-side);
 *      tool лише форвардить параметри.
 *
 * Контракт із server (`apps/server/src/routes/internal/openclaw.ts`
 * `RecallBody`):
 *   POST /api/internal/openclaw/recall
 *     {
 *       founderUserId: string,
 *       query: string,
 *       topK?: number    // default 5 (server-side)
 *     }
 *   →
 *     {
 *       memories: Array<{
 *         id: number,
 *         content: string,
 *         source: string,
 *         persona?: string,
 *         topic?: string | null,
 *         similarity: number,
 *         createdAt: string  // ISO8601
 *       }>,
 *       degraded?: boolean   // true якщо embedding-call не вдався
 *     }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "./../http-client.js";
import { OpenClawHttpError } from "./../http-client.js";
import type { ToolDefinition, ToolResult } from "./../sdk-types.js";

export const RecallMemoryParamsSchema = z.object({
  query: z
    .string()
    .min(1, "query must not be empty")
    .max(2000, "query too long (>2000 chars)")
    .describe(
      "Natural-language search query (Ukrainian or English). Tool will retrieve top-k semantically similar memories.",
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Number of memories to return (1–20). Defaults to 5 server-side.",
    ),
  persona: z
    .string()
    .optional()
    .describe(
      "Filter to memories written by this persona (e.g. 'eng', 'finance'). Omit to see all (cofounder superuser view).",
    ),
});

export type RecallMemoryParams = z.infer<typeof RecallMemoryParamsSchema>;

interface RecallMemoryItem {
  id: number;
  content: string;
  source: string;
  persona?: string;
  topic?: string | null;
  similarity: number;
  createdAt: string;
}

interface RecallResponse {
  memories: RecallMemoryItem[];
  degraded?: boolean;
}

export interface RecallMemoryToolOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
}

const RECALL_DESCRIPTION = `Retrieve top-k semantically similar memories from the founder's
cofounder-namespace memory store (\`ai_memories\`, source='cofounder').
Use this when the founder asks something context-dependent ("як ми
вирішували …?", "пам'ятаєш, що з …?"). Returns most relevant memories
with similarity score, persona, topic, and creation timestamp. Cheap; no
LLM cost — only embedding call.`;

export function createRecallMemoryTool(
  opts: RecallMemoryToolOptions,
): ToolDefinition<RecallMemoryParams> {
  return {
    name: "recall_memory",
    description: RECALL_DESCRIPTION,
    parameters: RecallMemoryParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<RecallResponse>("/recall", {
          founderUserId: opts.founderUserId,
          query: params.query,
          topK: params.topK,
          persona: params.persona,
        });
        return formatRecallResult(response);
      } catch (err) {
        return formatRecallError(err);
      }
    },
  };
}

function formatRecallResult(response: RecallResponse): ToolResult {
  const memories = Array.isArray(response.memories) ? response.memories : [];
  if (memories.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: response.degraded
            ? "(no memories found; embedding service is degraded — try again later)"
            : "(no memories matched this query)",
        },
      ],
    };
  }

  const lines: string[] = [];
  if (response.degraded) {
    lines.push("⚠️ embedding service degraded — results may be partial.\n");
  }
  for (let i = 0; i < memories.length; i++) {
    const m = memories[i]!;
    const personaLabel = m.persona ? ` [${m.persona}]` : "";
    const topicLabel = m.topic ? ` <${m.topic}>` : "";
    const sim = Number.isFinite(m.similarity) ? m.similarity.toFixed(3) : "n/a";
    const date = (m.createdAt ?? "").slice(0, 10);
    lines.push(
      `${i + 1}.${personaLabel}${topicLabel} (sim=${sim}, ${date}) ${m.content}`,
    );
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      {
        type: "structured",
        data: {
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            persona: m.persona,
            topic: m.topic,
            similarity: m.similarity,
            createdAt: m.createdAt,
          })),
          degraded: response.degraded ?? false,
        },
      },
    ],
  };
}

function formatRecallError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `recall_memory failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `recall_memory failed: ${message}` }],
  };
}
