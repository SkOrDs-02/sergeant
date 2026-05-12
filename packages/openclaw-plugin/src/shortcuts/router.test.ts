import { describe, expect, it, vi } from "vitest";

import { ShortcutRouter, extractText } from "./router.js";
import type { ShortcutDefinition, ToolExecutor, ToolResult } from "./types.js";

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function makeExecutor(
  responses: Record<
    string,
    ToolResult | (() => ToolResult | Promise<ToolResult>)
  >,
): { executor: ToolExecutor; calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const executor: ToolExecutor = async (name, params) => {
    calls.push([name, params]);
    const r = responses[name];
    if (typeof r === "function") return r();
    if (r) return r;
    return textResult(`(no mock for ${name})`);
  };
  return { executor, calls };
}

describe("ShortcutRouter.match", () => {
  it("returns null when the message is empty", async () => {
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "x",
          patterns: [/^x$/],
          toolCalls: [],
          render: () => "x",
        },
      ],
      executeTool: async () => textResult(""),
    });
    expect(await router.match("")).toBeNull();
    expect(await router.match("   ")).toBeNull();
  });

  it("returns null when no shortcut matches", async () => {
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "ping",
          patterns: [/^\/ping$/i],
          toolCalls: [],
          render: () => "pong",
        },
      ],
      executeTool: async () => textResult(""),
    });
    expect(await router.match("hello world")).toBeNull();
  });

  it("first-match wins across shortcuts", async () => {
    const { executor, calls } = makeExecutor({});
    const router = new ShortcutRouter({
      shortcuts: [
        { slug: "a", patterns: [/^\/x$/i], toolCalls: [], render: () => "A" },
        { slug: "b", patterns: [/^\/x$/i], toolCalls: [], render: () => "B" },
      ],
      executeTool: executor,
    });
    const result = await router.match("/x");
    expect(result?.slug).toBe("a");
    expect(result?.response).toBe("A");
    expect(calls).toHaveLength(0);
  });

  it("trims the input before matching", async () => {
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "ping",
          patterns: [/^\/ping$/],
          toolCalls: [],
          render: () => "pong",
        },
      ],
      executeTool: async () => textResult(""),
    });
    expect((await router.match("  /ping   "))?.response).toBe("pong");
  });

  it("passes named capture groups into render", async () => {
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "echo",
          patterns: [/^\/echo\s+(?<msg>.+)$/i],
          captureGroups: ["msg"],
          toolCalls: [],
          render: (_results, params) => `echo: ${params["msg"]}`,
        },
      ],
      executeTool: async () => textResult(""),
    });
    const result = await router.match("/echo hello world");
    expect(result?.response).toBe("echo: hello world");
  });

  it("executes tool calls in parallel by default", async () => {
    const order: string[] = [];
    const executor: ToolExecutor = async (name) => {
      order.push(`start:${name}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${name}`);
      return textResult(name);
    };
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "agg",
          patterns: [/^\/agg$/],
          toolCalls: [
            { toolName: "a", buildParams: () => ({}) },
            { toolName: "b", buildParams: () => ({}) },
            { toolName: "c", buildParams: () => ({}) },
          ],
          render: () => "ok",
        },
      ],
      executeTool: executor,
    });
    await router.match("/agg");
    expect(order.filter((s) => s.startsWith("start:"))).toHaveLength(3);
    expect(order.slice(0, 3).every((s) => s.startsWith("start:"))).toBe(true);
  });

  it("executes tool calls sequentially when parallel: false", async () => {
    const order: string[] = [];
    const executor: ToolExecutor = async (name) => {
      order.push(`start:${name}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${name}`);
      return textResult(name);
    };
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "seq",
          patterns: [/^\/seq$/],
          parallel: false,
          toolCalls: [
            { toolName: "a", buildParams: () => ({}) },
            { toolName: "b", buildParams: () => ({}) },
          ],
          render: () => "ok",
        },
      ],
      executeTool: executor,
    });
    await router.match("/seq");
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("catches tool errors and surfaces them as text blocks", async () => {
    const executor: ToolExecutor = async () => {
      throw new Error("boom");
    };
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "x",
          patterns: [/^\/x$/],
          toolCalls: [{ toolName: "explodes", buildParams: () => ({}) }],
          render: (results) => extractText(results.get("explodes")),
        },
      ],
      executeTool: executor,
      log: () => undefined,
    });
    const result = await router.match("/x");
    expect(result?.response).toContain("explodes");
    expect(result?.response).toContain("boom");
  });

  it("forwards captured params to buildParams", async () => {
    const { executor, calls } = makeExecutor({
      mem: textResult("ok"),
    });
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "search",
          patterns: [/^\/search\s+(?<query>.+)$/i],
          captureGroups: ["query"],
          toolCalls: [
            {
              toolName: "mem",
              buildParams: (captured) => ({ q: captured["query"], topK: 5 }),
            },
          ],
          render: () => "ok",
        },
      ],
      executeTool: executor,
    });
    await router.match("/search hello kitty");
    expect(calls).toEqual([["mem", { q: "hello kitty", topK: 5 }]]);
  });

  it("logs at debug level on match", async () => {
    const log = vi.fn();
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "x",
          patterns: [/^\/x$/],
          toolCalls: [],
          render: () => "ok",
        },
      ],
      executeTool: async () => textResult(""),
      log,
    });
    await router.match("/x");
    expect(log).toHaveBeenCalledWith(
      "debug",
      "openclaw.shortcut.matched",
      expect.objectContaining({ slug: "x" }),
    );
  });

  it("skips tool execution when toolCalls is empty (e.g. /think)", async () => {
    const executor = vi.fn();
    const router = new ShortcutRouter({
      shortcuts: [
        {
          slug: "think",
          patterns: [/^\/think\s+(?<q>.+)$/],
          toolCalls: [],
          render: (_r, p) => `__ESCALATE_LAYER2__:${p["q"]}`,
        },
      ],
      executeTool: executor as ToolExecutor,
    });
    const result = await router.match("/think how to ship");
    expect(result?.response).toBe("__ESCALATE_LAYER2__:how to ship");
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("extractText", () => {
  it("returns '(no data)' for undefined", () => {
    expect(extractText(undefined)).toBe("(no data)");
  });

  it("returns '(no data)' when there are no text blocks", () => {
    expect(extractText({ content: [] })).toBe("(no data)");
  });

  it("joins multiple text blocks with newlines", () => {
    expect(
      extractText({
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("a\nb");
  });
});

describe("ShortcutDefinition contracts (used by ALL_SHORTCUTS)", () => {
  // Smoke test that the canonical shape is what render expects.
  const def: ShortcutDefinition = {
    slug: "x",
    patterns: [/^x$/],
    toolCalls: [{ toolName: "y", buildParams: () => ({}) }],
    render: (results, params) =>
      `${results.size}:${Object.keys(params).length}`,
  };
  it("ShortcutDefinition compiles & renders", async () => {
    const router = new ShortcutRouter({
      shortcuts: [def],
      executeTool: async () => textResult("hello"),
    });
    const r = await router.match("x");
    expect(r?.response).toBe("1:0");
  });
});
