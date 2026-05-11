/**
 * `get_posthog_stats` tool — retrieves product analytics from PostHog:
 * signups, MAU, key events.
 *
 * Server contract (`POST /api/internal/openclaw/metrics/posthog`):
 *   { days?: number }
 *   → { signups, mau, events, ... }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const GetPostHogStatsParamsSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(180)
    .optional()
    .describe("Lookback window in days (default 1 = today)."),
});

export type GetPostHogStatsParams = z.infer<typeof GetPostHogStatsParamsSchema>;

export interface GetPostHogStatsToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Retrieve PostHog product analytics: signups, MAU, and key event
counts. Use when the founder asks about user metrics ("скільки нових
юзерів?", "який MAU?", "активність за тиждень?").`;

export function createGetPostHogStatsTool(
  opts: GetPostHogStatsToolOptions,
): ToolDefinition<GetPostHogStatsParams> {
  return {
    name: "get_posthog_stats",
    description: DESCRIPTION,
    parameters: GetPostHogStatsParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<Record<string, unknown>>(
          "/metrics/posthog",
          { days: params.days },
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: Record<string, unknown>): ToolResult {
  const text = JSON.stringify(response, null, 2);
  return {
    content: [
      { type: "text", text },
      { type: "structured", data: response },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(PostHog stats error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
