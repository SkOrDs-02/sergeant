import { describe, it, expect } from "vitest";

import { aiSpan } from "./spans.js";

// spans.ts — passthrough після видалення OpenTelemetry. Тести перевіряють
// контракт обгортки: callback-логіка проходить, `[value, meta]`-tuple
// розпаковується у `value`, exception-и пропагуються.

describe("aiSpan (passthrough)", () => {
  it("повертає value з callback", async () => {
    const result = await aiSpan("anthropic.messages", async () => "hello", {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    });
    expect(result).toBe("hello");
  });

  it("розпаковує [value, meta] tuple і повертає лише value", async () => {
    const result = await aiSpan(
      "anthropic.messages",
      async () =>
        ["payload" as const, { tokensIn: 100, tokensOut: 50 }] as const,
      { provider: "anthropic", model: "claude-3-5-sonnet" },
    );
    expect(result).toBe("payload");
  });

  it("пропагує exception", async () => {
    const err = new Error("boom");
    await expect(
      aiSpan(
        "anthropic.messages",
        async () => {
          throw err;
        },
        { provider: "anthropic", model: "claude-3-5-sonnet" },
      ),
    ).rejects.toBe(err);
  });

  it("приймає promptVersion і endpoint у attrs (без помилок)", async () => {
    await expect(
      aiSpan("anthropic.messages", async () => 1, {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        endpoint: "messages",
        promptVersion: "v3",
      }),
    ).resolves.toBe(1);
  });
});
