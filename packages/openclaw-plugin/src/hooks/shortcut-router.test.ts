import { describe, expect, it, vi } from "vitest";

import {
  createShortcutRouterHook,
  ESCALATE_PREFIX,
} from "./shortcut-router.js";
import type {
  ShortcutDefinition,
  ToolExecutor,
  ToolResult,
} from "../shortcuts/types.js";

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

const exec: ToolExecutor = async () => textResult("ok");

const pingShortcut: ShortcutDefinition = {
  slug: "ping",
  patterns: [/^\/ping$/i],
  toolCalls: [],
  render: () => "pong",
};

const thinkShortcut: ShortcutDefinition = {
  slug: "think",
  patterns: [/^\/think\s+(?<q>.+)$/i],
  captureGroups: ["q"],
  toolCalls: [],
  render: (_r, p) => `${ESCALATE_PREFIX}thinking:cofounder:${p["q"] ?? ""}`,
};

describe("createShortcutRouterHook", () => {
  it("returns { handled: false } when content is missing", async () => {
    const hook = createShortcutRouterHook({
      shortcuts: [pingShortcut],
      executeTool: exec,
    });
    const result = await hook({ content: "" });
    expect(result).toEqual({ handled: false });
  });

  it("returns { handled: false } for whitespace-only content", async () => {
    const hook = createShortcutRouterHook({
      shortcuts: [pingShortcut],
      executeTool: exec,
    });
    expect(await hook({ content: "   " })).toEqual({ handled: false });
  });

  it("returns { handled: false } when no shortcut matches", async () => {
    const hook = createShortcutRouterHook({
      shortcuts: [pingShortcut],
      executeTool: exec,
    });
    expect(await hook({ content: "just chatting" })).toEqual({
      handled: false,
    });
  });

  it("claims dispatch with the rendered response as `text` when a shortcut matches", async () => {
    const log = vi.fn();
    const hook = createShortcutRouterHook({
      shortcuts: [pingShortcut],
      executeTool: exec,
      log,
    });
    const result = await hook({
      content: "/ping",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    });
    expect(result).toEqual({
      handled: true,
      text: "pong",
    });
    expect(log).toHaveBeenCalledWith(
      "info",
      "openclaw.shortcut.routed",
      expect.objectContaining({
        slug: "ping",
        channel: "telegram",
        sessionKey: "agent:main:telegram:direct:319824665",
      }),
    );
  });

  it("does NOT claim dispatch on /think (passes through to Layer 2)", async () => {
    const log = vi.fn();
    const hook = createShortcutRouterHook({
      shortcuts: [thinkShortcut],
      executeTool: exec,
      log,
    });
    const result = await hook({
      content: "/think how to price",
      channel: "telegram",
      sessionKey: "agent:main:telegram:direct:319824665",
    });
    expect(result).toEqual({ handled: false });
    expect(log).toHaveBeenCalledWith(
      "debug",
      "openclaw.shortcut.escalate_layer2",
      expect.objectContaining({
        slug: "think",
        channel: "telegram",
        sessionKey: "agent:main:telegram:direct:319824665",
      }),
    );
  });

  it("returns { handled: false } when the router itself throws", async () => {
    const log = vi.fn();
    const boom: ToolExecutor = async () => {
      throw new Error("ignored — router catches");
    };
    // To make the router itself throw rather than the safeExecute path,
    // hand it a malformed shortcut whose render throws.
    const malformed: ShortcutDefinition = {
      slug: "boom",
      patterns: [/^\/boom$/],
      toolCalls: [],
      render: () => {
        throw new Error("kaboom");
      },
    };
    const hook = createShortcutRouterHook({
      shortcuts: [malformed],
      executeTool: boom,
      log,
    });
    const result = await hook({ content: "/boom" });
    expect(result).toEqual({ handled: false });
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.shortcut.router_error",
      expect.objectContaining({ error: expect.stringContaining("kaboom") }),
    );
  });

  it("dispatches tool calls through the injected executor", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const executor: ToolExecutor = async (name, params) => {
      calls.push([name, params]);
      return textResult(`pong:${name}`);
    };
    const shortcut: ShortcutDefinition = {
      slug: "agg",
      patterns: [/^\/agg$/],
      toolCalls: [
        { toolName: "a", buildParams: () => ({ x: 1 }) },
        { toolName: "b", buildParams: () => ({ y: 2 }) },
      ],
      render: () => "ok",
    };
    const hook = createShortcutRouterHook({
      shortcuts: [shortcut],
      executeTool: executor,
    });
    const result = await hook({ content: "/agg" });
    expect(result).toEqual({
      handled: true,
      text: "ok",
    });
    expect(calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
  });
});
