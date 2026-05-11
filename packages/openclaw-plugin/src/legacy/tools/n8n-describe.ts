/**
 * `n8n_describe` tool — Phase 1 (PR-C1c) read-tool returning the node graph,
 * triggers, and tier/approval metadata for a single workflow. Proxies
 * `/api/internal/openclaw/n8n/describe`.
 *
 * AI-CONTEXT: agent calls this to answer "що робить цей workflow?" before
 * proposing to trigger / activate / deactivate it. Triggers are derived
 * server-side from node type names (`*Trigger`, `*Webhook`), so the response
 * is shape-stable regardless of n8n version.
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import type { N8nTier } from "./n8n-list.js";

export const N8nDescribeParamsSchema = z.object({
  workflowId: z
    .string()
    .min(1)
    .max(64)
    .describe("Opaque n8n workflow id, e.g. `OhDtiheODIp5nNLa`."),
});

export type N8nDescribeParams = z.infer<typeof N8nDescribeParamsSchema>;

interface N8nDescribeResponse {
  workflowId: string;
  name: string | null;
  active: boolean | null;
  tier: N8nTier | "unknown";
  category: string | null;
  approvalRequired: boolean | null;
  nodes: Array<{ name: string; type: string; disabled: boolean }>;
  triggers: string[];
  updatedAt: string | null;
  notConfigured?: boolean;
}

export interface N8nDescribeToolOptions {
  http: OpenClawHttpClient;
}

const TOOL_DESCRIPTION = `Describe a single n8n workflow — name, active flag,
tier (A/B/C/D), trigger types, and node count. Tier metadata comes from
\`ops/openclaw/n8n-allowlist.json\`; \`approvalRequired\` indicates whether
\`n8n_trigger\` will be approval-gated on this workflow (Tier C → true).`;

export function createN8nDescribeTool(
  opts: N8nDescribeToolOptions,
): ToolDefinition<N8nDescribeParams> {
  return {
    name: "n8n_describe",
    description: TOOL_DESCRIPTION,
    parameters: N8nDescribeParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<N8nDescribeResponse>(
          "/n8n/describe",
          { workflowId: params.workflowId },
        );
        return formatDescribeResult(response);
      } catch (err) {
        return formatDescribeError(err);
      }
    },
  };
}

function formatDescribeResult(response: N8nDescribeResponse): ToolResult {
  const lines: string[] = [];
  if (response.notConfigured) {
    lines.push(
      `(n8n not configured on this environment — showing allowlist metadata only)`,
    );
  }
  const tierLabel = response.tier === "unknown" ? "?" : `Tier ${response.tier}`;
  const activeLabel =
    response.active == null ? "active=?" : `active=${response.active}`;
  const approvalLabel =
    response.approvalRequired === true
      ? "approvalRequired=true"
      : response.approvalRequired === false
        ? "approvalRequired=false"
        : "approvalRequired=?";
  lines.push(
    `${response.workflowId} — ${response.name ?? "(no name)"} (${tierLabel}, ${activeLabel}, ${approvalLabel})`,
  );
  if (response.category) lines.push(`category: ${response.category}`);
  if (response.triggers.length > 0) {
    lines.push(`triggers: ${response.triggers.join(", ")}`);
  }
  lines.push(`nodes: ${response.nodes.length}`);

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: response },
    ],
  };
}

function formatDescribeError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `n8n_describe failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `n8n_describe failed: ${message}` }],
  };
}
