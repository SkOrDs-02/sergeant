/**
 * `n8n_activate` tool — Phase 1 (PR-C1c) approval-gated write-tool for
 * toggling a workflow's `active` flag. Proxies
 * `/api/internal/openclaw/n8n/activate`.
 *
 * Approval semantics: always gated. Even flipping a Tier A snapshot from
 * `active=true` to `active=false` requires founder sign-off — otherwise the
 * agent could silently kill the morning briefing pipeline. Tier B / Tier D
 * / unknown workflows are refused server-side with `allowlist_fail`.
 *
 * Locked decision #3 forbids workflow DELETE; this tool is the strongest
 * lever the agent has, and it can be reversed by calling `n8n_activate`
 * again with the opposite flag.
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import type { N8nTier } from "./n8n-list.js";

export const N8nActivateParamsSchema = z.object({
  workflowId: z
    .string()
    .min(1)
    .max(64)
    .describe("Opaque n8n workflow id (Tier A or Tier C only)."),
  active: z
    .boolean()
    .describe("New active flag. `true` activates, `false` deactivates."),
});

export type N8nActivateParams = z.infer<typeof N8nActivateParamsSchema>;

type N8nActivateStatus =
  | "activated"
  | "deactivated"
  | "not_configured"
  | "error";

interface N8nActivateResponse {
  status: N8nActivateStatus;
  workflowId: string;
  tier: N8nTier | "unknown";
  approvalRequired: boolean;
  note?: string;
}

interface N8nAllowlistFailureBody {
  error: "allowlist_fail";
  op: "activate";
  workflowId: string;
  tier: N8nTier | "unknown";
  message: string;
}

export interface N8nActivateToolOptions {
  http: OpenClawHttpClient;
}

const TOOL_DESCRIPTION = `Activate or deactivate an n8n workflow. Always
approval-gated — even Tier A snapshots require founder sign-off because
flipping the active flag has multi-day blast radius. Tier B / Tier D /
unknown workflows are refused with \`allowlist_fail\`. Use when an alert
trail shows a workflow misbehaving and the founder asked to pause it.`;

export function createN8nActivateTool(
  opts: N8nActivateToolOptions,
): ToolDefinition<N8nActivateParams> {
  return {
    name: "n8n_activate",
    description: TOOL_DESCRIPTION,
    parameters: N8nActivateParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<N8nActivateResponse>(
          "/n8n/activate",
          { workflowId: params.workflowId, active: params.active },
        );
        return formatActivateResult(response);
      } catch (err) {
        return formatActivateError(err);
      }
    },
  };
}

function formatActivateResult(response: N8nActivateResponse): ToolResult {
  const tierLabel = response.tier === "unknown" ? "?" : `Tier ${response.tier}`;
  const lines: string[] = [];
  switch (response.status) {
    case "activated":
      lines.push(
        `n8n_activate: workflow ${response.workflowId} activated (${tierLabel})`,
      );
      break;
    case "deactivated":
      lines.push(
        `n8n_activate: workflow ${response.workflowId} deactivated (${tierLabel})`,
      );
      break;
    case "not_configured":
      lines.push(
        `n8n_activate: skipped (${response.note ?? "n8n not configured"})`,
      );
      break;
    case "error":
      lines.push(
        `n8n_activate: error for ${response.workflowId} (${response.note ?? "unknown"})`,
      );
      break;
  }
  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: response },
    ],
  };
}

function formatActivateError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    const body = parseAllowlistFailureBody(err.responseText);
    if (body) {
      return {
        content: [
          {
            type: "text",
            text: `n8n_activate refused (Tier ${body.tier === "unknown" ? "?" : body.tier}): ${body.message}`,
          },
          { type: "structured", data: body },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `n8n_activate failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `n8n_activate failed: ${message}` }],
  };
}

function parseAllowlistFailureBody(
  text: string,
): N8nAllowlistFailureBody | null {
  try {
    const parsed = JSON.parse(text) as Partial<N8nAllowlistFailureBody>;
    if (
      parsed?.error === "allowlist_fail" &&
      typeof parsed.workflowId === "string"
    ) {
      return parsed as N8nAllowlistFailureBody;
    }
  } catch {
    // Not JSON — fall through.
  }
  return null;
}
