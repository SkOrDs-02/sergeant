/**
 * `read_github` tool — reads files, issues, or PRs from the Sergeant GitHub
 * repository via the server's proxy endpoint.
 *
 * Server contract (`POST /api/internal/openclaw/github`):
 *   { mode: "file"|"issue"|"pr", repo?: string, filePath?: string, ref?: string, number?: number }
 *   → { content: string, metadata?: Record<string, unknown> }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const ReadGithubParamsSchema = z.object({
  mode: z
    .enum(["file", "issue", "pr"])
    .describe(
      "What to read: 'file' for repo file content, 'issue' for an issue, 'pr' for a pull request.",
    ),
  repo: z
    .string()
    .optional()
    .describe(
      "Repository in 'owner/repo' format. Defaults to the Sergeant repo.",
    ),
  filePath: z
    .string()
    .optional()
    .describe("File path (for mode='file'). Relative to repo root."),
  ref: z
    .string()
    .optional()
    .describe("Git ref (branch/tag/sha) for mode='file'. Defaults to main."),
  number: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Issue or PR number (for mode='issue' or mode='pr')."),
});

export type ReadGithubParams = z.infer<typeof ReadGithubParamsSchema>;

interface GithubResponse {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ReadGithubToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Read a file, issue, or pull request from GitHub. Use for code
context ("покажи src/modules/openclaw/budget.ts"), issue details ("що в
issue #420?"), or PR info ("покажи PR #2385"). Defaults to the Sergeant
repository.`;

export function createReadGithubTool(
  opts: ReadGithubToolOptions,
): ToolDefinition<ReadGithubParams> {
  return {
    name: "read_github",
    description: DESCRIPTION,
    parameters: ReadGithubParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<GithubResponse>("/github", {
          mode: params.mode,
          repo: params.repo,
          filePath: params.filePath,
          ref: params.ref,
          number: params.number,
        });
        return formatResult(response, params.mode);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: GithubResponse, mode: string): ToolResult {
  if (!response.content) {
    return {
      content: [{ type: "text", text: `(${mode} not found or empty)` }],
    };
  }
  return {
    content: [
      { type: "text", text: response.content },
      ...(response.metadata
        ? [{ type: "structured" as const, data: response.metadata }]
        : []),
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
            text: `(not found: ${err.responseText || err.message})`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `(GitHub read error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
