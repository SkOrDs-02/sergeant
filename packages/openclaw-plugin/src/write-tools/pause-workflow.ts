/**
 * `pause_workflow` write-tool (PR-D Phase 4).
 *
 * Pauses an n8n workflow via server's
 * `/api/internal/openclaw/write/pause-workflow` endpoint.
 */

import { z } from "zod";
import {
  createWriteTool,
  type WriteToolFactoryOptions,
  type WriteToolParts,
} from "./write-tool-factory.js";

export const PauseWorkflowParamsSchema = z.object({
  workflowId: z.string().min(1).max(100).describe("n8n workflow ID to pause"),
  reason: z
    .string()
    .max(1000)
    .optional()
    .describe("Optional reason for pausing (logged in audit)"),
});

export type PauseWorkflowParams = z.infer<typeof PauseWorkflowParamsSchema>;

interface PauseWorkflowResponse {
  status: "paused" | "already_inactive" | "not_found" | "not_configured";
  workflowId: string;
  name?: string;
}

const TOOL_NAME = "pause_workflow";

export function createPauseWorkflowTool(
  opts: WriteToolFactoryOptions,
): WriteToolParts<PauseWorkflowParams> {
  return createWriteTool<PauseWorkflowParams, PauseWorkflowResponse>(
    {
      name: TOOL_NAME,
      description: `Pause (deactivate) an n8n workflow. WRITE TOOL — gated
behind founder approval. Use for: temporarily stopping a workflow that's
misbehaving or no longer needed. Reversible — founder can reactivate in n8n.`,
      parameters: PauseWorkflowParamsSchema,
      endpoint: "/write/pause-workflow",
      buildBody: (params) => ({
        workflowId: params.workflowId,
        reason: params.reason,
      }),
      formatSuccess: (response) => {
        if (response.status === "not_configured") {
          return {
            content: [
              {
                type: "text",
                text: "pause_workflow: n8n not configured on server.",
              },
            ],
          };
        }
        if (response.status === "not_found") {
          return {
            content: [
              {
                type: "text",
                text: `pause_workflow: workflow ${response.workflowId} not found.`,
              },
            ],
          };
        }
        const label = response.name
          ? `${response.name} (${response.workflowId})`
          : response.workflowId;
        const verb =
          response.status === "already_inactive"
            ? "was already inactive"
            : "paused";
        return {
          content: [
            {
              type: "text",
              text: `✅ workflow ${label} ${verb}`,
            },
            {
              type: "structured",
              data: {
                status: response.status,
                workflowId: response.workflowId,
                name: response.name,
              },
            },
          ],
        };
      },
    },
    opts,
  );
}
