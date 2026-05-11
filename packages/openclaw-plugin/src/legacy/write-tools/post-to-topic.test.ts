import { describe, it, expect, vi } from "vitest";
import { createPostToTopicTool } from "./post-to-topic.js";
import type { WriteToolFactoryOptions } from "./write-tool-factory.js";

function makeOpts(
  postMock?: ReturnType<typeof vi.fn>,
): WriteToolFactoryOptions {
  return {
    http: {
      post:
        postMock ??
        vi.fn().mockResolvedValue({
          status: "posted",
          messageId: 42,
        }),
      get: vi.fn(),
      baseUrl: "http://localhost:3000/api/internal/openclaw",
    } as unknown as WriteToolFactoryOptions["http"],
    founderUserId: "user_test",
    variant: "B",
    messaging: {
      send: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
      waitForCallback: vi
        .fn()
        .mockResolvedValue({ callbackData: "approve:inv-1" }),
    },
    approvalCallbackTimeoutMs: 5000,
  };
}

describe("post_to_topic", () => {
  it("creates tool with correct name", () => {
    const parts = createPostToTopicTool(makeOpts());
    expect(parts.tool.name).toBe("post_to_topic");
    expect(parts.tool.optional).toBe(true);
  });

  it("formats posted result", async () => {
    const parts = createPostToTopicTool(makeOpts());

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "post_to_topic",
      params: { topic: "product", text: "update" },
    });

    const result = await parts.tool.execute("inv-1", {
      topic: "product",
      text: "Daily update",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("posted");
    expect(text).toContain("42");
  });

  it("handles not_configured response", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "not_configured",
    });
    const parts = createPostToTopicTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "post_to_topic",
      params: { topic: "x", text: "y" },
    });

    const result = await parts.tool.execute("inv-1", {
      topic: "x",
      text: "y",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("not configured");
  });

  it("handles error response", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "error",
      error: "channel not found",
    });
    const parts = createPostToTopicTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "post_to_topic",
      params: { topic: "x", text: "y" },
    });

    const result = await parts.tool.execute("inv-1", {
      topic: "x",
      text: "y",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("channel not found");
  });
});
