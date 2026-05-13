import { describe, expect, it } from "vitest";
import {
  buildDispatcherPayload,
  classifyDispatcherCommand,
  dispatchToN8n,
  formatApprovalPrompt,
  formatSkillStatusLine,
  getGoverningSkill,
  requiresApproval,
  shouldDelegateOpenClawToAgentNetwork,
  SPECIALIST_SKILL_MAP,
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

describe("specialist → skill mapping", () => {
  it("maps web-ui to sergeant-web-ui", () => {
    expect(getGoverningSkill("web-ui")).toBe("sergeant-web-ui");
  });

  it("maps the 1:1 specialists to their canonical skills", () => {
    expect(getGoverningSkill("server-api")).toBe("sergeant-server-api");
    expect(getGoverningSkill("data-migrations")).toBe(
      "sergeant-data-and-migrations",
    );
    expect(getGoverningSkill("mobile")).toBe("sergeant-mobile-expo");
    expect(getGoverningSkill("hubchat-ai")).toBe("sergeant-hubchat");
    expect(getGoverningSkill("repo-architect")).toBe(
      "sergeant-monorepo-boundaries",
    );
    expect(getGoverningSkill("qa-release")).toBe(
      "sergeant-deploy-and-observability",
    );
    expect(getGoverningSkill("security")).toBe("better-auth-best-practices");
  });

  it("falls back to sergeant-start-here for product-roadmap", () => {
    // The mapping table treats `product-roadmap` as «extra» but routes via
    // sergeant-start-here, so the runtime mirror returns the same.
    expect(getGoverningSkill("product-roadmap")).toBe("sergeant-start-here");
  });

  it("returns null for specialists with no dedicated skill", () => {
    expect(getGoverningSkill("n8n-automation")).toBeNull();
    expect(getGoverningSkill("growth-marketing")).toBeNull();
  });

  it("covers every SpecialistAgent value (no missing entries)", () => {
    // Spot-check a representative set; the explicit cast catches new
    // SpecialistAgent additions at compile time.
    const specialists: Array<keyof typeof SPECIALIST_SKILL_MAP> = [
      "product-roadmap",
      "repo-architect",
      "web-ui",
      "server-api",
      "data-migrations",
      "mobile",
      "hubchat-ai",
      "n8n-automation",
      "growth-marketing",
      "qa-release",
      "security",
    ];
    expect(Object.keys(SPECIALIST_SKILL_MAP).sort()).toEqual(
      specialists.slice().sort(),
    );
  });

  it("formatSkillStatusLine renders sergeant-web-ui for /assign web-ui", () => {
    expect(formatSkillStatusLine("web-ui")).toBe(
      "Loading skill: `sergeant-web-ui`",
    );
  });

  it("formatSkillStatusLine renders a fallback note when no skill exists", () => {
    const line = formatSkillStatusLine("n8n-automation");
    expect(line).toContain("Loading skill:");
    expect(line).toContain("docs/agents/specialists-mapping.md");
  });
});

describe("Telegram status callback rendering", () => {
  it("formatApprovalPrompt includes the «Loading skill: …» line", () => {
    const payload = buildDispatcherPayload({
      taskId: "agent-test-2",
      commandText: "assign web-ui improve budget screen",
      telegramUserId: 42,
      telegramChatId: -100,
      messageId: 77,
    });
    const prompt = formatApprovalPrompt(payload);
    expect(prompt).toContain("Specialist: web-ui");
    expect(prompt).toContain("Loading skill: `sergeant-web-ui`");
  });

  it("dispatchToN8n falls back with the skill line when no webhook is configured", async () => {
    const payload = buildDispatcherPayload({
      taskId: "agent-test-3",
      commandText: "assign web-ui ship onboarding wizard",
      telegramUserId: 42,
      telegramChatId: -100,
      messageId: 77,
    });
    const out = await dispatchToN8n(payload, {
      // Empty env — no webhook.
    } as NodeJS.ProcessEnv);
    expect(out).toContain("n8n dispatcher webhook is not configured.");
    expect(out).toContain("Loading skill: `sergeant-web-ui`");
  });

  it("dispatchToN8n prefixes the n8n response with the skill line", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Queued task agent-xyz123", {
        status: 200,
      })) as typeof fetch;
    try {
      const payload = buildDispatcherPayload({
        taskId: "agent-test-4",
        commandText: "assign server-api add /finyk/snapshots endpoint",
        telegramUserId: 42,
        telegramChatId: -100,
        messageId: 77,
      });
      const out = await dispatchToN8n(payload, {
        N8N_AGENT_DISPATCHER_WEBHOOK_URL: "https://example.invalid/webhook",
      } as NodeJS.ProcessEnv);
      const lines = out.split("\n");
      expect(lines[0]).toBe("Loading skill: `sergeant-server-api`");
      expect(lines[1]).toBe("Queued task agent-xyz123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
