/**
 * `github_diff` tool — compare two refs (`base...head`) у repo.
 *
 * Server contract (`POST /api/internal/openclaw/github/diff`):
 *   { base, head, repo? } → { url, status, body }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const GithubDiffParamsSchema = z.object({
  base: z
    .string()
    .min(1)
    .max(200)
    .describe("Base ref для compare (e.g. 'main')."),
  head: z
    .string()
    .min(1)
    .max(200)
    .describe("Цільова ref (branch/SHA) для compare."),
  repo: z
    .string()
    .optional()
    .describe("Repository 'owner/repo' (defaults to Sergeant repo)."),
});

export type GithubDiffParams = z.infer<typeof GithubDiffParamsSchema>;

interface DiffResponse {
  url: string;
  status: number;
  body: unknown;
}

export interface GithubDiffToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Compare two git refs (base→head) у Sergeant repo. Use to
inspect PR diff, regression suspect ("що змінилось між main та feature/x?"),
або release delta. Returns the GitHub compare payload (files, commits, stats).`;

export function createGithubDiffTool(
  opts: GithubDiffToolOptions,
): ToolDefinition<GithubDiffParams> {
  return {
    name: "github_diff",
    description: DESCRIPTION,
    parameters: GithubDiffParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<DiffResponse>(
          "/github/diff",
          params,
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err, "github_diff");
      }
    },
  };
}

function formatResult(response: DiffResponse): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `(github_diff status=${response.status} url=${response.url})`,
      },
      { type: "structured", data: { body: response.body } },
    ],
  };
}
