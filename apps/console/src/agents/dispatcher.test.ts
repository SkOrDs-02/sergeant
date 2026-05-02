import { describe, expect, it } from "vitest";
import {
  buildDispatcherPayload,
  classifyDispatcherCommand,
  requiresApproval,
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
        commandText: "review pr 123",
        telegramUserId: 42,
        telegramChatId: -100,
        messageId: 77,
      }),
    ).toEqual({
      source: "telegram-console",
      commandText: "review pr 123",
      action: "review",
      specialist: "repo-architect",
      riskTier: "P2",
      mode: "read-only",
      requiresApproval: false,
      telegram: {
        userId: 42,
        chatId: -100,
        messageId: 77,
      },
    });
  });

  it("can mark OpenClaw as the dispatcher source", () => {
    expect(
      buildDispatcherPayload({
        source: "openclaw",
        commandText: "review ci",
        telegramUserId: 42,
        telegramChatId: 42,
        messageId: 78,
      }).source,
    ).toBe("openclaw");
  });

  it("treats production writes as approval-gated", () => {
    expect(requiresApproval("run db migration")).toBe(true);
    expect(requiresApproval("logs railway api")).toBe(false);
  });
});
