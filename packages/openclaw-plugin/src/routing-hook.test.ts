import { describe, it, expect, vi } from "vitest";
import {
  createRoutingHook,
  isRoutedResponse,
  extractRoutedResponse,
  ROUTED_RESPONSE_PREFIX,
} from "./routing-hook.js";
import type { OpenClawHttpClient } from "./http-client.js";
import type { ToolResult } from "./sdk-types.js";
import type { LlmClassifier } from "./cheap-router.js";
import type { ToolExecutor } from "./shortcut-router.js";

const mockResult = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
});

/** Mock HTTP client that always allows budget. */
const mockHttp = {
  post: vi.fn(async (path: string) => {
    if (path === "/budget") return { allowed: true, dailyTotalUsd: 1.5 };
    if (path === "/classify")
      return {
        text: '{"class": "thinking", "shortcut": null, "persona": "cofounder"}',
        costUsd: 0.0002,
      };
    return {};
  }),
} as unknown as OpenClawHttpClient;

/** Mock executor that returns tool name as result. */
const mockExecutor: ToolExecutor = vi.fn(async (toolName) =>
  mockResult(`${toolName} data`),
);

/** Mock classifier. */
const mockClassify: LlmClassifier = vi.fn(async () => ({
  text: '{"class": "thinking", "shortcut": null, "persona": "cofounder"}',
  costUsd: 0.0002,
}));

const baseLlmInputCtx = {
  invocationId: "inv-1",
  agentRunId: "run-1",
  founderUserId: "user-1",
  estimatedCostUsd: 0.01,
  modelTier: "default" as const,
};

describe("createRoutingHook", () => {
  it("allows through to Layer 2 when cheap-router says thinking", async () => {
    const { hook } = createRoutingHook({
      http: mockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: mockClassify,
      executeTool: mockExecutor,
    });

    const result = await hook({
      ...baseLlmInputCtx,
      userMessage: "як нам масштабувати архітектуру?",
    } as never);

    expect(result.ok).toBe(true);
  });

  it("blocks with routed response on exact shortcut match", async () => {
    const { hook } = createRoutingHook({
      http: mockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: mockClassify,
      executeTool: mockExecutor,
    });

    const result = await hook({
      ...baseLlmInputCtx,
      userMessage: "/metrics",
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.startsWith(ROUTED_RESPONSE_PREFIX)).toBe(true);
      const response = extractRoutedResponse(result.reason);
      expect(response).toContain("Метрики сьогодні");
    }
  });

  it("blocks with budget_exceeded when budget gate rejects", async () => {
    const budgetBlockHttp = {
      post: vi.fn(async (path: string) => {
        if (path === "/budget")
          return { allowed: false, reason: "Daily cap exceeded" };
        return {};
      }),
    } as unknown as OpenClawHttpClient;

    const { hook } = createRoutingHook({
      http: budgetBlockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: mockClassify,
      executeTool: mockExecutor,
    });

    const result = await hook(baseLlmInputCtx as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Daily cap exceeded");
    }
  });

  it("allows through when no userMessage in context", async () => {
    const { hook } = createRoutingHook({
      http: mockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: mockClassify,
      executeTool: mockExecutor,
    });

    const result = await hook(baseLlmInputCtx as never);
    expect(result.ok).toBe(true);
  });

  it("routes /think to Layer 2 (allows through)", async () => {
    const { hook } = createRoutingHook({
      http: mockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: mockClassify,
      executeTool: mockExecutor,
    });

    const result = await hook({
      ...baseLlmInputCtx,
      userMessage: "/think як покращити retention",
    } as never);

    expect(result.ok).toBe(true);
  });

  it("blocks with chat_response from cheap-router", async () => {
    const chatClassify: LlmClassifier = vi.fn(async () => ({
      text: '{"class": "chat", "chat_response": "Привіт!"}',
      costUsd: 0.0002,
    }));

    const { hook } = createRoutingHook({
      http: mockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: chatClassify,
      executeTool: mockExecutor,
    });

    const result = await hook({
      ...baseLlmInputCtx,
      userMessage: "привіт, як справи?",
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const response = extractRoutedResponse(result.reason);
      expect(response).toBe("Привіт!");
    }
  });

  it("routes routine_metrics from cheap-router to /metrics shortcut", async () => {
    const routineClassify: LlmClassifier = vi.fn(async () => ({
      text: '{"class": "routine_metrics", "shortcut": "metrics"}',
      costUsd: 0.0002,
    }));

    const { hook } = createRoutingHook({
      http: mockHttp,
      founderUserId: "user-1",
      perCallCapUsd: 0.5,
      classify: routineClassify,
      executeTool: mockExecutor,
    });

    const result = await hook({
      ...baseLlmInputCtx,
      userMessage: "скільки грошей заробили сьогодні?",
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const response = extractRoutedResponse(result.reason);
      expect(response).toContain("Метрики сьогодні");
    }
  });
});

describe("isRoutedResponse", () => {
  it("identifies routed responses", () => {
    expect(isRoutedResponse(`${ROUTED_RESPONSE_PREFIX}hello`)).toBe(true);
    expect(isRoutedResponse("Budget exceeded")).toBe(false);
  });
});

describe("extractRoutedResponse", () => {
  it("strips prefix", () => {
    expect(extractRoutedResponse(`${ROUTED_RESPONSE_PREFIX}hello`)).toBe(
      "hello",
    );
  });
});
