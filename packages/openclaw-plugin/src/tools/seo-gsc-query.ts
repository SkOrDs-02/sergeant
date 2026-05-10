/**
 * `seo_gsc_query` tool — Google Search Console performance query.
 *
 * Server contract (`POST /api/internal/openclaw/seo/gsc`):
 *   { days?, dimension?, siteUrl?, rowLimit? }
 *   → { notConfigured?, missing?, siteUrl?, startDate?, endDate?, dimension?, rows? }
 *
 * Graceful fallback: when env not configured, returns `notConfigured:true`,
 * tool reports the missing keys without throwing.
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const SeoGscQueryParamsSchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
  dimension: z.enum(["query", "page", "country", "device"]).optional(),
  siteUrl: z
    .string()
    .optional()
    .describe(
      "Site URL override (`sc-domain:example.com` or `https://example.com/`).",
    ),
  rowLimit: z.number().int().min(1).max(100).optional(),
});

export type SeoGscQueryParams = z.infer<typeof SeoGscQueryParamsSchema>;

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscResponse {
  notConfigured?: boolean;
  missing?: string[];
  siteUrl?: string;
  startDate?: string;
  endDate?: string;
  dimension?: string;
  rows?: GscRow[];
}

export interface SeoGscQueryToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Google Search Console — top queries / pages / countries для
sergeant.app за останні N днів. Returns clicks, impressions, CTR, avg position.
Якщо ключі не налаштовані — повертає 'not configured' замість 5xx.`;

export function createSeoGscQueryTool(
  opts: SeoGscQueryToolOptions,
): ToolDefinition<SeoGscQueryParams> {
  return {
    name: "seo_gsc_query",
    description: DESCRIPTION,
    parameters: SeoGscQueryParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<GscResponse>("/seo/gsc", params);
        if (response.notConfigured) {
          return {
            content: [
              {
                type: "text",
                text: `(seo_gsc_query not configured — missing env: ${(response.missing ?? []).join(", ")})`,
              },
              { type: "structured", data: { notConfigured: true } },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `(seo_gsc_query rows=${response.rows?.length ?? 0} window=${response.startDate}…${response.endDate})`,
            },
            { type: "structured", data: response },
          ],
        };
      } catch (err) {
        return formatError(err, "seo_gsc_query");
      }
    },
  };
}
