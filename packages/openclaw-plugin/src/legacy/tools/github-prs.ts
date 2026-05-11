/**
 * `github_prs` tool — list PRs з фільтрами (state, author, head/base, sort).
 *
 * Server contract (`POST /api/internal/openclaw/github/prs`):
 *   { repo?, state?, author?, head?, base?, sort?, direction?, perPage?, page? }
 *   → { url, status, body }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const GithubPrsParamsSchema = z.object({
  repo: z.string().optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
  author: z.string().optional(),
  head: z.string().optional(),
  base: z.string().optional(),
  sort: z.enum(["created", "updated", "popularity", "long-running"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  perPage: z.number().int().min(1).max(30).optional(),
  page: z.number().int().min(1).max(10).optional(),
});

export type GithubPrsParams = z.infer<typeof GithubPrsParamsSchema>;

interface PrsResponse {
  url: string;
  status: number;
  body: unknown;
}

export interface GithubPrsToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `List Sergeant PRs з фільтрами. Use for "відкриті PRs",
"PRs автора @user", "PRs у develop". Default — open PRs sorted by updated desc.`;

export function createGithubPrsTool(
  opts: GithubPrsToolOptions,
): ToolDefinition<GithubPrsParams> {
  return {
    name: "github_prs",
    description: DESCRIPTION,
    parameters: GithubPrsParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<PrsResponse>(
          "/github/prs",
          params,
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err, "github_prs");
      }
    },
  };
}

function formatResult(response: PrsResponse): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `(github_prs status=${response.status} url=${response.url})`,
      },
      { type: "structured", data: { body: response.body } },
    ],
  };
}
