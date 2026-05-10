/**
 * Phase 0.5 PoC — parity test.
 *
 * Plan §520: «3+ golden conversations прогнані на грамі-side і plugin-side;
 * tool-calls, cost, response shape мають збігатися (з толерантністю на
 * формулювання)».
 *
 * Тест валідує parity на трьох canonical conversations:
 *   1. recall_only       — read tool only.
 *   2. recall_then_decision — read + write (record_decision audit-only).
 *   3. budget_blocked     — negative path; both sides повертають
 *                            budget_exceeded; жоден tool не викликається.
 *
 * Plugin-side використовує справжні `ToolDefinition.execute()` функції
 * наших tools (recall-memory + create-github-issue), що проксяться через
 * stub HTTP-клієнт. Грамі-side використовує naive async function calls
 * з тими ж stub responses.
 */

import { describe, it, expect } from "vitest";
import {
  GOLDEN_CONVERSATIONS,
  getGoldenConversation,
} from "./golden-conversations.js";
import {
  compareParity,
  runGrammyConversation,
  runPluginConversation,
  type GrammyToolHandler,
} from "./parity-runner.js";
import { OpenClawHttpClient } from "./../http-client.js";
import { createRecallMemoryTool } from "./../tools/recall-memory.js";
import { createCreateGithubIssueTool } from "./../write-tools/create-github-issue.js";
import type { ToolDefinition } from "./../sdk-types.js";

const API_KEY = "x".repeat(32);

function buildStubHttp(
  routeMap: Record<string, { status?: number; body: unknown }>,
): OpenClawHttpClient {
  return new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const path = url.replace(/^http:\/\/x/, "");
      const route = routeMap[path];
      if (!route) {
        return Promise.resolve(
          new Response(`no stub for ${path}`, { status: 404 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
        }),
      );
    }) as typeof globalThis.fetch,
  });
}

