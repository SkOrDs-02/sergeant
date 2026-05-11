/**
 * `commit_to_strategy_doc` write-tool (PR-D Phase 4).
 *
 * Commits a file to the strategy-docs repo via server's
 * `/api/internal/openclaw/write/strategy-doc` endpoint.
 */

import { z } from "zod";
import {
  createWriteTool,
  type WriteToolFactoryOptions,
  type WriteToolParts,
} from "./write-tool-factory.js";

export const CommitToStrategyDocParamsSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(500)
    .describe("File path in the strategy-docs repo (e.g. 'notes/retro.md')"),
  content: z
    .string()
    .min(1)
    .max(80_000)
    .describe("Full file content to commit"),
  message: z.string().min(1).max(200).describe("Git commit message"),
  repoSlug: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "repoSlug must be 'owner/repo' format")
    .optional()
    .describe("Target repo (default: strategy-docs repo)"),
});

export type CommitToStrategyDocParams = z.infer<
  typeof CommitToStrategyDocParamsSchema
>;

interface CommitToStrategyDocResponse {
  sha: string;
  url: string;
  path: string;
  status?: "not_configured";
}

const TOOL_NAME = "commit_to_strategy_doc";

export function createCommitToStrategyDocTool(
  opts: WriteToolFactoryOptions,
): WriteToolParts<CommitToStrategyDocParams> {
  return createWriteTool<
    CommitToStrategyDocParams,
    CommitToStrategyDocResponse
  >(
    {
      name: TOOL_NAME,
      description: `Commit a file to the strategy-docs repo. WRITE TOOL — gated
behind founder approval. Use for: persisting meeting notes, strategy docs,
retro summaries that the founder dictates or approves.`,
      parameters: CommitToStrategyDocParamsSchema,
      endpoint: "/write/strategy-doc",
      buildBody: (params) => ({
        path: params.path,
        content: params.content,
        message: params.message,
        repo: params.repoSlug,
      }),
      formatSuccess: (response) => {
        if (response.status === "not_configured") {
          return {
            content: [
              {
                type: "text",
                text: "commit_to_strategy_doc: GitHub not configured on server.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `✅ committed ${response.path} (${response.sha.slice(0, 7)})\n${response.url}`,
            },
            {
              type: "structured",
              data: {
                sha: response.sha,
                url: response.url,
                path: response.path,
              },
            },
          ],
        };
      },
    },
    opts,
  );
}
