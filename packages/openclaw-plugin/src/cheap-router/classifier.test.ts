/**
 * Unit tests for `HttpCheapRouterClassifier` — verifies POST shape,
 * systemPrompt forwarding, response normalisation, and the fail-closed
 * `{ class: "thinking" }` fallback on HTTP errors.
 */

import { describe, expect, it, vi } from "vitest";

import type { OpenClawHttpClient } from "../http-client.js";
import { HttpCheapRouterClassifier } from "./classifier.js";

function makeHttpStub(post: ReturnType<typeof vi.fn>): OpenClawHttpClient {
  return { post } as unknown as OpenClawHttpClient;
}

describe("HttpCheapRouterClassifier.classify", () => {
  it("POSTs /classify with userMessage when no systemPrompt", async () => {
    const post = vi.fn().mockResolvedValue({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });
    const classifier = new HttpCheapRouterClassifier({
      http: makeHttpStub(post),
    });

    const result = await classifier.classify("як з MRR?");

    expect(post).toHaveBeenCalledWith("/classify", {
      userMessage: "як з MRR?",
    });
    expect(result).toEqual({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });
  });

  it("forwards systemPrompt when provided", async () => {
    const post = vi.fn().mockResolvedValue({ class: "chat" });
    const classifier = new HttpCheapRouterClassifier({
      http: makeHttpStub(post),
      systemPrompt: "CUSTOM",
    });

    await classifier.classify("hi");

    expect(post).toHaveBeenCalledWith("/classify", {
      userMessage: "hi",
      systemPrompt: "CUSTOM",
    });
  });

  it("preserves all known fields incl. params object and chat_response", async () => {
    const post = vi.fn().mockResolvedValue({
      class: "chat",
      shortcut: null,
      persona: null,
      params: null,
      chat_response: "Привіт",
    });
    const classifier = new HttpCheapRouterClassifier({
      http: makeHttpStub(post),
    });

    const result = await classifier.classify("привіт");
    expect(result).toEqual({
      class: "chat",
      shortcut: null,
      persona: null,
      params: null,
      chat_response: "Привіт",
    });
  });

  it("coerces unknown class to thinking (defensive normalisation)", async () => {
    const post = vi.fn().mockResolvedValue({ class: "weird_new_class" });
    const classifier = new HttpCheapRouterClassifier({
      http: makeHttpStub(post),
    });

    const result = await classifier.classify("test");
    expect(result.class).toBe("thinking");
  });

  it("ignores non-object params shapes", async () => {
    const post = vi.fn().mockResolvedValue({
      class: "routine_recall",
      params: "should-be-object",
    });
    const classifier = new HttpCheapRouterClassifier({
      http: makeHttpStub(post),
    });

    const result = await classifier.classify("recall");
    expect(result.class).toBe("routine_recall");
    expect(result.params).toBeUndefined();
  });

  it("returns fail-closed { class: thinking } when http.post throws", async () => {
    const post = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const logSpy = vi.fn();
    const classifier = new HttpCheapRouterClassifier({
      http: makeHttpStub(post),
      log: logSpy,
    });

    const result = await classifier.classify("hi");
    expect(result).toEqual({ class: "thinking" });
    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "openclaw.cheap_router.classify_error",
      expect.objectContaining({ error: "ECONNRESET" }),
    );
  });
});
