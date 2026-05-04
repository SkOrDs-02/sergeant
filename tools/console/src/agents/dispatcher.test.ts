import { describe, expect, it } from "vitest";
import {
  buildDispatcherPayload,
  classifyDispatcherCommand,
  formatApprovalPrompt,
  requiresApproval,
  shouldDelegateOpenClawToAgentNetwork,
} from "./dispatcher.js";

describe("dispatcher command payloads", () => {
  it("classifies read-only status commands", () => {
    expect(classifyDispatcherCommand("status agents")).toEqual({
      action: "status",
      specialist: "qa-release",
      riskTier: "P2",
      mode: "read-only",
      requiresApproval: false,
    });
  });

  it("classifies mutating deploy approvals as approval-gated", () => {
    expect(classifyDispatcherCommand("approve deploy railway")).toEqual({
      action: "approve",
      specialist: "security",
      riskTier: "P0",
      mode: "mutation",
      requiresApproval: true,
    });
  });

  it("routes web-ui assignment to the web specialist", () => {
    expect(
      classifyDispatcherCommand("assign web-ui improve budget screen"),
    ).toEqual({
      action: "assign",
      specialist: "web-ui",
      riskTier: "P1",
      mode: "mutation",
      requiresApproval: true,
    });
  });

  it("builds a stable n8n dispatcher payload", () => {
    expect(
      buildDispatcherPayload({
        taskId: "agent-test-1",
        commandText: "review pr 123",
        telegramUserId: 42,
        telegramChatId: -100,
        messageId: 77,
      }),
    ).toEqual({
      taskId: "agent-test-1",
      source: "telegram-console",
      commandText: "review pr 123",
      intent: {
        rawText: "review pr 123",
        normalizedText: "review pr 123",
      },
      action: "review",
      specialist: "repo-architect",
      riskTier: "P2",
      mode: "read-only",
      requiresApproval: false,
      actor: {
        type: "telegram",
        telegramUserId: 42,
      },
      telegram: {
        userId: 42,
        chatId: -100,
        messageId: 77,
      },
      statusCallback: {
        channel: "telegram-chat",
        chatId: -100,
        messageId: 77,
      },
      artifacts: [],
    });
  });

  it("builds OpenClaw-originated envelopes with DM status callbacks", () => {
    const payload = buildDispatcherPayload({
      taskId: "agent-openclaw-1",
      source: "openclaw",
      commandText: "review ci",
      telegramUserId: 42,
      telegramChatId: 42,
      messageId: 78,
    });
    expect(payload).toMatchObject({
      taskId: "agent-openclaw-1",
      source: "openclaw",
      actor: { type: "telegram", telegramUserId: 42 },
      statusCallback: {
        channel: "telegram-dm",
        chatId: 42,
        messageId: 78,
      },
      artifacts: [],
    });
  });

  it("treats production writes as approval-gated", () => {
    expect(requiresApproval("run db migration")).toBe(true);
    expect(requiresApproval("plan release risks")).toBe(false);
    expect(requiresApproval("logs railway api")).toBe(false);
  });

  it("adds approval ids to mutation prompts without treating source as permission", () => {
    const payload = buildDispatcherPayload({
      taskId: "agent-risky-1",
      source: "openclaw",
      approvalId: "approval-123",
      commandText: "run db migration",
      telegramUserId: 42,
      telegramChatId: 42,
      messageId: 79,
    });
    expect(payload.requiresApproval).toBe(true);
    expect(payload.approvalId).toBe("approval-123");
    expect(formatApprovalPrompt(payload)).toContain("Approval: approval-123");
  });

  it("detects OpenClaw messages that should go to the agent network", () => {
    expect(shouldDelegateOpenClawToAgentNetwork("перевір CI і дай план")).toBe(
      true,
    );
    expect(shouldDelegateOpenClawToAgentNetwork("створи GitHub issue")).toBe(
      true,
    );
    expect(
      shouldDelegateOpenClawToAgentNetwork("що думаєш про позиціонування"),
    ).toBe(false);
  });
});
