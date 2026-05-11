import { describe, it, expect, vi } from "vitest";
import { createCreateGithubIssueTool } from "./create-github-issue.js";
import { OpenClawHttpClient } from "./../http-client.js";
import type {
  MessagingService,
  ToolCallPreContext,
  ToolCallPostContext,
} from "./../sdk-types.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown) => { status?: number; body: unknown },
): OpenClawHttpClient {
  return new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body));
      const { status, body } = responder(parsed);
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
}

function makeMessaging(
  callbackData: string,
): MessagingService {
  const sentMessageId = "msg_001";
  return {
    send: vi.fn().mockResolvedValue({ messageId: sentMessageId }),
    waitForCallback: vi.fn().mockResolvedValue({ callbackData }),
  };
}

describe("create_github_issue — Variant A (native requiresConfirmation)", () => {
  it("registers tool with requiresConfirmation=true and no tool_call_pre hook", () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 1, title: "t" },
    }));
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "A",
      approvalCallbackTimeoutMs: 1000,
    });
    expect(parts.tool.requiresConfirmation).toBe(true);
    expect(parts.toolCallPreHook).toBeNull();
    expect(parts.toolCallPostHook).toBeDefined();
  });

  it("execute() forwards params to /write/create-github-issue and returns issue url", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return {
        body: {
          url: "https://github.com/Skords-01/sergeant/issues/42",
          number: 42,
          title: "Fix bug",
        },
      };
    });
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "user_x",
      variant: "A",
      approvalCallbackTimeoutMs: 1000,
    });

    const result = await parts.tool.execute("inv_1", {
      title: "Fix bug",
      body: "Stack trace …",
      labels: ["bug", "p1"],
    });
    expect(captured).toMatchObject({
      founderUserId: "user_x",
      title: "Fix bug",
      body: "Stack trace …",
      labels: ["bug", "p1"],
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/created issue #42/);
    expect(text).toMatch(/https:\/\/github\.com/);
  });

  it("tool_call_post records audit with approved decision on success", async () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 1, title: "t" },
    }));
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "A",
      approvalCallbackTimeoutMs: 1000,
      recordAudit,
    });

    const ctx: ToolCallPostContext = {
      invocationId: "inv_1",
      agentRunId: "run_1",
      toolName: "create_github_issue",
      params: { title: "x", body: "y" },
      result: {
        ok: true,
        result: { content: [{ type: "text", text: "ok" }] },
      },
      durationMs: 120,
    };
    await parts.toolCallPostHook(ctx);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationId: "inv_1",
        toolName: "create_github_issue",
        variant: "A",
        decision: expect.objectContaining({ status: "approved" }),
      }),
    );
  });
});

