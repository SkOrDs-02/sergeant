/**
 * `get_stripe_metrics` tool — retrieves revenue, failed payments, and
 * refund metrics from Stripe via the server proxy.
 *
 * Server contract (`POST /api/internal/openclaw/metrics/stripe`):
 *   { days?: number }
 *   → { revenue: number, failedPayments: number, refunds: number, ... }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const GetStripeMetricsParamsSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("Number of days to look back (default 1 = today)."),
});

export type GetStripeMetricsParams = z.infer<
  typeof GetStripeMetricsParamsSchema
>;

export interface GetStripeMetricsToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Retrieve Stripe payment metrics: revenue, failed payments, refunds.
Use when the founder asks about finances ("яка revenue сьогодні?", "чи
були failed payments?", "скільки рефандів за тиждень?").`;

export function createGetStripeMetricsTool(
  opts: GetStripeMetricsToolOptions,
): ToolDefinition<GetStripeMetricsParams> {
  return {
    name: "get_stripe_metrics",
    description: DESCRIPTION,
    parameters: GetStripeMetricsParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<Record<string, unknown>>(
          "/metrics/stripe",
          { days: params.days },
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: Record<string, unknown>): ToolResult {
  const text = JSON.stringify(response, null, 2);
  return {
    content: [
      { type: "text", text },
      { type: "structured", data: response },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(Stripe metrics error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
