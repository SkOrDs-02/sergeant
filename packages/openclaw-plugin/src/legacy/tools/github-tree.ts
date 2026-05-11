/**
 * `github_tree` tool — list files/dirs у repo at a ref.
 *
 * Server contract (`POST /api/internal/openclaw/github/tree`):
 *   { ref?, repo?, recursive? } → { url, status, body }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const GithubTreeParamsSchema = z.object({
  ref: z
    .string()
    .optional()
    .describe("Branch/tag/SHA. Default 'main' (or env-configured base)."),
  repo: z
    .string()
    .optional()
    .describe("Repository 'owner/repo' (defaults to Sergeant repo)."),
  recursive: z
    .boolean()
    .optional()
    .describe(
      "If true, returns the full recursive tree. Default false (top-level only).",
    ),
});

export type GithubTreeParams = z.infer<typeof GithubTreeParamsSchema>;

interface TreeResponse {
  url: string;
  status: number;
  body: unknown;
}

export interface GithubTreeToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `List Sergeant repo files/dirs at a git ref. Use when LLM
needs to map repo structure ("що в \`apps/server/src/modules\`?") або знайти
кандидати для подальшого \`read_github\` / \`github_diff\`.`;

export function createGithubTreeTool(
  opts: GithubTreeToolOptions,
): ToolDefinition<GithubTreeParams> {
  return {
    name: "github_tree",
    description: DESCRIPTION,
    parameters: GithubTreeParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<TreeResponse>(
          "/github/tree",
          params,
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err, "github_tree");
      }
    },
  };
}

function formatResult(response: TreeResponse): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `(github_tree status=${response.status} url=${response.url})`,
      },
      { type: "structured", data: { body: response.body } },
    ],
  };
}
