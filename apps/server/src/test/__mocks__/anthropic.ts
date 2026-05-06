/**
 * Reusable Anthropic mock harness for `apps/server/src/lib/anthropic.ts`.
 *
 * Раніше кожен тест-файл (`chat.test.ts`, `coach.test.ts`, `chat.stream.test.ts`,
 * `coach.route.test.ts`, `internal.test.ts`, `photoMagicByte.test.ts`) писав той
 * самий шматок:
 *
 *     vi.mock("../../lib/anthropic.js", () => ({
 *       anthropicMessages: vi.fn(),
 *       anthropicMessagesStream: vi.fn(),
 *       extractAnthropicText: vi.fn((d) => ...копія реальної реалізації...),
 *     }));
 *
 * Цей модуль централізує мок плюс додає програмовані response-білдери для
 * найпоширеніших сценаріїв (text turn, tool_use turn, error turn, streaming).
 * Покриває ADR-0027 (server AI-tool harness) і розблоковує PR-T09…T12 з
 * `docs/testing/2026-05-05-tests-pr-plan.md`.
 *
 * Усі білдери — pure: повертають plain JSON, нічого не мокають самі. Юзкейс:
 *
 *     // chat.test.ts
 *     import {
 *       createAnthropicMockHandle,
 *       anthropicResponses,
 *     } from "../../test/__mocks__/anthropic.js";
 *
 *     vi.mock("../../lib/anthropic.js", () => createAnthropicMockHandle());
 *
 *     import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
 *     const anthropicMessages = _anthropicMessages as unknown as Mock;
 *
 *     beforeEach(() => anthropicMessages.mockReset());
 *
 *     it("повертає текст", async () => {
 *       anthropicMessages.mockResolvedValueOnce(anthropicResponses.text("Привіт"));
 *       // ...
 *     });
 */

import { vi, type Mock } from "vitest";

// ============================================================================
// Типи, що віддзеркалюють shape з `apps/server/src/lib/anthropic.ts`.
// Тримаємо їх тут окремою копією (а не імпортуємо з реального файла), бо інакше
// vi.mock() factory ризикує зіткнутись із циклічним loader-патерном.
// ============================================================================

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

export interface AnthropicMessagesResultData {
  content: AnthropicContentBlock[];
  stop_reason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
}

export interface AnthropicMessagesResult {
  response: { ok: boolean; status: number };
  data: AnthropicMessagesResultData;
}

// ============================================================================
// Mock factory.
// ============================================================================

/**
 * Дзеркалить реальну реалізацію `extractAnthropicText` з `lib/anthropic.ts`,
 * включно з `.trim()` — без нього LLM-відповіді з trailing newline-ами
 * проходили б у моку, але не у проді.
 */
