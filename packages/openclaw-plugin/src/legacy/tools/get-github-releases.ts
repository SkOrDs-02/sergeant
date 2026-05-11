/**
 * `get_github_releases` tool — retrieves recent GitHub releases for the
 * Sergeant repo (or a specified repo).
 *
 * Server contract (`POST /api/internal/openclaw/github/releases`):
 *   { limit?: number, repo?: string }
 *   → { releases: Array<{ tag, name, publishedAt, body, ... }> }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const GetGithubReleasesParamsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Number of releases to return (default 5)."),
  repo: z
    .string()
    .optional()
    .describe("Repository in 'owner/repo' format. Defaults to Sergeant."),
});

export type GetGithubReleasesParams = z.infer<
  typeof GetGithubReleasesParamsSchema
>;

interface GithubRelease {
  tag: string;
  name: string;
  publishedAt: string;
  body: string;
  [key: string]: unknown;
}

interface ReleasesResponse {
  releases: GithubRelease[];
}

export interface GetGithubReleasesToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Retrieve recent GitHub releases. Use when the founder asks about
versions, changelogs, or deployment history ("які останні релізи?",
"що в останньому release?", "коли був останній деплой?").`;

export function createGetGithubReleasesTool(
  opts: GetGithubReleasesToolOptions,
): ToolDefinition<GetGithubReleasesParams> {
  return {
    name: "get_github_releases",
    description: DESCRIPTION,
    parameters: GetGithubReleasesParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<ReleasesResponse>(
          "/github/releases",
          { limit: params.limit, repo: params.repo },
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: ReleasesResponse): ToolResult {
  const releases = Array.isArray(response.releases) ? response.releases : [];
  if (releases.length === 0) {
    return { content: [{ type: "text", text: "(no releases found)" }] };
  }

  const lines = releases.map(
    (r, i) =>
      `${i + 1}. ${r.tag} — ${r.name || "(untitled)"} (${(r.publishedAt ?? "").slice(0, 10)})`,
  );

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: { releases } },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(GitHub releases error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
