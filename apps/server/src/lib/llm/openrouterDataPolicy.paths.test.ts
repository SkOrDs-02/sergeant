/**
 * Тіло запиту до OpenRouter несе `provider.data_collection: "deny"` на
 * кожному транспорті (рішення власника 2026-11-19).
 *
 * AI-CONTEXT: тут навмисно НЕ мокається `lib/anthropic.ts` і `fetch`
 * підміняється глобально: перевіряється саме те, що йде в мережу з реальних
 * call-site-ів (перший хід, синтез, JSON-шлях чату, зір чека, нативний
 * `/chat/completions`), а не те, що модуль передав у мок. Ключ шлюзу
 * виставляється до імпорту `env`, тож маршрут обирається продовою логікою
 * (`chatViaOpenRouter()`, `receiptVisionViaOpenRouter()`, `pickTransport`).
 */
import type { Request, Response as ExpressResponse } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["OPENROUTER_API_KEY"] = "sk-or-test";
  delete process.env["CHAT_VIA_OPENROUTER"];
  delete process.env["LLM_RECEIPT_PROVIDER"];
  delete process.env["OPENROUTER_DATA_COLLECTION"];
});

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
}));
vi.mock("../../obs/logger.js", () => ({ logger: loggerMock }));
// Леджер витрат пише в Postgres; тут він лише шум.
vi.mock("../anthropicUsageStore.js", () => ({
  recordAnthropicUsageToDb: vi.fn(() => Promise.resolve()),
  ANTHROPIC_PROVIDER_SUBJECT: "provider:anthropic",
}));

import { env } from "../../env/env.js";
import { streamFirstTurnToSse } from "../../modules/chat/chatFirstTurnStream.js";
import { streamAnthropicToSse } from "../../modules/chat/chatStream.js";
import { callAnthropicWithContinuation } from "../../modules/chat/chatUpstream.js";
import { callReceiptVision } from "../../modules/finyk/receipts/visionClient.js";
import { OpenRouterProvider } from "./provider.js";

const { Response: NodeResponse, TextEncoder: NodeTextEncoder } = globalThis;

const DENY = { data_collection: "deny" };
const NO_ENDPOINTS = "No endpoints found matching your data policy";

function sseResponse(): globalThis.Response {
  const events = [
    {
      type: "message_start",
      message: { usage: { input_tokens: 3, output_tokens: 0 } },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Привіт" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 1 },
    },
    { type: "message_stop" },
  ];
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new NodeResponse(new NodeTextEncoder().encode(body), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonResponse(data: unknown, status = 200): globalThis.Response {
  return new NodeResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MESSAGES_OK = {
  content: [{ type: "text", text: "ok" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 3, output_tokens: 1 },
};

function makeRes(): ExpressResponse {
  let ended = false;
  return {
    setHeader: () => undefined,
    write: () => !ended,
    end: () => {
      ended = true;
    },
    get writableEnded() {
      return ended;
    },
  } as unknown as ExpressResponse;
}

const req = {} as Request;
const fetchMock = vi.fn();

function sentBody(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

function sentUrl(call = 0): string {
  return String(fetchMock.mock.calls[call]?.[0]);
}

beforeEach(() => {
  fetchMock.mockReset();
  loggerMock.warn.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  env.OPENROUTER_DATA_COLLECTION = "deny";
});

afterEach(() => {
  vi.unstubAllGlobals();
  env.OPENROUTER_DATA_COLLECTION = "deny";
});

const CHAT_PAYLOAD = {
  model: "google/gemini-3.7-flash",
  max_tokens: 100,
  messages: [{ role: "user", content: "привіт" }],
};

describe("provider.data_collection=deny на кожному транспорті OpenRouter", () => {
  it("перший хід чату (стрім /api/v1/messages)", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse());
    const result = await streamFirstTurnToSse({
      req,
      res: makeRes(),
      apiKey: "",
      payload: CHAT_PAYLOAD,
      signal: new AbortController().signal,
      traceId: "t",
      userId: undefined,
      promptVersion: "v",
      attemptTimeoutMs: 5_000,
      totalTimeoutMs: 10_000,
      handlerStartedAt: Date.now(),
    });
    expect(result.outcome).toBe("ok");
    expect(sentUrl()).toBe("https://openrouter.ai/api/v1/messages");
    expect(sentBody()["provider"]).toEqual(DENY);
    expect(sentBody()["stream"]).toBe(true);
  });

  it("тур синтезу (стрім /api/v1/messages)", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse());
    await streamAnthropicToSse(req, makeRes(), "", CHAT_PAYLOAD, "chat");
    expect(sentUrl()).toBe("https://openrouter.ai/api/v1/messages");
    expect(sentBody()["provider"]).toEqual(DENY);
  });

  it("JSON-шлях чату без стріму (/api/v1/messages)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MESSAGES_OK));
    await callAnthropicWithContinuation("", CHAT_PAYLOAD, { endpoint: "chat" });
    expect(sentUrl()).toBe("https://openrouter.ai/api/v1/messages");
    expect(sentBody()["provider"]).toEqual(DENY);
  });

  it("зір: фото чека (/api/v1/messages з image-блоком)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(MESSAGES_OK));
    await callReceiptVision({ base64: "abc", mediaType: "image/jpeg" });
    expect(sentUrl()).toBe("https://openrouter.ai/api/v1/messages");
    const body = sentBody();
    expect(body["provider"]).toEqual(DENY);
    expect(JSON.stringify(body["messages"])).toContain('"type":"image"');
  });

  it("нативний /api/v1/chat/completions (коуч, дайджест, Mono, категоризація)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    const r = await new OpenRouterProvider("sk-or-test").generate({
      model: "google/gemini-2.5-flash-lite",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 10,
    });
    expect(r.ok).toBe(true);
    expect(sentUrl()).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sentBody()["provider"]).toEqual(DENY);
  });
});

