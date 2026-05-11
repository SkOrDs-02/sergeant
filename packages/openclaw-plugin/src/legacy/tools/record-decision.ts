/**
 * `record_decision` tool — records a structured decision to the decision log.
 *
 * Server contract (`POST /api/internal/openclaw/decision`):
 *   { founderUserId, topic, context, decision, rationale, alternatives?, invocationId?, metadata? }
 *   → { id: number, createdAt: string }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";

export const RecordDecisionParamsSchema = z.object({
  topic: z
    .string()
    .min(1)
    .max(200)
    .describe("Decision topic/title (e.g. 'Міграція на OpenClaw Gateway')."),
  context: z
    .string()
    .min(1)
    .max(8000)
    .describe("Background context — why this decision is needed."),
  decision: z
    .string()
    .min(1)
    .max(4000)
    .describe("The decision itself — what was decided."),
  rationale: z
    .string()
    .min(1)
    .max(8000)
    .describe("Rationale — why this option was chosen over alternatives."),
  alternatives: z
    .string()
    .max(8000)
    .optional()
    .describe("Alternatives considered (optional)."),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional structured metadata."),
});

export type RecordDecisionParams = z.infer<typeof RecordDecisionParamsSchema>;

interface DecisionResponse {
  id: number;
  createdAt: string;
}

export interface RecordDecisionToolOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
}

const DESCRIPTION = `Record a structured decision to the Sergeant decision log.
Use when the founder makes or confirms a decision during conversation
("записуємо рішення", "фіксуємо що ми вирішили"). Creates an auditable
entry with topic, context, decision, rationale, and alternatives.`;

export function createRecordDecisionTool(
  opts: RecordDecisionToolOptions,
): ToolDefinition<RecordDecisionParams> {
  return {
    name: "record_decision",
    description: DESCRIPTION,
    parameters: RecordDecisionParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<DecisionResponse>("/decision", {
          founderUserId: opts.founderUserId,
          topic: params.topic,
          context: params.context,
          decision: params.decision,
          rationale: params.rationale,
          alternatives: params.alternatives,
          metadata: params.metadata,
        });
        return formatResult(response, params.topic);
      } catch (err) {
        return formatError(err);
      }
    },
  };
}

function formatResult(response: DecisionResponse, topic: string): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `✅ Decision recorded: "${topic}" (id=${response.id}, ${(response.createdAt ?? "").slice(0, 19)})`,
      },
      {
        type: "structured",
        data: { id: response.id, createdAt: response.createdAt },
      },
    ],
  };
}

function formatError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `(record_decision error: HTTP ${err.status} — ${err.responseText || err.message})`,
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
