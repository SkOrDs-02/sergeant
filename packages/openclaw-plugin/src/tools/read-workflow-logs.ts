/**
 * `read_workflow_logs` tool — reads n8n workflow execution logs.
 *
 * Server contract (`POST /api/internal/openclaw/workflow`):
 *   { workflowId: string, since?: string, limit?: number }
 *   → { executions: Array<{ id, status, startedAt, finishedAt, ... }> }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const ReadWorkflowLogsParamsSchema = z.object({
  workflowId: z
    .string()
    .min(1)
    .describe(
      "n8n workflow ID (e.g. 'OhDtiheODIp5nNLa' for Growth Acquisition Snapshot).",
    ),
  since: z
    .string()
    .optional()
    .describe("ISO-8601 timestamp — return only executions after this time."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max executions to return (default 10)."),
});

export type ReadWorkflowLogsParams = z.infer<
  typeof ReadWorkflowLogsParamsSchema
>;

interface WorkflowExecution {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  [key: string]: unknown;
}

interface WorkflowResponse {
  executions: WorkflowExecution[];
}

export interface ReadWorkflowLogsToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Read execution logs for an n8n workflow. Use when checking
workflow health ("чи пройшов Growth Snapshot?", "які executions за
сьогодні?", "чому workflow failed?"). Returns recent executions with
status, timing, and error details if any.`;

export function createReadWorkflowLogsTool(
  opts: ReadWorkflowLogsToolOptions,
): ToolDefinition<ReadWorkflowLogsParams> {
  return {
    name: "read_workflow_logs",
    description: DESCRIPTION,
    parameters: ReadWorkflowLogsParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<WorkflowResponse>("/workflow", {
          workflowId: params.workflowId,
          since: params.since,
          limit: params.limit,
        });
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: WorkflowResponse): ToolResult {
  const execs = Array.isArray(response.executions) ? response.executions : [];
  if (execs.length === 0) {
    return {
      content: [
        { type: "text", text: "(no executions found for this workflow)" },
      ],
    };
  }

  const lines = execs.map(
    (ex, i) =>
      `${i + 1}. [${ex.status}] started ${(ex.startedAt ?? "").slice(0, 19)}${ex.finishedAt ? ` → finished ${ex.finishedAt.slice(0, 19)}` : " (running)"}`,
  );

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: { executions: execs } },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(workflow logs error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
