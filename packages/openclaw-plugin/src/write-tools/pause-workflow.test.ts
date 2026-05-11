import { describe, it, expect, vi } from "vitest";
import { createPauseWorkflowTool } from "./pause-workflow.js";
import type { WriteToolFactoryOptions } from "./write-tool-factory.js";

function makeOpts(
  postMock?: ReturnType<typeof vi.fn>,
): WriteToolFactoryOptions {
  return {
    http: {
      post:
        postMock ??
        vi.fn().mockResolvedValue({
          status: "paused",
          workflowId: "wf-123",
          name: "Daily Digest",
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

describe("pause_workflow", () => {
  it("creates tool with correct name", () => {
    const parts = createPauseWorkflowTool(makeOpts());
    expect(parts.tool.name).toBe("pause_workflow");
    expect(parts.tool.optional).toBe(true);
  });

  it("formats paused result with name", async () => {
    const parts = createPauseWorkflowTool(makeOpts());

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "pause_workflow",
      params: { workflowId: "wf-123" },
    });

    const result = await parts.tool.execute("inv-1", {
      workflowId: "wf-123",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Daily Digest");
    expect(text).toContain("paused");
  });

  it("handles already_inactive status", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "already_inactive",
      workflowId: "wf-123",
      name: "Old Workflow",
    });
    const parts = createPauseWorkflowTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "pause_workflow",
      params: { workflowId: "wf-123" },
    });

    const result = await parts.tool.execute("inv-1", {
      workflowId: "wf-123",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("already inactive");
  });

  it("handles not_found status", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "not_found",
      workflowId: "wf-999",
    });
    const parts = createPauseWorkflowTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "pause_workflow",
      params: { workflowId: "wf-999" },
    });

    const result = await parts.tool.execute("inv-1", {
      workflowId: "wf-999",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("not found");
  });
});
