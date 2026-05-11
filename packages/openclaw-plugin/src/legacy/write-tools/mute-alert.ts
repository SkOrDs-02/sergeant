/**
 * `mute_alert` write-tool (PR-D Phase 4).
 *
 * Mutes a Sentry issue alert via server's
 * `/api/internal/openclaw/write/mute-alert` endpoint.
 */

import { z } from "zod";
import {
  createWriteTool,
  type WriteToolFactoryOptions,
  type WriteToolParts,
} from "./write-tool-factory.js";

export const MuteAlertParamsSchema = z.object({
  issueId: z.string().min(1).max(200).describe("Sentry issue ID to mute"),
  untilIso: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "ISO 8601 datetime until which to mute (omit = indefinitely muted)",
    ),
});

export type MuteAlertParams = z.infer<typeof MuteAlertParamsSchema>;

interface MuteAlertResponse {
  status: "muted" | "already_muted" | "not_found" | "not_configured";
  issueId: string;
  mutedUntil?: string;
}

const TOOL_NAME = "mute_alert";

export function createMuteAlertTool(
  opts: WriteToolFactoryOptions,
): WriteToolParts<MuteAlertParams> {
  return createWriteTool<MuteAlertParams, MuteAlertResponse>(
    {
      name: TOOL_NAME,
      description: `Mute a Sentry issue alert. WRITE TOOL — gated behind
founder approval. Use for: silencing noisy or known-issue alerts that the
founder acknowledges. Reversible in Sentry UI.`,
      parameters: MuteAlertParamsSchema,
      endpoint: "/write/mute-alert",
      buildBody: (params) => ({
        issueId: params.issueId,
        untilIso: params.untilIso,
      }),
      formatSuccess: (response) => {
        if (response.status === "not_configured") {
          return {
            content: [
              {
                type: "text",
                text: "mute_alert: Sentry not configured on server.",
              },
            ],
          };
        }
        if (response.status === "not_found") {
          return {
            content: [
              {
                type: "text",
                text: `mute_alert: issue ${response.issueId} not found in Sentry.`,
              },
            ],
          };
        }
        const until = response.mutedUntil
          ? ` until ${response.mutedUntil}`
          : " indefinitely";
        const verb =
          response.status === "already_muted" ? "was already muted" : "muted";
        return {
          content: [
            {
              type: "text",
              text: `✅ issue ${response.issueId} ${verb}${until}`,
            },
            {
              type: "structured",
              data: {
                status: response.status,
                issueId: response.issueId,
                mutedUntil: response.mutedUntil,
              },
            },
          ],
        };
      },
    },
    opts,
  );
}
