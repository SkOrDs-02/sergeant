/**
 * `read_strategy_docs` tool — reads strategy/planning/ADR documents from
 * the Sergeant repo file-system (or git blob on Railway).
 *
 * Server contract (`POST /api/internal/openclaw/strategy`):
 *   { path: string }
 *   → { content: string, path: string }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const ReadStrategyDocsParamsSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Relative path within the repo to a strategy/planning/ADR document (e.g. 'docs/launch/tech/openclaw-roadmap.md', 'docs/adr/0031-openclaw-v0-telegram-cofounder.md').",
    ),
});

export type ReadStrategyDocsParams = z.infer<
  typeof ReadStrategyDocsParamsSchema
>;

interface StrategyResponse {
  content: string;
  path: string;
}

export interface ReadStrategyDocsToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Read a strategy, planning, or ADR document from the Sergeant
repository. Use when the founder asks about decisions, plans, or architecture
("що ми записали в ADR-0031?", "покажи план міграції"). Returns the full
markdown content. Path must be relative to repo root.`;

export function createReadStrategyDocsTool(
  opts: ReadStrategyDocsToolOptions,
): ToolDefinition<ReadStrategyDocsParams> {
  return {
    name: "read_strategy_docs",
    description: DESCRIPTION,
    parameters: ReadStrategyDocsParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<StrategyResponse>("/strategy", {
          path: params.path,
        });
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: StrategyResponse): ToolResult {
  if (!response.content) {
    return {
      content: [{ type: "text", text: "(document is empty or not found)" }],
    };
  }
  return {
    content: [
      { type: "text", text: response.content },
      { type: "structured", data: { path: response.path } },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    if (err.status === 404) {
      return {
        content: [
          {
            type: "text",
            text: `(document not found: ${err.responseText || err.message})`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `(error reading strategy doc: HTTP ${err.status} — ${err.responseText || err.message})`,
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