describe("PR-B Phase 0.5 parity harness — golden conversations", () => {
  it("includes at least 3 fixtures (plan §520 minimum)", () => {
    expect(GOLDEN_CONVERSATIONS.length).toBeGreaterThanOrEqual(3);
  });

  it("recall_only — grammy side and plugin side produce identical tool calls + cost + shape", async () => {
    const conv = getGoldenConversation("recall_only");

    const http = buildStubHttp({
      "/api/internal/openclaw/recall": {
        body: conv.expectedToolCalls[0]?.stubbedResult.body ?? {},
      },
    });

    const recallTool = createRecallMemoryTool({
      http,
      founderUserId: "user_test",
    }) as unknown as ToolDefinition<unknown>;

    const grammyHandlers: GrammyToolHandler[] = [
      {
        name: "recall_memory",
        handler: async () => ({
          result: conv.expectedToolCalls[0]?.stubbedResult.body,
          costUsd: 0,
        }),
      },
    ];

    const grammy = await runGrammyConversation(conv, grammyHandlers);
    const plugin = await runPluginConversation(conv, [recallTool]);

    const cmp = compareParity(grammy, plugin);
    expect(cmp.toolCallsMatch).toBe(true);
    expect(cmp.costMatch).toBe(true);
    expect(cmp.statusMatch).toBe(true);
    expect(cmp.diffs).toEqual([]);
  });

  it("recall_then_decision — both sides hit recall + record_decision in order", async () => {
    const conv = getGoldenConversation("recall_then_decision");

    const http = buildStubHttp({
      "/api/internal/openclaw/recall": {
        body: conv.expectedToolCalls[0]?.stubbedResult.body,
      },
      "/api/internal/openclaw/decision": {
        body: conv.expectedToolCalls[1]?.stubbedResult.body,
      },
    });

    const recallTool = createRecallMemoryTool({
      http,
      founderUserId: "user_test",
    }) as unknown as ToolDefinition<unknown>;
    const recordDecisionTool: ToolDefinition<unknown> = {
      name: "record_decision",
      description: "stub",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: { _def: { typeName: "ZodAny" } } as any,
      execute: async () => ({
        content: [
          { type: "text", text: "PR opened" },
          {
            type: "structured",
            data: { decisionId: 17, prUrl: "https://gh/x" },
          },
        ],
      }),
    };

    const grammyHandlers: GrammyToolHandler[] = [
      {
        name: "recall_memory",
        handler: async () => ({
          result: conv.expectedToolCalls[0]?.stubbedResult.body,
          costUsd: 0,
        }),
      },
      {
        name: "record_decision",
        handler: async () => ({
          result: conv.expectedToolCalls[1]?.stubbedResult.body,
          costUsd: 0,
        }),
      },
    ];

    const grammy = await runGrammyConversation(conv, grammyHandlers);
    const plugin = await runPluginConversation(conv, [
      recallTool,
      recordDecisionTool,
    ]);

    const cmp = compareParity(grammy, plugin);
    expect(plugin.toolCallsMade).toEqual(["recall_memory", "record_decision"]);
    expect(cmp.toolCallsMatch).toBe(true);
    expect(cmp.responseShapeMatch).toBe(true);
    expect(cmp.statusMatch).toBe(true);
    expect(cmp.diffs).toEqual([]);
  });

  it("budget_blocked — both sides return budget_exceeded with no tool calls", async () => {
    const conv = getGoldenConversation("budget_blocked");
    const http = buildStubHttp({});

    const recallTool = createRecallMemoryTool({
      http,
      founderUserId: "user_test",
    }) as unknown as ToolDefinition<unknown>;

    const grammyHandlers: GrammyToolHandler[] = [
      {
        name: "recall_memory",
        handler: async () => ({ result: {}, costUsd: 0 }),
      },
    ];

    const grammy = await runGrammyConversation(conv, grammyHandlers, {
      budgetExceeded: true,
    });
    const plugin = await runPluginConversation(conv, [recallTool], {
      budgetExceeded: true,
    });

    expect(grammy.status).toBe("budget_exceeded");
    expect(plugin.status).toBe("budget_exceeded");
    expect(grammy.toolCallsMade).toEqual([]);
    expect(plugin.toolCallsMade).toEqual([]);
    const cmp = compareParity(grammy, plugin);
    expect(cmp.statusMatch).toBe(true);
    expect(cmp.toolCallsMatch).toBe(true);
    expect(cmp.diffs).toEqual([]);
  });

  it("create_github_issue (write tool, Variant A) parity — both sides reach success with one tool call", async () => {
    const http = buildStubHttp({
      "/api/internal/openclaw/write/create-github-issue": {
        body: {
          url: "https://gh/x/issues/42",
          number: 42,
          title: "Generated title",
        },
      },
    });
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "user_test",
      variant: "A",
      approvalCallbackTimeoutMs: 1000,
    });

    // Local synthetic conversation for write-tool parity.
    const conv = {
      id: "create_issue_smoke",
      description: "Variant A native flow — assumed approved by SDK.",
      userMessage: "Постав issue про runway dashboard",
      expectedToolCalls: [
        {
          toolName: "create_github_issue",
          paramKeys: ["title", "body"],
          stubbedResult: {
            body: { url: "https://gh/x/issues/42" },
            costUsd: 0,
          },
        },
      ],
      expectedLlmCostUsd: 0.05,
      expectedResponseShape: ["text", "structured"] as Array<
        "text" | "structured"
      >,
      expectedStatus: "success" as const,
    };

    const grammyHandlers: GrammyToolHandler[] = [
      {
        name: "create_github_issue",
        handler: async () => ({
          result: { url: "https://gh/x/issues/42" },
          costUsd: 0,
        }),
      },
    ];

    const grammy = await runGrammyConversation(conv, grammyHandlers);
    const plugin = await runPluginConversation(conv, [
      parts.tool as unknown as ToolDefinition<unknown>,
    ]);

    expect(plugin.toolCallsMade).toEqual(["create_github_issue"]);
    expect(plugin.status).toBe("success");
    const cmp = compareParity(grammy, plugin);
    expect(cmp.toolCallsMatch).toBe(true);
    expect(cmp.statusMatch).toBe(true);
  });
});
