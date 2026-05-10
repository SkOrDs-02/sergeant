/**
 * Parity-харнес — pure simulator грамі-side і plugin-side flows.
 *
 * Підхід (бо PoC): обидві сторони не запускають реальний LLM. Замість
 * цього кожна сторона має одну й ту саму "scripted agent loop":
 *   1. на user_message → викликати tools у порядку GoldenConversation.expectedToolCalls,
 *   2. отримати stubbed responses,
 *   3. порахувати cost (LLM expected + sum tool costs),
 *   4. повернути ParityRunResult.
 *
 * Різниця між грамі-side і plugin-side:
 *   - Plugin-side проганяє виклики через `ToolDefinition.execute()` (наш
 *     factory-built tools у sdk-types-format). Це валідує, що SDK form
 *     не deformує args / results.
 *   - Грамі-side проганяє ті ж stub responses через TypeScript-ну
 *     "naive" loop без plugin-API surface (просто виклик async function).
 *
 * Якщо обидві сторони повертають однакові results — plugin-form fits.
 * Якщо ні — PoC notes фіксують, що саме deformує і що треба shim-ити.
 */

import type {
  GoldenConversation,
  ExpectedToolCall,
} from "./golden-conversations.js";
import type { ToolDefinition, ToolResult } from "./../sdk-types.js";

export interface ParityRunResult {
  conversationId: string;
  /** Tool calls actually made (name only — comparable across sides). */
  toolCallsMade: string[];
  /** Total cost rolled up (LLM expected + tool costs). */
  totalCostUsd: number;
  /** Shape of final result (`type` per content block). */
  responseShape: Array<"text" | "structured">;
  /** Final status — success / budget_exceeded / etc. */
  status:
    | "success"
    | "error"
    | "budget_exceeded"
    | "iteration_cap"
    | "approval_rejected";
}

export interface ParityComparison {
  conversationId: string;
  toolCallsMatch: boolean;
  costMatch: boolean;
  responseShapeMatch: boolean;
  statusMatch: boolean;
  /** Difference details — empty array if all match. */
  diffs: string[];
}

const COST_TOLERANCE = 0.05; // 5% — tokenizer-difference between sides

// ─────────────────────────────────────────────────────────────────────────
// Grammy-side simulator — naive function-call loop. No SDK surface.
// ─────────────────────────────────────────────────────────────────────────

export interface GrammyToolHandler {
  name: string;
  handler: (params: Record<string, unknown>) => Promise<{
    result: unknown;
    costUsd?: number;
  }>;
}

