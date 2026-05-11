/**
 * `github_search` tool — semantic search over Sergeant code / issues / PRs.
 *
 * Server contract (`POST /api/internal/openclaw/github/search`):
 *   { query, scope?: "code"|"issues"|"prs", repo?, perPage?, page? }
 *   → { url, status, body }  // GitHub Search API response
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const GithubSearchParamsSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "GitHub Search query. `repo:owner/name` auto-prepended for 'code' scope.",
    ),
  scope: z
    .enum(["code", "issues", "prs"])
    .optional()
    .describe("What to search. Default 'code'."),
  repo: z
    .string()
    .optional()
    .describe("Repository 'owner/repo' (defaults to Sergeant repo)."),
  perPage: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe("Results per page. 1..30, default 10."),
  page: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("1-indexed page. 1..10."),
});

export type GithubSearchParams = z.infer<typeof GithubSearchParamsSchema>;

interface SearchResponse {
  url: string;
  status: number;
  body: unknown;
}

export interface GithubSearchToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Search Sergeant GitHub: code with file matches, issues by
keyword, або PRs by title/body. Корисно для "де у repo згадується
'budget gate'", "знайди issue про lockfile", "PRs з 'openclaw' у заголовку".`;

export function createGithubSearchTool(
  opts: GithubSearchToolOptions,
): ToolDefinition<GithubSearchParams> {
  return {
    name: "github_search",
    description: DESCRIPTION,
    parameters: GithubSearchParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<SearchResponse>(
          "/github/search",
          params,
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err, "github_search");
      }
    },
  };
}

function formatResult(response: SearchResponse): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `(github_search status=${response.status} url=${response.url})`,
      },
      { type: "structured", data: { body: response.body } },
    ],
  };
}

export function formatError(err: unknown, toolName: string): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(${toolName} error: HTTP ${err.status} — ${err.responseText || err.message})`,
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text",
        text: `(${toolName} unexpected error: ${err instanceof Error ? err.message : String(err)})`,
      },
    ],
  };
}
