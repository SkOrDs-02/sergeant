/**
 * Unit tests for `createCheapRouterHook` — verifies dispatch logic per
 * classification class, slash-command skip, classifier-error fallback,
 * unknown-shortcut handling, and Layer 2 passthrough for `thinking`.
 */

import type { PluginHookBeforeDispatchEvent } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it, vi } from "vitest";

import type {
  CheapRouterClassification,
  CheapRouterClassifier,
} from "../cheap-router/types.js";
import type {
  ShortcutDefinition,
  ToolExecutor,
  ToolResult,
} from "../shortcuts/types.js";
import { createCheapRouterHook, shouldSkipClassifier } from "./cheap-router.js";

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

const exec: ToolExecutor = async () => textResult("ok");

const metricsShortcut: ShortcutDefinition = {
  slug: "metrics",
  patterns: [/^\/metrics$/i],
  toolCalls: [],
  render: () => "Stripe: $123",
};

const stripeShortcut: ShortcutDefinition = {
  slug: "stripe",
  patterns: [/^\/stripe$/i],
  toolCalls: [],
  render: () => "Stripe MRR: $321",
};

function makeClassifier(
  classification: CheapRouterClassification,
): CheapRouterClassifier {
  return { classify: vi.fn().mockResolvedValue(classification) };
}

function makeEvent(content: string): PluginHookBeforeDispatchEvent {
  return { content } as PluginHookBeforeDispatchEvent;
}

describe("shouldSkipClassifier", () => {
  it("skips empty and whitespace-only content", () => {
    expect(shouldSkipClassifier("")).toBe(true);
    expect(shouldSkipClassifier("   \n\t ")).toBe(true);
  });

  it("skips slash commands (Layer 0 owned them)", () => {
    expect(shouldSkipClassifier("/metrics")).toBe(true);
    expect(shouldSkipClassifier("  /think foo")).toBe(true);
  });

  it("does not skip natural-language messages", () => {
    expect(shouldSkipClassifier("Як у нас з MRR?")).toBe(false);
    expect(shouldSkipClassifier("write me a poem")).toBe(false);
  });
});

describe("createCheapRouterHook", () => {
  it("returns { handled: false } and never calls classifier on slash commands", async () => {
    const classifier = makeClassifier({ class: "thinking" });
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
    });

    const result = await hook(makeEvent("/metrics"));
    expect(result).toEqual({ handled: false });
    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it("dispatches the suggested shortcut on routine_metrics", async () => {
    const classifier = makeClassifier({
      class: "routine_metrics",
      shortcut: "metrics",
    });
    const log = vi.fn();
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut, stripeShortcut],
      executeTool: exec,
      log,
    });

    const result = await hook(makeEvent("Як у нас з MRR?"));
    expect(result).toEqual({ handled: true, text: "Stripe: $123" });
    expect(classifier.classify).toHaveBeenCalledWith("Як у нас з MRR?");
    expect(log).toHaveBeenCalledWith(
      "info",
      "openclaw.cheap_router.routed",
      expect.objectContaining({ slug: "metrics" }),
    );
  });

  it("falls through to Layer 2 when routine_* suggests an unknown shortcut", async () => {
    const classifier = makeClassifier({
      class: "routine_metrics",
      shortcut: "totally_unknown_slug",
    });
    const log = vi.fn();
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
      log,
    });

    const result = await hook(makeEvent("Як з арбітражем?"));
    expect(result).toEqual({ handled: false });
    expect(log).toHaveBeenCalledWith(
      "warn",
      "openclaw.cheap_router.unknown_shortcut",
      { slug: "totally_unknown_slug" },
    );
  });

  it("replies with chat_response when class is chat", async () => {
    const classifier = makeClassifier({
      class: "chat",
      chat_response: "Привіт! Як справи?",
    });
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
    });

    const result = await hook(makeEvent("привіт"));
    expect(result).toEqual({ handled: true, text: "Привіт! Як справи?" });
  });

  it("falls through to Layer 2 when chat class is missing chat_response", async () => {
    const classifier = makeClassifier({ class: "chat" });
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
    });

    const result = await hook(makeEvent("hello"));
    expect(result).toEqual({ handled: false });
  });

  it("falls through to Layer 2 on thinking class", async () => {
    const classifier = makeClassifier({ class: "thinking", persona: "eng" });
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
    });

    const result = await hook(makeEvent("Поясни мені архітектуру X"));
    expect(result).toEqual({ handled: false });
  });

  it("falls through to Layer 2 when the classifier throws", async () => {
    const classifier: CheapRouterClassifier = {
      classify: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const log = vi.fn();
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
      log,
    });

    const result = await hook(makeEvent("test"));
    expect(result).toEqual({ handled: false });
    expect(log).toHaveBeenCalledWith(
      "error",
      "openclaw.cheap_router.classifier_throw",
      expect.objectContaining({ error: "boom" }),
    );
  });

  it("ignores empty/whitespace content", async () => {
    const classifier = makeClassifier({ class: "thinking" });
    const hook = createCheapRouterHook({
      classifier,
      shortcuts: [metricsShortcut],
      executeTool: exec,
    });

    expect(await hook(makeEvent(""))).toEqual({ handled: false });
    expect(await hook(makeEvent("   "))).toEqual({ handled: false });
    expect(classifier.classify).not.toHaveBeenCalled();
  });
});
