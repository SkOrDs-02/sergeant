/**
 * `get_server_stats` tool — retrieves health/status info from the Sergeant
 * backend server.
 *
 * Server contract (`POST /api/internal/openclaw/metrics/server`):
 *   {} (empty body)
 *   → { uptime, memory, cpu, connections, latency, ... }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const GetServerStatsParamsSchema = z.object({});

export type GetServerStatsParams = z.infer<typeof GetServerStatsParamsSchema>;

export interface GetServerStatsToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Retrieve Sergeant backend server stats: uptime, memory usage, CPU,
active DB connections, request latency. Use when checking server health
("як сервер?", "є проблеми з performance?", "memory leak?").`;

export function createGetServerStatsTool(
  opts: GetServerStatsToolOptions,
): ToolDefinition<GetServerStatsParams> {
  return {
    name: "get_server_stats",
    description: DESCRIPTION,
    parameters: GetServerStatsParamsSchema,
    execute: async (_invocationId) => {
      try {
        const response = await opts.http.post<Record<string, unknown>>(
          "/metrics/server",
          {},
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
          text: `(server stats error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
