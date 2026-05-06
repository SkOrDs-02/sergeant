/**
 * Юніт-тести для Anthropic mock harness.
 *
 * Контракт:
 * - `createAnthropicMockHandle()` повертає об'єкт із `vi.fn()`-symbols, готовий
 *   віддати у `vi.mock()` factory.
 * - `extractAnthropicText` дзеркалить реальну реалізацію (включно з `.trim()`
 *   та порядком join-у для multi-block відповідей).
 * - Response-білдери віддають shape, який споживає реальний `chat.ts` handler:
 *   `{ response: { ok, status }, data: { content, stop_reason, ... } }`.
 */
import { describe, it, expect } from "vitest";
import {
  createAnthropicMockHandle,
  anthropicResponses,
  anthropicError,
  streamingBody,
} from "./anthropic.js";

describe("createAnthropicMockHandle", () => {
  it("повертає vi.fn-symbols для усіх експортів `lib/anthropic.js`", () => {
    const handle = createAnthropicMockHandle();
    expect(handle.anthropicMessages).toBeTypeOf("function");
    expect(handle.anthropicMessagesStream).toBeTypeOf("function");
    expect(handle.extractAnthropicText).toBeTypeOf("function");
    expect(handle.recordAnthropicUsage).toBeTypeOf("function");
    // vi.fn-symbols мають `.mock`-property.
    expect(handle.anthropicMessages.mock).toBeDefined();
    expect(handle.anthropicMessagesStream.mock).toBeDefined();
  });

  it("розводить state між handle-ами (кожен виклик — нові vi.fn)", () => {
    const a = createAnthropicMockHandle();
    const b = createAnthropicMockHandle();
    a.anthropicMessages.mockReturnValueOnce("a-result");
    b.anthropicMessages.mockReturnValueOnce("b-result");
    expect(a.anthropicMessages()).toBe("a-result");
    expect(b.anthropicMessages()).toBe("b-result");
    // Не повинно бути кросс-leak-ів.
    expect(a.anthropicMessages.mock.calls).toHaveLength(1);
    expect(b.anthropicMessages.mock.calls).toHaveLength(1);
  });

  describe("extractAnthropicText дефолтна поведінка", () => {
    it("повертає сконкатеновані `text`-блоки через \\n", () => {
      const { extractAnthropicText } = createAnthropicMockHandle();
      const result = extractAnthropicText({
        content: [
          { type: "text", text: "Привіт" },
          { type: "tool_use", id: "t1", name: "x", input: {} },
          { type: "text", text: "Як справи?" },
        ],
      });
      expect(result).toBe("Привіт\nЯк справи?");
    });

    it("пропускає не-text блоки", () => {
      const { extractAnthropicText } = createAnthropicMockHandle();
      const result = extractAnthropicText({
        content: [{ type: "tool_use", id: "t1", name: "x", input: {} }],
      });
      expect(result).toBe("");
    });

    it("робить `.trim()` як реальна реалізація", () => {
      const { extractAnthropicText } = createAnthropicMockHandle();
      const result = extractAnthropicText({
        content: [{ type: "text", text: "  hi\n\n  " }],
      });
      expect(result).toBe("hi");
    });

    it("безпечний на null/undefined input", () => {
      const { extractAnthropicText } = createAnthropicMockHandle();
      expect(extractAnthropicText(null)).toBe("");
      expect(extractAnthropicText(undefined)).toBe("");
      expect(extractAnthropicText({})).toBe("");
    });
  });
});