function defaultExtractAnthropicText(
  d: { content?: Array<{ type: string; text?: string }> } | null | undefined,
): string {
  return (d?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

export interface AnthropicMockHandle {
  anthropicMessages: Mock;
  anthropicMessagesStream: Mock;
  extractAnthropicText: Mock;
  recordAnthropicUsage: Mock;
}

/**
 * Створює сумісний з `vi.mock("../../lib/anthropic.js", () => ...)` об'єкт.
 * Усі експорти — `vi.fn()` з якомога мінімальною дефолтною поведінкою:
 *
 * - `anthropicMessages` / `anthropicMessagesStream` — без default behaviour;
 *   тест-файл вирішує через `mockResolvedValueOnce` / `mockRejectedValueOnce`.
 * - `extractAnthropicText` — мімікрує реальну поведінку, бо викликається з
 *   кодового шляху, а не з тесту, і false-pass на trailing-whitespace дорого
 *   ловиться у проді.
 * - `recordAnthropicUsage` — no-op, щоб метричні counter-и не падали у тестах.
 */
export function createAnthropicMockHandle(): AnthropicMockHandle {
  return {
    anthropicMessages: vi.fn(),
    anthropicMessagesStream: vi.fn(),
    extractAnthropicText: vi.fn(defaultExtractAnthropicText),
    recordAnthropicUsage: vi.fn(),
  };
}

// ============================================================================
// Response builders. Pure JSON — тест передає у mockResolvedValueOnce(...).
// ============================================================================

export interface ToolUseSpec {
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

export interface AnthropicResponseOptions {
  /** Опціональний leading text перед `tool_use` блоками. */
  text?: string;
  stopReason?: AnthropicMessagesResultData["stop_reason"];
  model?: string;
  usage?: AnthropicMessagesResultData["usage"];
  status?: number;
}

/** Збірка програмованих responses. */
export const anthropicResponses = {
  /**
   * Простий text-only turn — `stop_reason: end_turn`, без tool_use.
   * Найчастіший happy path для chat / coach / summary handlers.
   */
  text(
    text: string,
    options: Omit<AnthropicResponseOptions, "text"> = {},
  ): AnthropicMessagesResult {
    return {
      response: { ok: true, status: options.status ?? 200 },
      data: {
        content: [{ type: "text", text }],
        stop_reason: options.stopReason ?? "end_turn",
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.usage !== undefined ? { usage: options.usage } : {}),
      },
    };
  },

  /**
   * Tool-use turn — Anthropic просить виконати один або декілька tool calls.
   * Можна додати лідируючий текст (LLM часто пише «Видаляю…» перед `tool_use`).
   * `stop_reason` дефолтиться на `tool_use` — це сигнал handler-у, що треба
   * виконувати тулзи.
   */
  toolUse(
    tools: ToolUseSpec[],
    options: AnthropicResponseOptions = {},
  ): AnthropicMessagesResult {
    const blocks: AnthropicContentBlock[] = [];
    if (options.text) blocks.push({ type: "text", text: options.text });
    for (const t of tools) {
      blocks.push({
        type: "tool_use",
        id: t.id,
        name: t.name,
        input: t.input ?? {},
      });
    }
    return {
      response: { ok: true, status: options.status ?? 200 },
      data: {
        content: blocks,
        stop_reason: options.stopReason ?? "tool_use",
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.usage !== undefined ? { usage: options.usage } : {}),
      },
    };
  },

  /**
   * Empty content — Anthropic вернув 200, але без жодного блоку. Реальний
   * сценарій (за wave-A інцидентом 2026-04-12): LLM зупинився на
   * `stop_reason: max_tokens` посеред tool-use і не встиг записати ні текст,
   * ні id. Handler має падати у fallback-text без падіння.
   */
  empty(
    options: Omit<AnthropicResponseOptions, "text"> = {},
  ): AnthropicMessagesResult {
    return {
      response: { ok: true, status: options.status ?? 200 },
      data: {
        content: [],
        stop_reason: options.stopReason ?? "max_tokens",
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.usage !== undefined ? { usage: options.usage } : {}),
      },
    };
  },
};

// ============================================================================
// Error helpers.
// ============================================================================

/**
 * Стандартний `ExternalServiceError`-shaped reject value. Реальний
 * `anthropicMessages` кидає `ExternalServiceError` з нашого `obs/errors.js`,
 * але тести зазвичай просто перевіряють `name === "ExternalServiceError"` і
 * `cause.status === <код>`, тому ми емулюємо через звичайний `Error` із
 * правильним `name`. Якщо тест потребує реальний клас — можна імпортувати
 * `ExternalServiceError` напряму у тест і кинути власний інстанс.
 */
export interface AnthropicMockError {
  name: string;
  message: string;
  cause?: { status: number; body?: string };
}

export function anthropicError(
  message: string,
  options: { status?: number; body?: string; name?: string } = {},
): AnthropicMockError {
  return {
    name: options.name ?? "ExternalServiceError",
    message,
    cause: {
      status: options.status ?? 502,
      ...(options.body !== undefined ? { body: options.body } : {}),
    },
  };
}

// ============================================================================
// Streaming response helpers.
// ============================================================================

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Конструює text/event-stream-тіло з масиву `event:`/`data:` пар. Власне
 * `anthropicMessagesStream` повертає `{ response, recordStreamEnd }`, де
 * `response.body` — `ReadableStream`. Цей helper будує саме `ReadableStream`,
 * щоб тести могли робити:
 *
 *     const stream = streamingResponse([
 *       { event: "content_block_delta", data: { delta: { text: "Hi" } } },
 *       { event: "message_stop", data: {} },
 *     ]);
 *     anthropicMessagesStream.mockResolvedValueOnce({
 *       response: { ok: true, status: 200, body: stream },
 *       recordStreamEnd: vi.fn(),
 *     });
 */
export function streamingBody(
  events: StreamEvent[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = events.map(
    (e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}
