import { describe, it, expect, vi } from "vitest";
import { createCommitToStrategyDocTool } from "./commit-to-strategy-doc.js";
import type { WriteToolFactoryOptions } from "./write-tool-factory.js";

function makeOpts(
  postMock?: ReturnType<typeof vi.fn>,
): WriteToolFactoryOptions {
  return {
    http: {
      post:
        postMock ??
        vi.fn().mockResolvedValue({
          sha: "abc1234567890",
          url: "https://github.com/Skords-01/strategy-docs/blob/main/notes/retro.md",
          path: "notes/retro.md",
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

describe("commit_to_strategy_doc", () => {
  it("creates tool with correct name", () => {
    const parts = createCommitToStrategyDocTool(makeOpts());
    expect(parts.tool.name).toBe("commit_to_strategy_doc");
    expect(parts.tool.optional).toBe(true);
  });

  it("formats success result with sha and url", async () => {
    const parts = createCommitToStrategyDocTool(makeOpts());

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "commit_to_strategy_doc",
      params: {
        path: "notes/retro.md",
        content: "# Retro",
        message: "add retro",
      },
    });

    const result = await parts.tool.execute("inv-1", {
      path: "notes/retro.md",
      content: "# Retro",
      message: "add retro",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("committed");
    expect(text).toContain("abc1234");
  });

  it("handles not_configured response", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "not_configured",
      sha: "",
      url: "",
      path: "",
    });
    const parts = createCommitToStrategyDocTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "commit_to_strategy_doc",
      params: { path: "x", content: "y", message: "z" },
    });

    const result = await parts.tool.execute("inv-1", {
      path: "x",
      content: "y",
      message: "z",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("not configured");
  });
});