describe("create_github_issue — Variant B (custom hook + own UX)", () => {
  it("does NOT set requiresConfirmation; runs tool_call_pre with messaging", async () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 99, title: "t" },
    }));
    const messaging = makeMessaging("approve:inv_b1");
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "B",
      messaging,
      approvalCallbackTimeoutMs: 1000,
      recordAudit,
    });

    expect(parts.tool.requiresConfirmation).toBeUndefined();
    expect(parts.toolCallPreHook).not.toBeNull();

    const preCtx: ToolCallPreContext = {
      invocationId: "inv_b1",
      agentRunId: "run_b1",
      toolName: "create_github_issue",
      params: { title: "Fix", body: "stack" },
    };
    const preResult = await parts.toolCallPreHook!(preCtx);
    expect(preResult).toEqual({ ok: true });
    expect(messaging.send).toHaveBeenCalledTimes(1);
    expect(messaging.waitForCallback).toHaveBeenCalledWith("msg_001", {
      timeoutMs: 1000,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ status: "approved" }),
        variant: "B",
      }),
    );

    // Now execute() should pick up the approval state.
    const exec = await parts.tool.execute("inv_b1", {
      title: "Fix",
      body: "stack",
    });
    expect((exec.content[0] as { text: string }).text).toMatch(/created issue/);
  });

  it("blocks execute() with rejected=true when user clicks Reject", async () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 1, title: "t" },
    }));
    const messaging = makeMessaging("reject:inv_b2");
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "B",
      messaging,
      approvalCallbackTimeoutMs: 1000,
      recordAudit,
    });

    const preCtx: ToolCallPreContext = {
      invocationId: "inv_b2",
      agentRunId: "run_b2",
      toolName: "create_github_issue",
      params: { title: "x", body: "y" },
    };
    const preResult = await parts.toolCallPreHook!(preCtx);
    expect(preResult).toMatchObject({
      ok: false,
      status: "approval_rejected",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ status: "rejected" }),
      }),
    );

    const exec = await parts.tool.execute("inv_b2", {
      title: "x",
      body: "y",
    });
    expect(exec.rejected).toBe(true);
    expect((exec.content[0] as { text: string }).text).toMatch(
      /rejected \(variant B\)/,
    );
  });

  it("times out gracefully if waitForCallback rejects", async () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 1, title: "t" },
    }));
    const messaging: MessagingService = {
      send: vi.fn().mockResolvedValue({ messageId: "msg" }),
      waitForCallback: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "B",
      messaging,
      approvalCallbackTimeoutMs: 1000,
      recordAudit,
    });

    const preCtx: ToolCallPreContext = {
      invocationId: "inv_b3",
      agentRunId: "run_b3",
      toolName: "create_github_issue",
      params: { title: "x", body: "y" },
    };
    const preResult = await parts.toolCallPreHook!(preCtx);
    expect(preResult).toMatchObject({
      ok: false,
      status: "approval_rejected",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ status: "timeout" }),
      }),
    );
  });

  it("ignores non-target tools in tool_call_pre", async () => {
    const http = makeHttp(() => ({ body: {} }));
    const messaging = makeMessaging("approve:x");
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "B",
      messaging,
      approvalCallbackTimeoutMs: 1000,
    });

    const result = await parts.toolCallPreHook!({
      invocationId: "inv_x",
      agentRunId: "run_x",
      toolName: "recall_memory",
      params: {},
    });
    expect(result).toEqual({ ok: true });
    expect(messaging.send).not.toHaveBeenCalled();
  });
});

describe("create_github_issue — Variant C (hybrid: native + custom audit)", () => {
  it("sets requiresConfirmation=true and skips custom approval gate", () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 1, title: "t" },
    }));
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "C",
      approvalCallbackTimeoutMs: 1000,
    });
    expect(parts.tool.requiresConfirmation).toBe(true);
    expect(parts.toolCallPreHook).toBeNull();
  });

  it("tool_call_post audits both success and failure outcomes", async () => {
    const http = makeHttp(() => ({
      body: { url: "https://gh/x", number: 1, title: "t" },
    }));
    const recordAudit = vi.fn().mockResolvedValue(undefined);
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "C",
      approvalCallbackTimeoutMs: 1000,
      recordAudit,
    });

    const success: ToolCallPostContext = {
      invocationId: "inv_c1",
      agentRunId: "run_c1",
      toolName: "create_github_issue",
      params: { title: "x", body: "y" },
      result: {
        ok: true,
        result: { content: [{ type: "text", text: "ok" }] },
      },
      durationMs: 100,
    };
    await parts.toolCallPostHook(success);

    const fail: ToolCallPostContext = {
      invocationId: "inv_c2",
      agentRunId: "run_c2",
      toolName: "create_github_issue",
      params: { title: "x", body: "y" },
      result: { ok: false, error: "API rate limit" },
      durationMs: 50,
    };
    await parts.toolCallPostHook(fail);

    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        decision: expect.objectContaining({ status: "approved" }),
        variant: "C",
      }),
    );
    expect(recordAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        decision: expect.objectContaining({
          status: "rejected",
          reason: "API rate limit",
        }),
      }),
    );
  });
});

describe("create_github_issue — error handling", () => {
  it("surfaces server errors as text result without throwing", async () => {
    const http = makeHttp(() => ({
      status: 500,
      body: { error: "internal" },
    }));
    const parts = createCreateGithubIssueTool({
      http,
      founderUserId: "u",
      variant: "A",
      approvalCallbackTimeoutMs: 1000,
    });
    const result = await parts.tool.execute("inv_1", {
      title: "x",
      body: "y",
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/HTTP 500/);
  });
});
