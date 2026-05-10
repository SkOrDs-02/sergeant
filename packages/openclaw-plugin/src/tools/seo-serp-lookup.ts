/**
 * `seo_serp_lookup` tool — SERP snapshot via SerpAPI.
 *
 * Server contract (`POST /api/internal/openclaw/seo/serp`):
 *   { query, hl?, gl?, num? }
 *   → { notConfigured?, missing?, query?, hl?, gl?, results? }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const SeoSerpLookupParamsSchema = z.object({
  query: z.string().min(1).max(200),
  hl: z
    .string()
    .min(2)
    .max(10)
    .optional()
    .describe("UI language code (e.g. 'uk')."),
  gl: z
    .string()
    .min(2)
    .max(10)
    .optional()
    .describe("Geographic location code (e.g. 'ua')."),
  num: z.number().int().min(1).max(20).optional(),
});

export type SeoSerpLookupParams = z.infer<typeof SeoSerpLookupParamsSchema>;

interface SerpRow {
  position: number;
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerpResponse {
  notConfigured?: boolean;
  missing?: string[];
  query?: string;
  hl?: string;
  gl?: string;
  results?: SerpRow[];
}

export interface SeoSerpLookupToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `SERP snapshot for a query (Google org results 1..20).
Корисно для перевірки видимості та конкуренції. Якщо SerpAPI key не
налаштовано — повертає 'not configured'.`;

export function createSeoSerpLookupTool(
  opts: SeoSerpLookupToolOptions,
): ToolDefinition<SeoSerpLookupParams> {
  return {
    name: "seo_serp_lookup",
    description: DESCRIPTION,
    parameters: SeoSerpLookupParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<SerpResponse>(
          "/seo/serp",
          params,
        );
        if (response.notConfigured) {
          return {
            content: [
              {
                type: "text",
                text: `(seo_serp_lookup not configured — missing env: ${(response.missing ?? []).join(", ")})`,
              },
              { type: "structured", data: { notConfigured: true } },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `(seo_serp_lookup q="${response.query}" results=${response.results?.length ?? 0})`,
            },
            { type: "structured", data: response },
          ],
        };
      } catch (err) {
        return formatError(err, "seo_serp_lookup");
      }
    },
  };
}
