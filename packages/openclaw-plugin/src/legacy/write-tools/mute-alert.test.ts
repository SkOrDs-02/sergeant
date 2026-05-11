import { describe, it, expect, vi } from "vitest";
import { createMuteAlertTool } from "./mute-alert.js";
import type { WriteToolFactoryOptions } from "./write-tool-factory.js";

function makeOpts(
  postMock?: ReturnType<typeof vi.fn>,
): WriteToolFactoryOptions {
  return {
    http: {
      post:
        postMock ??
        vi.fn().mockResolvedValue({
          status: "muted",
          issueId: "SENTRY-123",
          mutedUntil: "2026-06-01T00:00:00+03:00",
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

describe("mute_alert", () => {
  it("creates tool with correct name", () => {
    const parts = createMuteAlertTool(makeOpts());
    expect(parts.tool.name).toBe("mute_alert");
    expect(parts.tool.optional).toBe(true);
  });

  it("formats muted result with until date", async () => {
    const parts = createMuteAlertTool(makeOpts());

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "mute_alert",
      params: { issueId: "SENTRY-123", untilIso: "2026-06-01T00:00:00+03:00" },
    });

    const result = await parts.tool.execute("inv-1", {
      issueId: "SENTRY-123",
      untilIso: "2026-06-01T00:00:00+03:00",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("SENTRY-123");
    expect(text).toContain("muted");
    expect(text).toContain("until");
  });

  it("handles indefinite mute (no untilIso)", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "muted",
      issueId: "SENTRY-456",
    });
    const parts = createMuteAlertTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "mute_alert",
      params: { issueId: "SENTRY-456" },
    });

    const result = await parts.tool.execute("inv-1", {
      issueId: "SENTRY-456",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("indefinitely");
  });

  it("handles not_configured response", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "not_configured",
      issueId: "X",
    });
    const parts = createMuteAlertTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "mute_alert",
      params: { issueId: "X" },
    });

    const result = await parts.tool.execute("inv-1", {
      issueId: "X",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("not configured");
  });

  it("handles already_muted status", async () => {
    const mock = vi.fn().mockResolvedValue({
      status: "already_muted",
      issueId: "SENTRY-789",
      mutedUntil: "2026-07-01T00:00:00Z",
    });
    const parts = createMuteAlertTool(makeOpts(mock));

    await parts.toolCallPreHook!({
      invocationId: "inv-1",
      agentRunId: "run-1",
      founderUserId: "user_test",
      toolName: "mute_alert",
      params: { issueId: "SENTRY-789" },
    });

    const result = await parts.tool.execute("inv-1", {
      issueId: "SENTRY-789",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("already muted");
  });
});
