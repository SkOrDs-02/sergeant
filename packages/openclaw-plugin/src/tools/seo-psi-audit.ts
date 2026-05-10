/**
 * `seo_psi_audit` tool — PageSpeed Insights Lighthouse audit.
 *
 * Server contract (`POST /api/internal/openclaw/seo/lighthouse`):
 *   { url, strategy? } → { notConfigured?, missing?, url?, strategy?, performance?, accessibility?, bestPractices?, seo?, fetchedAt? }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const SeoPsiAuditParamsSchema = z.object({
  url: z
    .string()
    .url()
    .describe("URL для аудиту (наприклад https://sergeant.app)."),
  strategy: z.enum(["mobile", "desktop"]).optional(),
});

export type SeoPsiAuditParams = z.infer<typeof SeoPsiAuditParamsSchema>;

interface PsiResponse {
  notConfigured?: boolean;
  missing?: string[];
  url?: string;
  strategy?: string;
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
  fetchedAt?: string;
}

export interface SeoPsiAuditToolOptions {
  http: OpenClawHttpClient;
}

const DESCRIPTION = `Google PageSpeed Insights — Lighthouse scores
(performance, accessibility, best-practices, SEO) для URL. Mobile або desktop.
Якщо API key не налаштовано — повертає 'not configured'.`;

export function createSeoPsiAuditTool(
  opts: SeoPsiAuditToolOptions,
): ToolDefinition<SeoPsiAuditParams> {
  return {
    name: "seo_psi_audit",
    description: DESCRIPTION,
    parameters: SeoPsiAuditParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<PsiResponse>(
          "/seo/lighthouse",
          params,
        );
        if (response.notConfigured) {
          return {
            content: [
              {
                type: "text",
                text: `(seo_psi_audit not configured — missing env: ${(response.missing ?? []).join(", ")})`,
              },
              { type: "structured", data: { notConfigured: true } },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `(seo_psi_audit ${response.url} strategy=${response.strategy} perf=${response.performance})`,
            },
            { type: "structured", data: response },
          ],
        };
      } catch (err) {
        return formatError(err, "seo_psi_audit");
      }
    },
  };
}
