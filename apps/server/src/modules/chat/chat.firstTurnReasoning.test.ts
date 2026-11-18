/**
 * Глибина міркувань першого ходу (`CHAT_FIRST_TURN_REASONING_EFFORT`) у тілі
 * запиту до шлюзу, обидва шляхи: JSON (`callAnthropicWithContinuation`) і
 * стрім (`streamFirstTurnToSse`). Змінна не задана — на шлюзі дефолт `low`
 * (рішення founder-а 2026-11-18); задана — рівно її значення (`medium` —
 * повернення до дефолту шлюзу); прямий Anthropic і тур синтезу без поля.
 * Переклад значень і парсинг змінної — `chatReasoning.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(),
  recordAnthropicUsage: vi.fn(),
}));

import {
  anthropicMessages as _anthropicMessages,
  anthropicMessagesStream as _anthropicMessagesStream,
  extractAnthropicText as _extractAnthropicText,
} from "../../lib/anthropic.js";
import { env } from "../../env.js";
import type { ChatFirstTurnReasoningEffort } from "../../env/aiRoutingEnv.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;
const extractAnthropicText = _extractAnthropicText as unknown as Mock;

const TEXT_EVENTS = [
  { type: "message_start", message: { usage: { input_tokens: 10 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Привіт" },
  },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" } },
];

function upstreamStream(): Record<string, unknown> {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          TEXT_EVENTS.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
        ),
      );
      controller.close();
    },
  });
  return {
    response: new globalThis.Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    recordStreamEnd: vi.fn(),
  };
}

function okJson(): Record<string, unknown> {
  return {
    response: { ok: true, status: 200 },
    data: {
      content: [{ type: "text", text: "Привіт" }],
      stop_reason: "end_turn",
    },
  };
}

function makeRes(): Response {
  const state = {
    statusCode: 200,
    ended: false,
    status(code: number) {
      state.statusCode = code;
      return state;
    },
    json() {
      return state;
    },
    setHeader() {},
    write() {
      return !state.ended;
    },
    end() {
      state.ended = true;
    },
    on() {},
    get writableEnded() {
      return state.ended;
    },
  };
  return state as unknown as Response;
}

let question = 0;
function makeReq(extra: Record<string, unknown> = {}): Request {
  question += 1;
  return {
    anthropicKey: "sk-test",
    body: {
      messages: [{ role: "user", content: `Питання ${question}` }],
      ...extra,
    },
    aiQuotaRefund: vi.fn(async () => {}),
  } as unknown as Request;
}

function setEffort(value: ChatFirstTurnReasoningEffort): void {
  (
    env as { CHAT_FIRST_TURN_REASONING_EFFORT: ChatFirstTurnReasoningEffort }
  ).CHAT_FIRST_TURN_REASONING_EFFORT = value;
}

/** Тіло першого виклику шлюзу: другий аргумент `anthropicMessages*`. */
function sentPayload(mock: Mock): Record<string, unknown> {
  return mock.mock.calls[0]![1] as Record<string, unknown>;
}

const original = env.CHAT_FIRST_TURN_REASONING_EFFORT;

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  anthropicMessagesStream.mockReset();
  __resetChatResponseCache();
  // Шлюз увімкнено: `chatViaOpenRouter()` вимагає ключ і читає його щоразу.
  vi.stubEnv("OPENROUTER_API_KEY", "or-test");
  vi.stubEnv("CHAT_VIA_OPENROUTER", "true");
});

afterEach(() => {
  setEffort(original);
  vi.unstubAllEnvs();
});

describe("перший хід: глибина міркувань у тілі запиту", () => {
  it("змінна в тестовому оточенні не задана й розпарсилась у дефолт `low`", () => {
    expect(process.env["CHAT_FIRST_TURN_REASONING_EFFORT"]).toBeUndefined();
    expect(original).toBe("low");
  });

  it("JSON: без змінної на шлюзі — `output_config.effort = low`", async () => {
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(makeReq(), makeRes());
    const payload = sentPayload(anthropicMessages);
    expect(payload["output_config"]).toEqual({ effort: "low" });
    expect(payload).not.toHaveProperty("thinking");
    expect(payload).not.toHaveProperty("reasoning");
  });

  it("стрім: без змінної на шлюзі — `output_config.effort = low`", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(upstreamStream());
    await handler(makeReq({ stream: true }), makeRes());
    const payload = sentPayload(anthropicMessagesStream);
    expect(payload["output_config"]).toEqual({ effort: "low" });
    expect(payload).not.toHaveProperty("thinking");
  });

  it("JSON: `medium` повертає стан до 2026-11-18 (дефолт шлюзу)", async () => {
    setEffort("medium");
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(makeReq(), makeRes());
    expect(sentPayload(anthropicMessages)["output_config"]).toEqual({
      effort: "medium",
    });
  });

  it("стрім: `medium` іде як `output_config.effort` з точним значенням", async () => {
    setEffort("medium");
    anthropicMessagesStream.mockResolvedValueOnce(upstreamStream());
    await handler(makeReq({ stream: true }), makeRes());
    expect(sentPayload(anthropicMessagesStream)["output_config"]).toEqual({
      effort: "medium",
    });
  });

  it("`none` вимикає міркування через `thinking: disabled`", async () => {
    setEffort("none");
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(makeReq(), makeRes());
    const payload = sentPayload(anthropicMessages);
    expect(payload["thinking"]).toEqual({ type: "disabled" });
    expect(payload).not.toHaveProperty("output_config");
  });

  it("прямий Anthropic (шлюз вимкнено): полів немає ні з дефолтом, ні з заданою змінною", async () => {
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(makeReq(), makeRes());
    expect(sentPayload(anthropicMessages)).not.toHaveProperty("output_config");

    setEffort("medium");
    anthropicMessages.mockClear();
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(makeReq(), makeRes());
    const payload = sentPayload(anthropicMessages);
    expect(payload).not.toHaveProperty("output_config");
    expect(payload).not.toHaveProperty("thinking");
  });

  it("тур синтезу глибину не отримує", async () => {
    setEffort("low");
    anthropicMessages.mockResolvedValueOnce(okJson());
    extractAnthropicText.mockReturnValueOnce("Привіт");
    await handler(
      makeReq({
        tool_calls_raw: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "query_transactions",
            input: {},
          },
        ],
        tool_results: [{ tool_use_id: "toolu_1", content: "8 транзакцій" }],
      }),
      makeRes(),
    );
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    const payload = sentPayload(anthropicMessages);
    expect(payload).not.toHaveProperty("output_config");
    expect(payload).not.toHaveProperty("thinking");
  });
});
