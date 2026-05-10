/**
 * `n8n_list` tool — Phase 1 (PR-C1c) read-tool surface for n8n workflow
 * inventory. Proxies `/api/internal/openclaw/n8n/list`.
 *
 * AI-CONTEXT: agent uses this to answer questions like "які acquisition
 * snapshot workflows активні?" or to enumerate Tier A workflows before
 * calling `refresh_business_snapshot`. Tier comes from
 * `ops/openclaw/n8n-allowlist.json`; workflows missing from the allowlist
 * surface as `tier: 'unknown'` and are gated server-side from any write
 * operation (Tier B/D + unknown are not triggerable).
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const N8N_TIER_VALUES = ["A", "B", "C", "D"] as const;
export type N8nTier = (typeof N8N_TIER_VALUES)[number];

export const N8nListParamsSchema = z.object({
  tiers: z
    .array(z.enum(N8N_TIER_VALUES))
    .max(4)
    .optional()
    .describe(
      "Optional tier filter. A=auto-refresh, B=digest-only, C=approval-gated, D=webhook-driven. Omit to return all known workflows.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(250)
    .optional()
    .describe("Page-size hint forwarded to n8n (default 100, max 250)."),
});

export type N8nListParams = z.infer<typeof N8nListParamsSchema>;

interface N8nListRow {
  id: string;
  name: string;
  active: boolean;
  tier: N8nTier | "unknown";
  category: string | null;
  updatedAt: string | null;
}

interface N8nListResponse {
  workflows: N8nListRow[];
  notConfigured?: boolean;
}

export interface N8nListToolOptions {
  http: OpenClawHttpClient;
}

const TOOL_DESCRIPTION = `List n8n workflows known to Sergeant, augmented with
the 4-tier classification from \`ops/openclaw/n8n-allowlist.json\`. Filter by
tier with \`tiers: ['A']\` to see snapshot-flows, \`['C']\` to see
approval-gated writes, etc. Tier B/D workflows are listed but cannot be
triggered. Use this before \`n8n_describe\` / \`refresh_business_snapshot\`.`;

export function createN8nListTool(
  opts: N8nListToolOptions,
): ToolDefinition<N8nListParams> {
  return {
    name: "n8n_list",
    description: TOOL_DESCRIPTION,
    parameters: N8nListParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<N8nListResponse>("/n8n/list", {
          ...(params.tiers ? { tiers: params.tiers } : {}),
          ...(params.limit != null ? { limit: params.limit } : {}),
        });
        return formatN8nListResult(response);
      } catch (err) {
        return formatN8nListError(err);
      }
    },
  };
}

function formatN8nListResult(response: N8nListResponse): ToolResult {
  const workflows = Array.isArray(response.workflows) ? response.workflows : [];
  if (response.notConfigured) {
    return {
      content: [
        {
          type: "text",
          text: "n8n is not configured on this environment (N8N_API_URL / N8N_API_KEY missing).",
        },
      ],
    };
  }
  if (workflows.length === 0) {
    return {
      content: [{ type: "text", text: "(no workflows matched this filter)" }],
    };
  }

  const lines = workflows.map((w) => {
    const tierLabel = w.tier === "unknown" ? "?" : w.tier;
    const activeLabel = w.active ? "ON " : "OFF";
    const category = w.category ? ` [${w.category}]` : "";
    return `[${tierLabel}] ${activeLabel} ${w.id} — ${w.name}${category}`;
  });

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "structured", data: { workflows } },
    ],
  };
}

function formatN8nListError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `n8n_list failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return { content: [{ type: "text", text: `n8n_list failed: ${message}` }] };
}
