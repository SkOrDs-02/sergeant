import { describe, it, expect, vi } from "vitest";
import {
  ShortcutRouter,
  extractText,
  type ShortcutDefinition,
  type ToolExecutor,
} from "./shortcut-router.js";
import type { ToolResult } from "./sdk-types.js";

const mockResult = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
});

const mockExecutor: ToolExecutor = vi.fn(async (toolName) =>
  mockResult(`${toolName} result`),
);

const testShortcuts: ShortcutDefinition[] = [
  {
    slug: "metrics",
    patterns: [/^\/metrics$/i, /^дай метрики$/i],
    toolCalls: [
      { toolName: "get_posthog_stats", buildParams: () => ({}) },
      { toolName: "get_stripe_metrics", buildParams: () => ({}) },
    ],
    parallel: true,
    render: (results) => {
      const posthog = extractText(results.get("get_posthog_stats"));
      const stripe = extractText(results.get("get_stripe_metrics"));
      return `metrics: ${posthog} | ${stripe}`;
    },
  },
  {
    slug: "recall",
    patterns: [/^\/recall\s+(?<query>.+)$/i],
    captureGroups: ["query"],
    toolCalls: [
      {
        toolName: "recall_memory",
        buildParams: (captured) => ({ query: captured["query"] ?? "" }),
      },
    ],
    render: (results) => extractText(results.get("recall_memory")),
  },
];

describe("ShortcutRouter", () => {
  it("matches exact slash command", async () => {
    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: mockExecutor,
    });

    const result = await router.match("/metrics");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("metrics");
    expect(result!.response).toContain("get_posthog_stats result");
    expect(result!.response).toContain("get_stripe_metrics result");
  });

  it("matches Ukrainian natural language pattern", async () => {
    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: mockExecutor,
    });

    const result = await router.match("дай метрики");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("metrics");
  });

  it("is case-insensitive for slash commands", async () => {
    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: mockExecutor,
    });

    const result = await router.match("/METRICS");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("metrics");
  });

  it("returns null when no match", async () => {
    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: mockExecutor,
    });

    const result = await router.match("що нового?");
    expect(result).toBeNull();
  });

  it("extracts named capture groups", async () => {
    const executor: ToolExecutor = vi.fn(async (_name, params) =>
      mockResult(`recalled: ${params["query"]}`),
    );
    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: executor,
    });

    const result = await router.match("/recall що ми вирішили по БД");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("recall");
    expect(executor).toHaveBeenCalledWith("recall_memory", {
      query: "що ми вирішили по БД",
    });
  });

  it("trims whitespace from user message", async () => {
    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: mockExecutor,
    });

    const result = await router.match("  /metrics  ");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("metrics");
  });

  it("executes tool calls in parallel by default", async () => {
    const callOrder: string[] = [];
    const slowExecutor: ToolExecutor = async (toolName) => {
      callOrder.push(`start:${toolName}`);
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push(`end:${toolName}`);
      return mockResult(`${toolName} done`);
    };

    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: slowExecutor,
    });

    await router.match("/metrics");
    // Both should start before either ends (parallel execution)
    expect(callOrder[0]).toBe("start:get_posthog_stats");
    expect(callOrder[1]).toBe("start:get_stripe_metrics");
  });

  it("executes tool calls sequentially when parallel=false", async () => {
    const sequentialShortcut: ShortcutDefinition = {
      slug: "sequential",
      patterns: [/^\/seq$/],
      toolCalls: [
        { toolName: "tool_a", buildParams: () => ({}) },
        { toolName: "tool_b", buildParams: () => ({}) },
      ],
      parallel: false,
      render: () => "done",
    };

    const callOrder: string[] = [];
    const slowExecutor: ToolExecutor = async (toolName) => {
      callOrder.push(`start:${toolName}`);
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push(`end:${toolName}`);
      return mockResult("ok");
    };

    const router = new ShortcutRouter({
      shortcuts: [sequentialShortcut],
      executeTool: slowExecutor,
    });

    await router.match("/seq");
    // Sequential: first tool must finish before second starts
    expect(callOrder).toEqual([
      "start:tool_a",
      "end:tool_a",
      "start:tool_b",
      "end:tool_b",
    ]);
  });

  it("handles tool execution errors gracefully", async () => {
    const failingExecutor: ToolExecutor = async () => {
      throw new Error("network timeout");
    };

    const router = new ShortcutRouter({
      shortcuts: testShortcuts,
      executeTool: failingExecutor,
    });

    const result = await router.match("/metrics");
    expect(result).not.toBeNull();
    expect(result!.response).toContain("Error executing");
  });

  it("first matching shortcut wins", async () => {
    const overlapping: ShortcutDefinition[] = [
      {
        slug: "first",
        patterns: [/^\/test$/],
        toolCalls: [],
        render: () => "first wins",
      },
      {
        slug: "second",
        patterns: [/^\/test$/],
        toolCalls: [],
        render: () => "second wins",
      },
    ];

    const router = new ShortcutRouter({
      shortcuts: overlapping,
      executeTool: mockExecutor,
    });

    const result = await router.match("/test");
    expect(result!.slug).toBe("first");
    expect(result!.response).toBe("first wins");
  });
});

describe("extractText", () => {
  it("extracts text from ToolResult", () => {
    const result: ToolResult = {
      content: [
        { type: "text", text: "hello" },
        { type: "structured", data: {} },
        { type: "text", text: "world" },
      ],
    };
    expect(extractText(result)).toBe("hello\nworld");
  });

  it("returns (no data) for undefined", () => {
    expect(extractText(undefined)).toBe("(no data)");
  });
});
