/**
 * Integration smoke test for the plugin entry — стандартний sanity check
 * that `createOpenClawPlugin(api, configJson)` registers all expected
 * tools + hooks with a stub PluginApi.
 *
 * Не lift-ить реальний OpenClaw runtime; натомість використовує stub
 * api, який лише records calls. Це дозволяє Phase 0.5 PoC валідувати
 * shape SDK-contract-у без зовнішніх залежностей.
 */

import { describe, it, expect, vi } from "vitest";
import { createOpenClawPlugin } from "./index.js";
import type {
  PluginApi,
  ToolDefinition,
  HookHandler,
  HookName,
} from "./sdk-types.js";

const VALID_API_KEY = "x".repeat(32);
const CONFIG = JSON.stringify({
  serverInternalUrl: "http://localhost:3000",
  internalApiKey: VALID_API_KEY,
  founderUserId: "user_test",
  maxPerCallUsd: 0.5,
});

interface StubApi extends PluginApi {
  registeredTools: ToolDefinition<unknown>[];
  registeredHooks: Map<HookName, HookHandler<HookName>[]>;
}

function makeStubApi(): StubApi {
  const tools: ToolDefinition<unknown>[] = [];
  const hooks = new Map<HookName, HookHandler<HookName>[]>();

  return {
    registeredTools: tools,
    registeredHooks: hooks,
    registerTool: <TParams>(tool: ToolDefinition<TParams>) => {
      tools.push(tool as unknown as ToolDefinition<unknown>);
    },
    registerHook: <H extends HookName>(name: H, handler: HookHandler<H>) => {
      const list = hooks.get(name) ?? [];
      list.push(handler as HookHandler<HookName>);
      hooks.set(name, list);
    },
    services: {
      messaging: {
        send: vi.fn().mockResolvedValue({ messageId: "msg" }),
        waitForCallback: vi
          .fn()
          .mockResolvedValue({ callbackData: "approve:x" }),
      },
      runtime: {
        now: () => Date.now(),
        log: vi.fn(),
      },
    },
  };
}

describe("createOpenClawPlugin", () => {
  it("registers recall_memory + create_github_issue tools", () => {
    const api = makeStubApi();
    const plugin = createOpenClawPlugin(api, CONFIG);
    expect(plugin.name).toBe("@sergeant/openclaw-plugin");

    const names = api.registeredTools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_github_issue",
      "get_github_releases",
      "get_posthog_stats",
      "get_sentry_issues",
      "get_server_stats",
      "get_stripe_metrics",
      "query_app_db",
      "read_github",
      "read_strategy_docs",
      "read_telegram_topic",
      "read_workflow_logs",
      "recall_memory",
      "record_decision",
    ]);
  });

  it("registers llm_input + agent_turn_start + agent_turn_end + tool_call_post hooks (Variant B default)", () => {
    const api = makeStubApi();
    createOpenClawPlugin(api, CONFIG);

    const hookNames = Array.from(api.registeredHooks.keys()).sort();
    // Variant B (default) додає tool_call_pre + tool_call_post.
    expect(hookNames).toContain("llm_input");
    expect(hookNames).toContain("agent_turn_start");
    expect(hookNames).toContain("agent_turn_end");
    expect(hookNames).toContain("tool_call_pre");
    expect(hookNames).toContain("tool_call_post");
  });

  it("uses Variant A → no tool_call_pre, native requiresConfirmation on write tool", () => {
    const api = makeStubApi();
    const config = JSON.stringify({
      serverInternalUrl: "http://localhost:3000",
      internalApiKey: VALID_API_KEY,
      founderUserId: "user_test",
      approvalVariant: "A",
    });
    createOpenClawPlugin(api, config);

    const hookNames = Array.from(api.registeredHooks.keys());
    expect(hookNames).not.toContain("tool_call_pre");
    expect(hookNames).toContain("tool_call_post");

    const writeTool = api.registeredTools.find(
      (t) => t.name === "create_github_issue",
    );
    expect(writeTool?.requiresConfirmation).toBe(true);
  });

  it("uses Variant C → native requiresConfirmation, no tool_call_pre, but tool_call_post audit", () => {
    const api = makeStubApi();
    const config = JSON.stringify({
      serverInternalUrl: "http://localhost:3000",
      internalApiKey: VALID_API_KEY,
      founderUserId: "user_test",
      approvalVariant: "C",
    });
    createOpenClawPlugin(api, config);

    const writeTool = api.registeredTools.find(
      (t) => t.name === "create_github_issue",
    );
    expect(writeTool?.requiresConfirmation).toBe(true);

    expect(Array.from(api.registeredHooks.keys())).toContain("tool_call_post");
  });

  it("dispose clears in-memory correlator state", () => {
    const api = makeStubApi();
    const plugin = createOpenClawPlugin(api, CONFIG);
    expect(typeof plugin.dispose).toBe("function");
    plugin.dispose?.();
  });

  it("rejects plugins with invalid config JSON", () => {
    const api = makeStubApi();
    expect(() => createOpenClawPlugin(api, "not-json")).toThrow();
  });
});
