/**
 * Unit tests for `classifyMessage` + `parseClassification` (Stage 4c).
 *
 * Wrapper-call (`anthropicMessages`) is mocked; we cover both happy paths
 * (valid JSON, markdown-fenced JSON, partial fields) and resilience
 * fallbacks (parse errors → `{ class: "chat" }`, upstream not-ok → throw).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicMessagesMock } = vi.hoisted(() => ({
  anthropicMessagesMock: vi.fn(),
}));

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: anthropicMessagesMock,
}));

const { classifyMessage, parseClassification } = await import("./classify.js");

function makeResponse(text: string, ok = true, status = 200) {
  return {
    response: { ok, status } as Response,
    data: {
      content: [{ type: "text", text }],
    } as unknown as Record<string, unknown>,
  };
}

describe("parseClassification", () => {
  it("accepts a plain JSON object with all fields", () => {
    const raw = JSON.stringify({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: { window: "7d" },
      chat_response: null,
    });
    expect(parseClassification(raw)).toEqual({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: { window: "7d" },
      chat_response: null,
    });
  });

  it("strips markdown ```json fencing before parsing", () => {
    const raw = '```json\n{"class":"chat","chat_response":"Привіт"}\n```';
    expect(parseClassification(raw)).toEqual({
      class: "chat",
      chat_response: "Привіт",
    });
  });

  it("falls back to chat when class is unknown", () => {
    const raw = JSON.stringify({ class: "??what??" });
    expect(parseClassification(raw)).toEqual({ class: "chat" });
  });

  it("falls back to chat on garbage input", () => {
    expect(parseClassification("not json at all")).toEqual({ class: "chat" });
    expect(parseClassification("")).toEqual({ class: "chat" });
    expect(parseClassification("{")).toEqual({ class: "chat" });
  });

  it("falls back to chat when payload is an array", () => {
    expect(parseClassification("[1,2,3]")).toEqual({ class: "chat" });
  });

  it("retains thinking class with persona suggestion", () => {
    const raw = JSON.stringify({
      class: "thinking",
      persona: "eng",
      shortcut: null,
    });
    expect(parseClassification(raw)).toEqual({
      class: "thinking",
      persona: "eng",
      shortcut: null,
    });
  });

  it("ignores non-string shortcut / persona values", () => {
    const raw = JSON.stringify({
      class: "routine_recall",
      shortcut: 42,
      persona: { not: "a string" },
    });
    expect(parseClassification(raw)).toEqual({ class: "routine_recall" });
  });

  it("preserves explicit null fields", () => {
    const raw = JSON.stringify({
      class: "chat",
      shortcut: null,
      persona: null,
      params: null,
      chat_response: null,
    });
    expect(parseClassification(raw)).toEqual({
      class: "chat",
      shortcut: null,
      persona: null,
      params: null,
      chat_response: null,
    });
  });
});

describe("classifyMessage", () => {
  beforeEach(() => {
    anthropicMessagesMock.mockReset();
  });

  it("uses the default system prompt when none provided", async () => {
    anthropicMessagesMock.mockResolvedValueOnce(
      makeResponse(JSON.stringify({ class: "chat", chat_response: "ok" })),
    );

    const result = await classifyMessage({ userMessage: "Привіт" }, "key");

    expect(result).toEqual({ class: "chat", chat_response: "ok" });
    expect(anthropicMessagesMock).toHaveBeenCalledTimes(1);
    const callArgs = anthropicMessagesMock.mock.calls[0];
    expect(callArgs?.[0]).toBe("key");
    expect(callArgs?.[1]).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
    });
    // Default prompt is the Ukrainian classifier instructions.
    expect(callArgs?.[1]?.system).toContain("Класифікуй message");
  });

  it("uses the override system prompt when provided", async () => {
    anthropicMessagesMock.mockResolvedValueOnce(
      makeResponse(JSON.stringify({ class: "thinking" })),
    );

    await classifyMessage(
      { userMessage: "Test", systemPrompt: "CUSTOM PROMPT" },
      "key",
    );

    expect(anthropicMessagesMock.mock.calls[0]?.[1]?.system).toBe(
      "CUSTOM PROMPT",
    );
  });

  it("throws when userMessage is empty/whitespace", async () => {
    await expect(classifyMessage({ userMessage: "  " }, "key")).rejects.toThrow(
      /userMessage is required/,
    );
    expect(anthropicMessagesMock).not.toHaveBeenCalled();
  });

  it("throws when upstream returns non-ok", async () => {
    anthropicMessagesMock.mockResolvedValueOnce(makeResponse("", false, 503));

    await expect(classifyMessage({ userMessage: "hi" }, "key")).rejects.toThrow(
      /upstream not ok \(status=503\)/,
    );
  });

  it("falls back to { class: chat } on missing content (parse fallback)", async () => {
    anthropicMessagesMock.mockResolvedValueOnce({
      response: { ok: true, status: 200 } as Response,
      data: {} as Record<string, unknown>,
    });

    const result = await classifyMessage({ userMessage: "hi" }, "key");
    expect(result).toEqual({ class: "chat" });
  });
});
