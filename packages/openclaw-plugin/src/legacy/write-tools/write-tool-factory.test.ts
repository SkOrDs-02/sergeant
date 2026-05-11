/**
 * Tests for the shared write-tool factory (Variant B approval + audit).
 */

import { describe, it, expect, vi } from "vitest";
import {
  createWriteTool,
  type WriteToolSpec,
  type WriteToolFactoryOptions,
} from "./write-tool-factory.js";
import { z } from "zod";

const TestParamsSchema = z.object({
  name: z.string(),
});
type TestParams = z.infer<typeof TestParamsSchema>;

interface TestResponse {
  id: number;
  label: string;
}

const testSpec: WriteToolSpec<TestParams, TestResponse> = {
  name: "test_write_tool",
  description: "A test write tool",
  parameters: TestParamsSchema,
  endpoint: "/write/test",
  buildBody: (params, founderUserId) => ({
    name: params.name,
    founderUserId,
  }),
  formatSuccess: (response) => ({
    content: [
      { type: "text", text: `ok: ${response.label} (#${response.id})` },
      { type: "structured", data: response },
    ],
  }),
};

function makeOpts(
  overrides?: Partial<WriteToolFactoryOptions>,
): WriteToolFactoryOptions {
  return {
    http: {
      post: vi.fn().mockResolvedValue({ id: 1, label: "test-result" }),
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
    log: vi.fn(),
    ...overrides,
  };
}

describe("createWriteTool (factory)", () => {
  it("creates tool with correct name and optional flag", () => {
    const parts = createWriteTool(testSpec, makeOpts());
    expect(parts.tool.name).toBe("test_write_tool");
    expect(parts.tool.optional).toBe(true);
  });

  it("Variant B: tool_call_pre hook is non-null", () => {
    const parts = createWriteTool(testSpec, makeOpts({ variant: "B" }));
    expect(parts.toolCallPreHook).not.toBeNull();
  });

  it("Variant A: tool_call_pre hook is null, requiresConfirmation is true", () => {
    const parts = createWriteTool(testSpec, makeOpts({ variant: "A" }));
    expect(parts.toolCallPreHook).toBeNull();
    expect(parts.tool.requiresConfirmation).toBe(true);
  });

  it("Variant B: pre-hook sends messaging + waits for callback", async () => {
    const opts = makeOpts();
    const parts = createWriteTool(testSpec, opts);

    const result = await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "test_write_tool",
      params: { name: "hello" },
    });

    expect(result.ok).toBe(true);
    expect(opts.messaging!.send).toHaveBeenCalled();
    expect(opts.messaging!.waitForCallback).toHaveBeenCalled();
  });

  it("Variant B: pre-hook skips non-matching tool names", async () => {
    const parts = createWriteTool(testSpec, makeOpts());

    const result = await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "other_tool",
      params: {},
    });

    expect(result.ok).toBe(true);
  });

  it("Variant B: execute succeeds after approval", async () => {
    const parts = createWriteTool(testSpec, makeOpts());

    // Pre-hook sets approval state
    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "test_write_tool",
      params: { name: "hello" },
    });

    // Execute uses the approval state
    const result = await parts.tool.execute("inv-1", { name: "hello" });
    expect(result.content[0]!.type).toBe("text");
    expect(
      (result.content[0] as { type: "text"; text: string }).text,
    ).toContain("ok:");
  });

  it("Variant B: execute fails without prior approval", async () => {
    const parts = createWriteTool(testSpec, makeOpts());

    const result = await parts.tool.execute("inv-1", { name: "hello" });
    expect(result.rejected).toBe(true);
    expect(
      (result.content[0] as { type: "text"; text: string }).text,
    ).toContain("rejected");
  });

  it("Variant B: rejection callback blocks execute", async () => {
    const opts = makeOpts({
      messaging: {
        send: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
        waitForCallback: vi
          .fn()
          .mockResolvedValue({ callbackData: "reject:inv-1" }),
      },
    });
    const parts = createWriteTool(testSpec, opts);

    const preResult = await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "test_write_tool",
      params: { name: "hello" },
    });

    expect(preResult.ok).toBe(false);
  });

  it("audit sink is called on approval and execution", async () => {
    const auditSink = vi.fn().mockResolvedValue(undefined);
    const parts = createWriteTool(testSpec, makeOpts({ auditSink }));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "test_write_tool",
      params: { name: "hello" },
    });

    // Audit called for approval
    expect(auditSink).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approved",
        tool: "test_write_tool",
      }),
    );

    await parts.tool.execute("inv-1", { name: "hello" });

    // Audit called for execution
    expect(auditSink).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "executed",
        tool: "test_write_tool",
      }),
    );
  });

  it("audit sink failure does not block execution", async () => {
    const auditSink = vi.fn().mockRejectedValue(new Error("audit down"));
    const parts = createWriteTool(testSpec, makeOpts({ auditSink }));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "test_write_tool",
      params: { name: "hello" },
    });

    // Execute should still succeed despite audit failure
    const result = await parts.tool.execute("inv-1", { name: "hello" });
    expect(result.content[0]!.type).toBe("text");
    expect(
      (result.content[0] as { type: "text"; text: string }).text,
    ).toContain("ok:");
  });
});
