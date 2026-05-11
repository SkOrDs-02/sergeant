/**
 * `query_app_db` tool — executes allowlisted read-only SQL queries against
 * the Sergeant application database.
 *
 * Server contract (`POST /api/internal/openclaw/query`):
 *   { sql: string, params?: unknown[], limit?: number }
 *   → { rows: Record<string, unknown>[], rowCount: number, truncated: boolean }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const QueryAppDbParamsSchema = z.object({
  sql: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      "SQL SELECT query. Only allowlisted tables are accessible (server-side enforcement). Use parameterized $1, $2, etc. for dynamic values.",
    ),
  params: z
    .array(z.unknown())
    .optional()
    .describe("Positional parameters for the SQL query ($1, $2, etc.)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Max rows to return (default 100 server-side)."),
});

export type QueryAppDbParams = z.infer<typeof QueryAppDbParamsSchema>;

interface QueryResponse {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface QueryAppDbToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Execute a read-only SQL SELECT against the Sergeant application
database. Server enforces an allowlist of accessible tables — attempts to
query non-allowlisted tables will fail with 'allowlist_fail'. Use for ad-hoc
data questions ("скільки нових юзерів сьогодні?", "revenue за цей тиждень").
Returns rows as JSON array.`;

export function createQueryAppDbTool(
  opts: QueryAppDbToolOptions,
): ToolDefinition<QueryAppDbParams> {
  return {
    name: "query_app_db",
    description: DESCRIPTION,
    parameters: QueryAppDbParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<QueryResponse>("/query", {
          sql: params.sql,
          params: params.params,
          limit: params.limit,
        });
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: QueryResponse): ToolResult {
  const rows = Array.isArray(response.rows) ? response.rows : [];
  if (rows.length === 0) {
    return { content: [{ type: "text", text: "(query returned 0 rows)" }] };
  }

  const header = response.truncated
    ? `⚠️ Results truncated (showing ${rows.length} of ${response.rowCount} total rows).\n\n`
    : "";

  const text = `${header}${JSON.stringify(rows, null, 2)}`;
  return {
    content: [
      { type: "text", text },
      {
        type: "structured",
        data: {
          rows,
          rowCount: response.rowCount,
          truncated: response.truncated,
        },
      },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    if (err.status === 400) {
      return {
        content: [
          {
            type: "text",
            text: `(query rejected: ${err.responseText || err.message})`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `(query error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
