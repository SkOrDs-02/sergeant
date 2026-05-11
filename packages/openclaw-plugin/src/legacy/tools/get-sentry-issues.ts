/**
 * `get_sentry_issues` tool — retrieves top unresolved Sentry issues.
 *
 * Server contract (`POST /api/internal/openclaw/metrics/sentry`):
 *   { level?: "fatal"|"error"|"warning", limit?: number }
 *   → { issues: Array<{ id, title, level, count, lastSeen, ... }> }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const GetSentryIssuesParamsSchema = z.object({
  level: z
    .enum(["fatal", "error", "warning"])
    .optional()
    .describe("Minimum severity level to filter (default includes all)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max issues to return (default 5)."),
});

export type GetSentryIssuesParams = z.infer<typeof GetSentryIssuesParamsSchema>;

interface SentryIssue {
  id: string;
  title: string;
  level: string;
  count: number;
  lastSeen: string;
  [key: string]: unknown;
}

interface SentryResponse {
  issues: SentryIssue[];
}

export interface GetSentryIssuesToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Retrieve top unresolved Sentry issues. Use when the founder asks
about errors or stability ("які помилки в Sentry?", "є критичні баги?",
"що падає?"). Returns issues sorted by frequency.`;

export function createGetSentryIssuesTool(
  opts: GetSentryIssuesToolOptions,
): ToolDefinition<GetSentryIssuesParams> {
  return {
    name: "get_sentry_issues",
    description: DESCRIPTION,
    parameters: GetSentryIssuesParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<SentryResponse>(
          "/metrics/sentry",
          { level: params.level, limit: params.limit },
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: SentryResponse): ToolResult {
  const issues = Array.isArray(response.issues) ? response.issues : [];
  if (issues.length === 0) {
    return {
      content: [{ type: "text", text: "(no unresolved Sentry issues found)" }],
    };
  }

  const lines = issues.map(
    (iss, i) =>
      `${i + 1}. [${iss.level}] ${iss.title} (×${iss.count}, last: ${(iss.lastSeen ?? "").slice(0, 16)})`,
  );

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: { issues } },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(Sentry issues error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
