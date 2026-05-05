import { describe, it, expect } from "vitest";

import { aiSpan, dbSpan, getActiveTraceId } from "./spans.js";

// Без OTel SDK (`OTEL_EXPORTER_OTLP_ENDPOINT` не set у тестовому env) —
// `@opentelemetry/api` роздає NoopTracer. Усі ці тести перевіряють,
// що наші wrapper-и нічого не ламають у no-op режимі: callback-логіка
// проходить, exception-и пропагуються, повертається повне value.

describe("aiSpan (no-op tracer)", () => {
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

describe("dbSpan (no-op tracer)", () => {
  it("повертає value з callback", async () => {
    const result = await dbSpan("users.lookup", async () => ({ id: 42 }), {
      table: "users",
      operation: "select",
    });
    expect(result).toEqual({ id: 42 });
  });

  it("пропагує exception", async () => {
    await expect(
      dbSpan("users.lookup", async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");
  });

  it("працює без attrs", async () => {
    const result = await dbSpan("ad-hoc.tx", async () => 7);
    expect(result).toBe(7);
  });
});

describe("getActiveTraceId (no-op tracer)", () => {
  it("повертає null коли немає активного span-у", () => {
    expect(getActiveTraceId()).toBeNull();
  });
});
