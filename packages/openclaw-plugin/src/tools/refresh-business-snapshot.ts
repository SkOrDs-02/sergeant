/**
 * `refresh_business_snapshot` meta-tool — Phase 1 (PR-C1c).
 *
 * Fires every Tier A workflow in parallel via `n8n_trigger`, then returns a
 * roll-up of statuses. The actual snapshot rows land in our DB
 * asynchronously once n8n executes the workflows; this tool only guarantees
 * "trigger requests acknowledged", so callers should re-read the relevant
 * tables (`growth.*`, etc.) a few seconds after this returns.
 *
 * Server contract: POST /api/internal/openclaw/snapshot/refresh
 *   { workflowIds?: string[] }
 *   →
 *   {
 *     triggered: number,
 *     failed: number,
 *     notConfigured: boolean,
 *     durationMs: number,
 *     results: Array<{
 *       workflowId: string,
 *       name: string,
 *       status: 'triggered' | 'not_configured' | 'error' | 'skipped',
 *       note?: string,
 *       executionId?: string,
 *     }>
 *   }
 *
 * AI-CONTEXT: agent calls this in the morning ritual or when the founder
 * asks "оновити метрики?" / "що по acquisition?". No approval gate — Tier
 * A is auto by definition. Workflow set is loaded from
 * `ops/openclaw/n8n-allowlist.json` server-side so a tier reclassification
 * is a 1-line config change without a plugin release.
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const RefreshBusinessSnapshotParamsSchema = z.object({
  workflowIds: z
    .array(z.string().min(1).max(64))
    .max(50)
    .optional()
    .describe(
      "Optional subset of Tier A workflow ids to fire. Omit to fire every Tier A workflow from the allowlist.",
    ),
});

export type RefreshBusinessSnapshotParams = z.infer<
  typeof RefreshBusinessSnapshotParamsSchema
>;

interface RefreshResult {
  workflowId: string;
  name: string;
  status: "triggered" | "not_configured" | "error" | "skipped";
  note?: string;
  executionId?: string;
}

interface RefreshResponse {
  triggered: number;
  failed: number;
  notConfigured: boolean;
  durationMs: number;
  results: RefreshResult[];
}

export interface RefreshBusinessSnapshotToolOptions {
  http: OpenClawHttpClient;
}

const TOOL_DESCRIPTION = `Refresh business snapshots — fires every Tier A
n8n workflow in parallel (growth acquisition, growth funnel, heartbeat,
etc) and waits for each /run call to be acknowledged. Use during morning
ritual or when the founder asks "оновити метрики". No approval needed —
Tier A workflows write to internal DB; data lands a few seconds after
this returns. Pass \`workflowIds\` to fire a subset only.`;

export function createRefreshBusinessSnapshotTool(
  opts: RefreshBusinessSnapshotToolOptions,
): ToolDefinition<RefreshBusinessSnapshotParams> {
  return {
    name: "refresh_business_snapshot",
    description: TOOL_DESCRIPTION,
    parameters: RefreshBusinessSnapshotParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<RefreshResponse>(
          "/snapshot/refresh",
          {
            ...(params.workflowIds ? { workflowIds: params.workflowIds } : {}),
          },
        );
        return formatRefreshResult(response);
      } catch (err) {
        return formatRefreshError(err);
      }
    },
  };
}

function formatRefreshResult(response: RefreshResponse): ToolResult {
  const lines: string[] = [];
  if (response.notConfigured) {
    lines.push(
      "refresh_business_snapshot: n8n not configured on this environment — nothing fired.",
    );
  } else {
    lines.push(
      `refresh_business_snapshot: ${response.triggered} triggered, ${response.failed} failed (${response.durationMs}ms)`,
    );
  }
  for (const r of response.results) {
    const marker =
      r.status === "triggered"
        ? "✓"
        : r.status === "not_configured"
          ? "•"
          : r.status === "skipped"
            ? "—"
            : "✗";
    lines.push(
      `  ${marker} ${r.workflowId} — ${r.name} (${r.status}${r.note ? `: ${r.note}` : ""})`,
    );
  }
  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: response },
    ],
  };
}

function formatRefreshError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `refresh_business_snapshot failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [
      { type: "text", text: `refresh_business_snapshot failed: ${message}` },
    ],
  };
}