export async function runGrammyConversation(
  conversation: GoldenConversation,
  handlers: GrammyToolHandler[],
  options: { budgetExceeded?: boolean } = {},
): Promise<ParityRunResult> {
  if (
    options.budgetExceeded ||
    conversation.expectedStatus === "budget_exceeded"
  ) {
    return {
      conversationId: conversation.id,
      toolCallsMade: [],
      totalCostUsd: 0,
      responseShape: ["text"],
      status: "budget_exceeded",
    };
  }

  const toolCallsMade: string[] = [];
  let totalCost = conversation.expectedLlmCostUsd;
  for (const expected of conversation.expectedToolCalls) {
    const handler = handlers.find((h) => h.name === expected.toolName);
    if (!handler) {
      return {
        conversationId: conversation.id,
        toolCallsMade,
        totalCostUsd: totalCost,
        responseShape: ["text"],
        status: "error",
      };
    }
    const params = synthParams(expected, conversation);
    const { costUsd = 0 } = await handler.handler(params);
    toolCallsMade.push(expected.toolName);
    totalCost += costUsd;
  }
  return {
    conversationId: conversation.id,
    toolCallsMade,
    totalCostUsd: totalCost,
    responseShape: conversation.expectedResponseShape,
    status: "success",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Plugin-side simulator — runs through ToolDefinition.execute().
// ─────────────────────────────────────────────────────────────────────────

export async function runPluginConversation(
  conversation: GoldenConversation,
  tools: ToolDefinition<unknown>[],
  options: {
    budgetExceeded?: boolean;
    /** Optional per-tool cost override; otherwise uses fixture costUsd. */
    costFromFixture?: boolean;
  } = {},
): Promise<ParityRunResult> {
  if (
    options.budgetExceeded ||
    conversation.expectedStatus === "budget_exceeded"
  ) {
    return {
      conversationId: conversation.id,
      toolCallsMade: [],
      totalCostUsd: 0,
      responseShape: ["text"],
      status: "budget_exceeded",
    };
  }

  const toolCallsMade: string[] = [];
  let totalCost = conversation.expectedLlmCostUsd;
  let lastResult: ToolResult | undefined;

  for (const expected of conversation.expectedToolCalls) {
    const tool = tools.find((t) => t.name === expected.toolName);
    if (!tool) {
      return {
        conversationId: conversation.id,
        toolCallsMade,
        totalCostUsd: totalCost,
        responseShape: ["text"],
        status: "error",
      };
    }
    const params = synthParams(expected, conversation);
    const result = await tool.execute(`inv_${conversation.id}`, params);
    toolCallsMade.push(expected.toolName);
    if (options.costFromFixture !== false) {
      totalCost += expected.stubbedResult.costUsd ?? 0;
    } else {
      totalCost += result.costUsd ?? 0;
    }
    if (result.rejected) {
      return {
        conversationId: conversation.id,
        toolCallsMade,
        totalCostUsd: totalCost,
        responseShape: result.content.map((b) => b.type),
        status: "approval_rejected",
      };
    }
    lastResult = result;
  }
  return {
    conversationId: conversation.id,
    toolCallsMade,
    totalCostUsd: totalCost,
    responseShape:
      lastResult?.content.map((b) => b.type) ??
      conversation.expectedResponseShape,
    status: "success",
  };
}

function synthParams(
  expected: ExpectedToolCall,
  conversation: GoldenConversation,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const key of expected.paramKeys) {
    if (key === "query") {
      params[key] = conversation.userMessage;
    } else if (key === "topic") {
      params[key] = conversation.id;
    } else if (key === "context") {
      params[key] = `Context from ${conversation.id}`;
    } else if (key === "decision") {
      params[key] = "Yes, keep target";
    } else if (key === "rationale") {
      params[key] = "Aligned with quarterly OKR";
    } else if (key === "title") {
      params[key] = "Generated title";
    } else if (key === "body") {
      params[key] = "Generated body";
    } else {
      params[key] = `synth_${key}`;
    }
  }
  return params;
}

// ─────────────────────────────────────────────────────────────────────────
// Comparison — produces a ParityComparison report.
// ─────────────────────────────────────────────────────────────────────────

export function compareParity(
  grammy: ParityRunResult,
  plugin: ParityRunResult,
): ParityComparison {
  const diffs: string[] = [];
  const toolCallsMatch = arraysEqual(
    grammy.toolCallsMade,
    plugin.toolCallsMade,
  );
  if (!toolCallsMatch) {
    diffs.push(
      `tool calls differ: grammy=[${grammy.toolCallsMade.join(", ")}] vs plugin=[${plugin.toolCallsMade.join(", ")}]`,
    );
  }
  const costMatch = withinTolerance(grammy.totalCostUsd, plugin.totalCostUsd);
  if (!costMatch) {
    diffs.push(
      `cost differs > ${COST_TOLERANCE * 100}%: grammy=${grammy.totalCostUsd} vs plugin=${plugin.totalCostUsd}`,
    );
  }
  const responseShapeMatch = arraysEqual(
    grammy.responseShape,
    plugin.responseShape,
  );
  if (!responseShapeMatch) {
    diffs.push(
      `response shape differs: grammy=[${grammy.responseShape.join(", ")}] vs plugin=[${plugin.responseShape.join(", ")}]`,
    );
  }
  const statusMatch = grammy.status === plugin.status;
  if (!statusMatch) {
    diffs.push(
      `status differs: grammy=${grammy.status} vs plugin=${plugin.status}`,
    );
  }
  return {
    conversationId: grammy.conversationId,
    toolCallsMatch,
    costMatch,
    responseShapeMatch,
    statusMatch,
    diffs,
  };
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 0.0001);
  return Math.abs(a - b) / denom <= COST_TOLERANCE;
}
