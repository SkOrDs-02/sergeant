/**
 * Unit tests for `classifyMessage` + `parseClassification` (Stage 4c).
 *
 * PR-24: classifyMessage тепер ходить через `LLMProvider` (PR-23). Тести
 * передають `options.provider` (DI) щоб уникнути HTTP-mock-у. Стара
 * `anthropicMessages` обгортка все ще задіяна як backend для
 * `AnthropicProvider`, але classify-тести моделюють provider напряму.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type {
  LLMGenerateOpts,
  LLMGenerateResult,
  LLMProvider,
  LLMProviderName,
} from "../../lib/llm/provider.js";

const {
  classifyMessage,
  parseClassification,
  DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT,
} = await import("./classify.js");

/**
 * Тестова реалізація `LLMProvider`, що повертає попередньо сконфігуровані
 * results. Дозволяє асерти `.calls[0]` для перевірки переданих args без
 * мок-фреймворків над глобальним module-import-ом.
 */
function makeFakeProvider(
  name: LLMProviderName,
  next: () => LLMGenerateResult | Promise<LLMGenerateResult>,
): LLMProvider & { calls: LLMGenerateOpts[] } {
  const calls: LLMGenerateOpts[] = [];
  return {
    name,
    calls,
    async generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
      calls.push(opts);
      return Promise.resolve(next());
    },
  };
}

function okResult(text: string): LLMGenerateResult {
  return { ok: true, text, usage: { inputTokens: 0, outputTokens: 0 } };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const CHEAP_ROUTER_MD_PATH = path.join(
  REPO_ROOT,
  "ops/openclaw/cheap-router.system.md",
);

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
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

describe("classifyMessage (PR-24, via LLMProvider)", () => {
  it("uses the default system prompt when none provided (anthropic-mode happy path)", async () => {
    const provider = makeFakeProvider("anthropic", () =>
      okResult(JSON.stringify({ class: "chat", chat_response: "ok" })),
    );

    const result = await classifyMessage({ userMessage: "Привіт" }, "key", {
      provider,
    });

    expect(result).toEqual({ class: "chat", chat_response: "ok" });
    expect(provider.calls).toHaveLength(1);
    const opts = provider.calls[0]!;
    expect(opts).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 200,
      endpoint: "internal/openclaw/classify",
      timeoutMs: 10_000,
    });
    expect(opts.system).toContain("Ти — Сергій");
    expect(opts.system).toContain("класифікуй кожне повідомлення");
  });

  it("uses the override system prompt when provided", async () => {
    const provider = makeFakeProvider("anthropic", () =>
      okResult(JSON.stringify({ class: "thinking" })),
    );

    await classifyMessage(
      { userMessage: "Test", systemPrompt: "CUSTOM PROMPT" },
      "key",
      { provider },
    );

    expect(provider.calls[0]?.system).toBe("CUSTOM PROMPT");
  });

  it("throws when userMessage is empty/whitespace", async () => {
    const provider = makeFakeProvider("anthropic", () => okResult("{}"));
    await expect(
      classifyMessage({ userMessage: "  " }, "key", { provider }),
    ).rejects.toThrow(/userMessage is required/);
    expect(provider.calls).toHaveLength(0);
  });

  it("throws when provider повертає ok=false (Anthropic 5xx / rate-limit)", async () => {
    const provider = makeFakeProvider("anthropic", () => ({
      ok: false,
      error: "rate-limited",
      status: 429,
      code: "rate_limited",
    }));

    await expect(
      classifyMessage({ userMessage: "hi" }, "key", { provider }),
    ).rejects.toThrow(/code=rate_limited.*status=429/);
  });

  it("falls back to { class: chat } on empty content (parse fallback)", async () => {
    const provider = makeFakeProvider("anthropic", () => okResult(""));
    const result = await classifyMessage({ userMessage: "hi" }, "key", {
      provider,
    });
    expect(result).toEqual({ class: "chat" });
  });

  it("stub-mode: provider name=stub → повертає plausible default { class: chat }", async () => {
    // StubProvider у classifyMessage конфігурується факторі-ом з
    // text=STUB_CLASSIFY_RESPONSE='{"class":"chat"}'. Імітуємо це fake-провайдером.
    const provider = makeFakeProvider("stub", () =>
      okResult('{"class":"chat"}'),
    );

    const result = await classifyMessage({ userMessage: "Привіт" }, "key", {
      provider,
    });

    expect(result).toEqual({ class: "chat" });
    expect(provider.calls).toHaveLength(1);
    expect(provider.name).toBe("stub");
  });

  it("Sentry breadcrumb emitted з category=llm.provider та provider/endpoint/outcome", async () => {
    const breadcrumbs: Array<{
      category: string;
      level: string;
      message: string;
      data: Record<string, unknown>;
    }> = [];
    const provider = makeFakeProvider("anthropic", () =>
      okResult('{"class":"chat"}'),
    );

    await classifyMessage({ userMessage: "hi" }, "key", {
      provider,
      addBreadcrumb: (b) => breadcrumbs.push(b),
    });

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "llm.provider",
      level: "info",
      data: {
        provider: "anthropic",
        endpoint: "internal/openclaw/classify",
        outcome: "ok",
        model: "claude-haiku-4-5-20251001",
      },
    });
  });

  it("Sentry breadcrumb на error-path має level=warning + code/error data", async () => {
    const breadcrumbs: Array<{
      category: string;
      level: string;
      message: string;
      data: Record<string, unknown>;
    }> = [];
    const provider = makeFakeProvider("anthropic", () => ({
      ok: false,
      error: "anthropic down",
      code: "anthropic_error",
      status: 502,
    }));

    await expect(
      classifyMessage({ userMessage: "hi" }, "key", {
        provider,
        addBreadcrumb: (b) => breadcrumbs.push(b),
      }),
    ).rejects.toThrow();

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      level: "warning",
      data: {
        provider: "anthropic",
        endpoint: "internal/openclaw/classify",
        outcome: "error",
        code: "anthropic_error",
        error: "anthropic down",
      },
    });
  });
});

describe("DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT", () => {
  it("mirrors ops/openclaw/cheap-router.system.md byte-for-byte (drift gate)", () => {
    const raw = readFileSync(CHEAP_ROUTER_MD_PATH, "utf8");
    const stripped = stripHtmlComments(raw).trim();
    expect(stripped).toBe(DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT);
  });

  it("contains persona preamble + identity-escalation rule", () => {
    expect(DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT).toContain("Ти — Сергій");
    expect(DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT).toContain("Identity-питання");
    expect(DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT).toContain(
      "class=thinking, persona=cofounder",
    );
    expect(DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT).toContain(
      "НЕ представляйся як Claude / AI / language model / assistant",
    );
  });
});
