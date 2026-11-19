/**
 * Глибина міркувань туру синтезу Premium
 * (`CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT`) у тілі запиту до шлюзу, обидва
 * шляхи: JSON (`callAnthropicWithContinuation`) і стрім (`streamAnthropicToSse`).
 *
 * Рішення власника 2026-11-19: вимкнути міркування синтезу `z-ai/glm-5.2`
 * лише після доперевірки на прод-розмірі входу. Доперевірка показала втрату
 * чисел (`docs/work/research/2026-11-19-openrouter-new-models.md` § 6.4,
 * «Реалізовано»), тож дефолт `default` — поля немає, як до рішення; `none`
 * вмикається змінною. Тир standard (Free, `deepseek-v4-flash`) і floor поля
 * не отримують за жодного значення: там `none` гірша (33/42 проти 39/42).
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

vi.mock("./aiQuota.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiQuota.js")>()),
  resolveProTier: vi.fn(),
}));

import {
  anthropicMessages as _anthropicMessages,
  anthropicMessagesStream as _anthropicMessagesStream,
  extractAnthropicText as _extractAnthropicText,
} from "../../lib/anthropic.js";
import { env } from "../../env.js";
import type { ChatSynthesisPremiumReasoningEffort } from "../../env/aiRoutingEnv.js";
import { resolveProTier as _resolveProTier } from "./aiQuota.js";
import type { ProTier } from "./aiQuotaTierModels.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;
const extractAnthropicText = _extractAnthropicText as unknown as Mock;
const resolveProTier = _resolveProTier as unknown as Mock;

const TEXT_EVENTS = [
  { type: "message_start", message: { usage: { input_tokens: 10 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Разом 960 грн" },
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
      content: [{ type: "text", text: "Разом 960 грн" }],
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
/** Запит туру синтезу: є `tool_calls_raw` і `tool_results`. */
function synthesisReq(extra: Record<string, unknown> = {}): Request {
  question += 1;
  return {
    anthropicKey: "sk-test",
    body: {
      messages: [{ role: "user", content: `Скільки на каву? ${question}` }],
      tool_calls_raw: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "query_transactions",
          input: {},
        },
      ],
      tool_results: [{ tool_use_id: "toolu_1", content: "8 транзакцій" }],
      ...extra,
    },
    aiQuotaRefund: vi.fn(async () => {}),
  } as unknown as Request;
}

function tier(t: ProTier): void {
  resolveProTier.mockResolvedValue({
    tier: t,
    model: t === "premium" ? "z-ai/glm-5.2" : "deepseek/deepseek-v4-flash",
    remaining: null,
    limit: null,
  });
}

function setEffort(value: ChatSynthesisPremiumReasoningEffort): void {
  (
    env as {
      CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT: ChatSynthesisPremiumReasoningEffort;
    }
  ).CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT = value;
}

function sentPayload(mock: Mock): Record<string, unknown> {
  return mock.mock.calls[0]![1] as Record<string, unknown>;
}

const original = env.CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT;

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  anthropicMessagesStream.mockReset();
  extractAnthropicText.mockReturnValue("Разом 960 грн");
  __resetChatResponseCache();
  vi.stubEnv("OPENROUTER_API_KEY", "or-test");
  vi.stubEnv("CHAT_VIA_OPENROUTER", "true");
  tier("premium");
});

afterEach(() => {
  setEffort(original);
  vi.unstubAllEnvs();
});

describe("тур синтезу Premium: глибина міркувань у тілі запиту", () => {
  it("змінна в тестовому оточенні не задана й розпарсилась у `default`", () => {
    expect(
      process.env["CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT"],
    ).toBeUndefined();
    expect(original).toBe("default");
  });

  it("JSON, дефолт: полів глибини немає (як до 2026-11-19)", async () => {
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(synthesisReq(), makeRes());
    const payload = sentPayload(anthropicMessages);
    expect(payload["model"]).toBe("z-ai/glm-5.2");
    expect(payload).not.toHaveProperty("thinking");
    expect(payload).not.toHaveProperty("output_config");
  });

  it("JSON, `none`: `thinking: disabled`", async () => {
    setEffort("none");
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(synthesisReq(), makeRes());
    const payload = sentPayload(anthropicMessages);
    expect(payload["thinking"]).toEqual({ type: "disabled" });
    expect(payload).not.toHaveProperty("output_config");
  });

  it("стрім, `none`: `thinking: disabled`", async () => {
    setEffort("none");
    anthropicMessagesStream.mockResolvedValueOnce(upstreamStream());
    await handler(synthesisReq({ stream: true }), makeRes());
    expect(sentPayload(anthropicMessagesStream)["thinking"]).toEqual({
      type: "disabled",
    });
  });

  it("стрім, дефолт: полів глибини немає", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(upstreamStream());
    await handler(synthesisReq({ stream: true }), makeRes());
    const payload = sentPayload(anthropicMessagesStream);
    expect(payload).not.toHaveProperty("thinking");
    expect(payload).not.toHaveProperty("output_config");
  });

  it("тир standard (Free, deepseek): `none` не застосовується", async () => {
    setEffort("none");
    tier("standard");
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(synthesisReq(), makeRes());
    const payload = sentPayload(anthropicMessages);
    expect(payload["model"]).toBe("deepseek/deepseek-v4-flash");
    expect(payload).not.toHaveProperty("thinking");
    expect(payload).not.toHaveProperty("output_config");
  });

  it("прямий Anthropic (шлюз вимкнено): `none` не застосовується", async () => {
    setEffort("none");
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");
    anthropicMessages.mockResolvedValueOnce(okJson());
    await handler(synthesisReq(), makeRes());
    expect(sentPayload(anthropicMessages)).not.toHaveProperty("thinking");
  });
});