describe("anthropicResponses.text", () => {
  it("будує text-only turn з `stop_reason: end_turn`", () => {
    const r = anthropicResponses.text("Привіт");
    expect(r.response).toEqual({ ok: true, status: 200 });
    expect(r.data.content).toEqual([{ type: "text", text: "Привіт" }]);
    expect(r.data.stop_reason).toBe("end_turn");
  });

  it("підтягує усі опціональні поля", () => {
    const r = anthropicResponses.text("hi", {
      stopReason: "max_tokens",
      model: "claude-3-5-sonnet-latest",
      usage: { input_tokens: 10, output_tokens: 5 },
      status: 200,
    });
    expect(r.data.stop_reason).toBe("max_tokens");
    expect(r.data.model).toBe("claude-3-5-sonnet-latest");
    expect(r.data.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("кастомний status (для контракту з 200/206 helpers)", () => {
    const r = anthropicResponses.text("hi", { status: 206 });
    expect(r.response.status).toBe(206);
  });
});

describe("anthropicResponses.toolUse", () => {
  it("будує turn із одним tool_use без leading-text", () => {
    const r = anthropicResponses.toolUse([
      { id: "toolu_1", name: "delete_transaction", input: { tx_id: "m_abc" } },
    ]);
    expect(r.data.content).toEqual([
      {
        type: "tool_use",
        id: "toolu_1",
        name: "delete_transaction",
        input: { tx_id: "m_abc" },
      },
    ]);
    expect(r.data.stop_reason).toBe("tool_use");
  });

  it("прикладає leading text перед tool_use-блоками", () => {
    const r = anthropicResponses.toolUse([{ id: "toolu_1", name: "x" }], {
      text: "Виконую…",
    });
    expect(r.data.content[0]).toMatchObject({ type: "text", text: "Виконую…" });
    expect(r.data.content[1]).toMatchObject({
      type: "tool_use",
      id: "toolu_1",
    });
  });

  it("дефолтить input до пустого об'єкта", () => {
    const r = anthropicResponses.toolUse([{ id: "x", name: "y" }]);
    const block = r.data.content[0] as { type: string; input?: unknown };
    expect(block.input).toEqual({});
  });

  it("підтримує multi-tool turn (кілька tool_use одночасно)", () => {
    const r = anthropicResponses.toolUse([
      { id: "a", name: "delete_transaction" },
      { id: "b", name: "start_workout" },
    ]);
    expect(r.data.content).toHaveLength(2);
    expect((r.data.content[0] as { id: string }).id).toBe("a");
    expect((r.data.content[1] as { id: string }).id).toBe("b");
  });
});

describe("anthropicResponses.empty", () => {
  it("повертає content: [] із `stop_reason: max_tokens` за замовчуванням", () => {
    const r = anthropicResponses.empty();
    expect(r.data.content).toEqual([]);
    expect(r.data.stop_reason).toBe("max_tokens");
  });

  it("дозволяє перевизначити stop_reason (наприклад, stop_sequence)", () => {
    const r = anthropicResponses.empty({ stopReason: "stop_sequence" });
    expect(r.data.stop_reason).toBe("stop_sequence");
  });
});

describe("anthropicError", () => {
  it("повертає shape сумісний із `ExternalServiceError`", () => {
    const e = anthropicError("Anthropic API failed");
    expect(e.name).toBe("ExternalServiceError");
    expect(e.message).toBe("Anthropic API failed");
    expect(e.cause).toEqual({ status: 502 });
  });

  it("підтягує optional status / body / name", () => {
    const e = anthropicError("rate limit", {
      status: 429,
      body: '{"error":"rate_limit_exceeded"}',
      name: "RateLimitError",
    });
    expect(e.name).toBe("RateLimitError");
    expect(e.cause).toEqual({
      status: 429,
      body: '{"error":"rate_limit_exceeded"}',
    });
  });
});

describe("streamingBody", () => {
  it("формує SSE-сумісне тіло з масиву event-ів", async () => {
    const stream = streamingBody([
      { event: "content_block_delta", data: { delta: { text: "Hi" } } },
      { event: "message_stop", data: {} },
    ]);
    const reader = stream.getReader();
    const chunks: string[] = [];
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    const body = chunks.join("");
    expect(body).toContain("event: content_block_delta");
    expect(body).toContain('data: {"delta":{"text":"Hi"}}');
    expect(body).toContain("event: message_stop");
    // SSE-формат: подвійний \n між frames.
    expect(body.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });

  it("порожній масив → порожній стрім, який одразу close-ить", async () => {
    const stream = streamingBody([]);
    const reader = stream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });
});
