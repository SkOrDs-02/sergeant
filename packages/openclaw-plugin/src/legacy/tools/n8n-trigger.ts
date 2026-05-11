/**
 * `n8n_trigger` tool — Phase 1 (PR-C1c) tier-aware delegation tool. Proxies
 * `/api/internal/openclaw/n8n/trigger`.
 *
 * Tier policy (enforced server-side via `ops/openclaw/n8n-allowlist.json`):
 *   - **A** — auto. Snapshot-flows; no approval. Server fires immediately.
 *   - **B** — refused. Digest-flows post to Telegram; agent must answer
 *             inline instead of spamming. Server returns
 *             `allowlist_fail` (HTTP 400).
 *   - **C** — approval-gated. Server returns `approvalRequired: true`
 *             alongside the result; the orchestrator (PR-C1d shortcut/cheap
 *             router) enforces the gate via `tool_call_pre` hook.
 *   - **D** — refused. Webhook-driven externally.
 *   - **unknown** — refused (fail-closed).
 *
 * Why no `tool_call_pre` hook here in C1c: the gate logic lives in the
 * router shipped by PR-C1d (`shortcut-router.ts` + `cheap-router.ts`)
 * so all gated tools share the same approval keyboard, audit shape, and
 * Variant B custom-hook plumbing PoC validated. This tool intentionally
 * surfaces `approvalRequired` in the structured response so the router has
 * everything it needs without re-fetching tier metadata.
 *
 * Manifest marks this tool `gated: true, approvalDefault: 'B'` so the
 * persona allowlist (Phase 2 PR-C2) opts personas in explicitly.
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import type { N8nTier } from "./n8n-list.js";

export const N8nTriggerParamsSchema = z.object({
  workflowId: z
    .string()
    .min(1)
    .max(64)
    .describe("Opaque n8n workflow id (Tier A or Tier C only)."),
});

export type N8nTriggerParams = z.infer<typeof N8nTriggerParamsSchema>;

type N8nTriggerStatus = "triggered" | "not_configured" | "error";

interface N8nTriggerResponse {
  status: N8nTriggerStatus;
  workflowId: string;
  tier: N8nTier | "unknown";
  approvalRequired: boolean;
  executionId?: string;
  note?: string;
}

interface N8nAllowlistFailureBody {
  error: "allowlist_fail";
  op: "trigger";
  workflowId: string;
  tier: N8nTier | "unknown";
  message: string;
}

export interface N8nTriggerToolOptions {
  http: OpenClawHttpClient;
}

const TOOL_DESCRIPTION = `Trigger an n8n workflow on-demand. Tier A workflows
fire immediately (snapshot refresh). Tier C workflows return
\`approvalRequired: true\`; the router prompts the founder before firing.
Tier B (digest) and Tier D (webhook-driven) are refused server-side with
\`allowlist_fail\`. Always pair with \`n8n_describe\` if unsure about tier.`;

export function createN8nTriggerTool(
  opts: N8nTriggerToolOptions,
): ToolDefinition<N8nTriggerParams> {
  return {
    name: "n8n_trigger",
    description: TOOL_DESCRIPTION,
    parameters: N8nTriggerParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<N8nTriggerResponse>(
          "/n8n/trigger",
          { workflowId: params.workflowId },
        );
        return formatTriggerResult(response);
      } catch (err) {
        return formatTriggerError(err);
      }
    },
  };
}

function formatTriggerResult(response: N8nTriggerResponse): ToolResult {
  const tierLabel = response.tier === "unknown" ? "?" : `Tier ${response.tier}`;
  const lines: string[] = [];
  switch (response.status) {
    case "triggered":
      lines.push(
        `n8n_trigger: workflow ${response.workflowId} triggered (${tierLabel})${
          response.executionId ? `, execution ${response.executionId}` : ""
        }${response.approvalRequired ? " — approval was required" : ""}`,
      );
      break;
    case "not_configured":
      lines.push(
        `n8n_trigger: skipped (${response.note ?? "n8n not configured"})`,
      );
      break;
    case "error":
      lines.push(
        `n8n_trigger: error for ${response.workflowId} (${response.note ?? "unknown"})`,
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

function formatTriggerError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    const body = parseAllowlistFailureBody(err.responseText);
    if (body) {
      return {
        content: [
          {
            type: "text",
            text: `n8n_trigger refused (Tier ${body.tier === "unknown" ? "?" : body.tier}): ${body.message}`,
          },
          { type: "structured", data: body },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `n8n_trigger failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `n8n_trigger failed: ${message}` }],
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