describe("відкат OPENROUTER_DATA_COLLECTION=allow", () => {
  it("/messages: поля provider немає", async () => {
    env.OPENROUTER_DATA_COLLECTION = "allow";
    fetchMock.mockResolvedValueOnce(jsonResponse(MESSAGES_OK));
    await callAnthropicWithContinuation("", CHAT_PAYLOAD, { endpoint: "chat" });
    expect(sentBody()).not.toHaveProperty("provider");
  });

  it("/chat/completions: поля provider немає", async () => {
    env.OPENROUTER_DATA_COLLECTION = "allow";
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    await new OpenRouterProvider("sk-or-test").generate({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 10,
    });
    expect(sentBody()).not.toHaveProperty("provider");
  });
});

describe("404 «No endpoints found matching your data policy»", () => {
  it("/chat/completions: помилка лишається помилкою, у лозі видно причину", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: NO_ENDPOINTS, code: 404 } }, 404),
    );
    const r = await new OpenRouterProvider("sk-or-test").generate({
      model: "google/gemini-2.5-flash-lite",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 10,
      endpoint: "digest",
    });
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "openrouter_data_policy_no_endpoints",
        transport: "chat_completions",
        endpoint: "digest",
      }),
    );
  });

  it("/messages без стріму: без тихого повтору з allow, причина в лозі", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "error",
          error: { type: "not_found_error", message: NO_ENDPOINTS },
        },
        404,
      ),
    );
    const { response } = await callAnthropicWithContinuation("", CHAT_PAYLOAD, {
      endpoint: "chat",
    });
    expect(response?.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()["provider"]).toEqual(DENY);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "openrouter_data_policy_no_endpoints",
        transport: "messages",
      }),
    );
  });

  it("стрім першого ходу: причина в лозі, кожна спроба теж із deny", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            type: "error",
            error: { type: "not_found_error", message: NO_ENDPOINTS },
          },
          404,
        ),
      ),
    );
    // Потік ще не відкрито → наявний шлях помилки upstream: та сама
    // JSON-помилка, що в нестрімовому шляху. Тихого повтору з `allow` немає.
    await expect(
      streamFirstTurnToSse({
        req,
        res: makeRes(),
        apiKey: "",
        payload: CHAT_PAYLOAD,
        signal: new AbortController().signal,
        traceId: "t",
        userId: undefined,
        promptVersion: "v",
        attemptTimeoutMs: 5_000,
        totalTimeoutMs: 10_000,
        handlerStartedAt: Date.now(),
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < fetchMock.mock.calls.length; i++) {
      expect(sentBody(i)["provider"]).toEqual(DENY);
    }
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "openrouter_data_policy_no_endpoints",
        transport: "messages",
      }),
    );
  });
});
