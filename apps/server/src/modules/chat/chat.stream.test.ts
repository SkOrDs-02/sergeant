/**
 * SSE end-to-end harness для `streamAnthropicToSse` / `streamOneIterationToSse`.
 *
 * Покриває untested-шлях у `chat.ts`: коли клієнт запитує `stream: true` разом
 * із `tool_results + tool_calls_raw`, сервер відкриває upstream-стрім до
 * Anthropic і форвардить text-дельти у `data: {"t":"…"}\n\n` події. Цей файл
 * мокає `anthropicMessagesStream` фейковою `Response` із `ReadableStream`-боді,
 * а Express-`Response` — об'єктом, що збирає все, що пишуть у `res.write()`,
 * щоб можна було асертити саме SSE-протокол (а не лише фінальний текст).
 *
 * Тести покривають:
 * - простий стрім: text-дельти → data-події → `[DONE]`;
 * - авто-continuation на `stop_reason: "max_tokens"` (другий upstream-виклик
 *   з накопиченим assistant-text як останнім повідомленням);
 * - cap (`MAX_TEXT_CONTINUATIONS = 3`) на runaway-генерацію;
 * - graceful degradation коли continuation повертає !ok / кидає виняток
 *   (юзер бачить partial text + `err`-подію + `[DONE]`);
 * - upstream-помилку на першому виклику (JSON-помилка, без SSE-заголовків);
 * - reassembly SSE-подій, розрізаних по chunk-боундарі;
 * - skip некоректного JSON у data-лінії (без падіння стріму);
 * - skip non-text content_block_delta (input_json_delta тощо);
 * - prompt-cache-метрика: `cache_read>0` → `hit`, `0` → `miss`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(),
  recordAnthropicUsage: vi.fn(),
}));

vi.mock("../../obs/metrics.js", () => ({
  anthropicPromptCacheHitTotal: { inc: vi.fn() },
  chatToolInvocationsTotal: { inc: vi.fn() },
  aiRequestDurationMs: { observe: vi.fn() },
  aiRequestsTotal: { inc: vi.fn() },
  aiTokensTotal: { inc: vi.fn() },
  externalHttpDurationMs: { observe: vi.fn() },
  externalHttpRequestsTotal: { inc: vi.fn() },
}));

import {
  anthropicMessagesStream as _anthropicMessagesStream,
  recordAnthropicUsage as _recordAnthropicUsage,
} from "../../lib/anthropic.js";
import handler from "./chat.js";
import { ExternalServiceError } from "../../obs/errors.js";

const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;
const recordAnthropicUsageMock = _recordAnthropicUsage as unknown as Mock;

interface SseEvent {
  type: string;
  delta?: { type?: string; text?: string; stop_reason?: string } | undefined;
  message?: { usage?: Record<string, number> } | undefined;
  // input_json_delta тощо — лишаємо як index signature
  [key: string]: unknown;
}

/**
 * Серіалізує масив подій у єдину raw SSE-строку: `data: <json>\n\n` ×N.
 * Окрема функція на випадок, якщо тест хоче розрізати її по власних
 * boundaries (див. `makeChunkedUpstream`).
 */
function eventsToSseString(events: SseEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

/**
 * Будує fetch-`Response` з body-`ReadableStream`, який віддає всю serialized
 * SSE-строку одним chunk-ом. Під капотом сервер усе одно прокачує через
 * `getReader().read()` циклом, тому одно/багатоchunk-овий boundary тестується
 * `makeChunkedUpstream` нижче.
 */
function makeUpstreamSse(
  events: SseEvent[],
  init: { ok?: boolean; status?: number } = {},
): globalThis.Response {
  const status = init.status ?? 200;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(eventsToSseString(events)));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

/**
 * Будує fetch-`Response`, де body віддає кілька raw-chunk-ів у вказаному
 * порядку. Дозволяє розрізати SSE-події посеред JSON-літерала чи між
 * `\n` і `\n` — стрес-тест на line-buffer reassembly у
 * `streamOneIterationToSse`.
 */
function makeChunkedUpstream(
  rawChunks: string[],
  init: { status?: number } = {},
): globalThis.Response {
  const status = init.status ?? 200;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of rawChunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

interface SseRes {
  statusCode: number;
  body: unknown;
  writes: string[];
  headers: Record<string, string>;
  status(code: number): SseRes;
  json(payload: unknown): SseRes;
  setHeader(k: string, v: string): void;
  write(s: string): boolean;
  end(): void;
  on(): void;
  readonly writableEnded: boolean;
}

/**
 * Express-Response мок, спеціально під SSE: `setHeader` + `write` + `end`.
 * Зберігає всі writes окремими строчками, щоб тест бачив порядок подій.
 */
function makeSseRes(): SseRes & Response {
  const writes: string[] = [];
  const headers: Record<string, string> = {};
  let writableEnded = false;
  const res: SseRes = {
    statusCode: 200,
    body: undefined,
    writes,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    write(s: string) {
      if (writableEnded) return false;
      writes.push(s);
      return true;
    },
    end() {
      writableEnded = true;
    },
    on() {
      /* no-op: chat.ts слухає 'close', але в тестах не emit-имо */
    },
    get writableEnded() {
      return writableEnded;
    },
  };
  return res as unknown as SseRes & Response;
}

function makeReq(body: unknown): Request {
  return { anthropicKey: "sk-test", body } as unknown as Request;
}

/**
 * Streaming-шлях у `chat.ts` живе саме в гілці tool-result (line ~341), тому
 * тести треба проганяти через payload із `tool_results + tool_calls_raw`. Цей
 * helper будує мінімальний валідний body, лишаючи тестам лише декларацію
 * stream-сценарію.
 */
function makeStreamReqBody(): Record<string, unknown> {
  return {
    stream: true,
    messages: [{ role: "user", content: "довгий брифінг" }],
    tool_calls_raw: [
      {
        type: "tool_use",
        id: "toolu_x",
        name: "noop",
        input: {},
      },
    ],
    tool_results: [{ tool_use_id: "toolu_x", content: "ok" }],
  };
}

/** Витягує всі data-payload-и (без префікса `data: ` і термінатора `\n\n`). */
function dataPayloads(writes: string[]): string[] {
  return writes
    .filter((w) => w.startsWith("data: "))
    .map((w) => w.slice("data: ".length).replace(/\n\n$/, ""));
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessagesStream.mockReset();
  recordAnthropicUsageMock.mockReset();
});

describe("chat handler — SSE streaming (basic forwarding)", () => {
  it("форвардить text-дельти як data-події і завершує [DONE]", async () => {
    const events: SseEvent[] = [
      {
        type: "message_start",
        message: { usage: { cache_read_input_tokens: 0 } },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Привіт" },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: ", як " },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "справи?" },
      },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ];
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse(events),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    const payloads = dataPayloads(res.writes);
    // Кожен text_delta стає окремою `data: {"t":"…"}` подією у тому ж порядку.
    expect(payloads).toEqual([
      JSON.stringify({ t: "Привіт" }),
      JSON.stringify({ t: ", як " }),
      JSON.stringify({ t: "справи?" }),
      "[DONE]",
    ]);
    // SSE-протокольні заголовки виставлені.
    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(res.headers["Cache-Control"]).toBe("no-cache, no-transform");
    expect(res.headers["X-Accel-Buffering"]).toBe("no");
    expect(res.writableEnded).toBe(true);
  });

  it("HE відкриває continuation коли stop_reason='end_turn'", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Готово." },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(1);
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "Готово." }),
      "[DONE]",
    ]);
  });

  it("ігнорує не-text content_block_delta (input_json_delta тощо)", async () => {
    // Anthropic емітить input_json_delta для tool_use; SSE-форвард має пропустити.
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "видимий " },
        },
        {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"x":1',
          } as unknown as SseEvent["delta"],
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "текст" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "видимий " }),
      JSON.stringify({ t: "текст" }),
      "[DONE]",
    ]);
  });
});

describe("chat handler — SSE auto-continuation на stop_reason=max_tokens", () => {
  it("робить другий upstream-виклик з накопиченим assistant-text", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Перша частина… " },
          },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        ]),
        recordStreamEnd: vi.fn(),
      })
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "друга частина — кінець." },
          },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
        ]),
        recordStreamEnd: vi.fn(),
      });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(2);
    // Continuation отримує partial-text як останнє assistant-повідомлення
    // (Anthropic вимагає user/assistant alternation).
    const secondPayload = anthropicMessagesStream!.mock.calls[1]![1] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const last = secondPayload.messages[secondPayload.messages.length - 1];
    expect(last).toEqual({
      role: "assistant",
      content: "Перша частина… ",
    });
    // Endpoint-розмітка для другого виклику — `chat-tool-result-cont`,
    // щоб latency-метрики розрізняли continuation від першого виклику.
    const secondOpts = anthropicMessagesStream!.mock.calls[1]![2] as {
      endpoint: string;
    };
    expect(secondOpts.endpoint).toBe("chat-tool-result-cont");

    // Юзер бачить обидва chunk-и склеєними у одному SSE-потоці без маркерів
    // continuation.
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "Перша частина… " }),
      JSON.stringify({ t: "друга частина — кінець." }),
      "[DONE]",
    ]);
  });

  it("обмежує кількість continuation викликів cap-ом MAX_TEXT_CONTINUATIONS=3", async () => {
    // Runaway: модель щоразу повертає max_tokens. Cap=3 → загалом 1+3=4 upstream.
    const partial = (i: number) => ({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: `c${i} ` },
        },
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
      ]),
      recordStreamEnd: vi.fn(),
    });
    anthropicMessagesStream
      .mockResolvedValueOnce(partial(1))
      .mockResolvedValueOnce(partial(2))
      .mockResolvedValueOnce(partial(3))
      .mockResolvedValueOnce(partial(4))
      .mockResolvedValueOnce(partial(5)); // зайвий — не має бути спожитим

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(4);
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "c1 " }),
      JSON.stringify({ t: "c2 " }),
      JSON.stringify({ t: "c3 " }),
      JSON.stringify({ t: "c4 " }),
      "[DONE]",
    ]);
  });

  it("у 2-му continuation messages мають user/assistant alternation (не два assistant поспіль)", async () => {
    const partial = (i: number) => ({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: `p${i} ` },
        },
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
      ]),
      recordStreamEnd: vi.fn(),
    });
    anthropicMessagesStream
      .mockResolvedValueOnce(partial(1))
      .mockResolvedValueOnce(partial(2))
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "p3" },
          },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
        ]),
        recordStreamEnd: vi.fn(),
      });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(3);
    const thirdPayload = anthropicMessagesStream!.mock.calls[2]![1] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    // Останнім має бути ОДИН assistant-msg із усім накопиченим текстом ("p1 p2 ").
    const last = thirdPayload.messages[thirdPayload.messages.length - 1];
    expect(last).toEqual({ role: "assistant", content: "p1 p2 " });
    // Sanity: жодних двох однакових ролей поспіль.
    const roles = thirdPayload.messages.map((m) => m.role);
    for (let k = 1; k < roles.length; k++) {
      expect(roles[k]).not.toBe(roles[k - 1]);
    }
  });
});

describe("chat handler — SSE graceful degradation на continuation-помилці", () => {
  it("continuation повертає !ok → пише err-подію, лишає partial-text, завершує [DONE]", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Перша частина… " },
          },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        ]),
        recordStreamEnd: vi.fn(),
      })
      .mockResolvedValueOnce({
        response: new Response(JSON.stringify({ error: "upstream 500" }), {
          status: 500,
        }),
        recordStreamEnd: vi.fn(),
      });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    const payloads = dataPayloads(res.writes);
    // Перший chunk дійшов до клієнта, далі err-подія, далі [DONE].
    expect(payloads[0]).toBe(JSON.stringify({ t: "Перша частина… " }));
    expect(payloads).toContain(
      JSON.stringify({ err: "AI continuation failed" }),
    );
    expect(payloads[payloads.length - 1]).toBe("[DONE]");
    expect(res.writableEnded).toBe(true);
    // Перший виклик уже виставив SSE-заголовки — fallback не повертає JSON-помилку.
    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
  });

  it("continuation кидає виняток → пише err-подію, не падає, [DONE]", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "часткова… " },
          },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        ]),
        recordStreamEnd: vi.fn(),
      })
      .mockRejectedValueOnce(new Error("network down"));

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    const payloads = dataPayloads(res.writes);
    expect(payloads).toContain(JSON.stringify({ t: "часткова… " }));
    expect(payloads).toContain(JSON.stringify({ err: "network down" }));
    expect(payloads[payloads.length - 1]).toBe("[DONE]");
  });
});

describe("chat handler — SSE first-call upstream errors", () => {
  it("перший upstream !ok → кидає ExternalServiceError, БЕЗ SSE-заголовків і БЕЗ data-подій", async () => {
    // Pre-SSE upstream-помилка: SSE-заголовки ще не виставлені, тому
    // нормалізуємо у `ExternalServiceError`. `asyncHandler` довеже до
    // `errorHandler`, який віддасть JSON `{ error, code: EXTERNAL_SERVICE,
    // requestId }` зі статусом 429. Перевіряємо контракт на рівні throw —
    // обгортка `errorHandler` тестується окремо в `errorHandler.test.ts`.
    anthropicMessagesStream.mockResolvedValueOnce({
      response: new Response(
        JSON.stringify({ error: { message: "rate limited" } }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    let caught: unknown = null;
    try {
      await handler(req, res);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExternalServiceError);
    expect(caught).toMatchObject({
      status: 429,
      code: "EXTERNAL_SERVICE",
      message: "rate limited",
    });
    // Жодного запису у SSE-стрім (заголовки і body не задіяні).
    expect(res.writes).toHaveLength(0);
    expect(res.headers["Content-Type"]).toBeUndefined();
  });

  it("перший upstream !ok з не-JSON боді → fallback на raw text() через clone(), кидає ExternalServiceError", async () => {
    // `firstResponse.json()` консьюмить body-стрім. Щоб після failed-`.json()`
    // мати можливість прочитати raw-text, у chat.ts тримаємо `clone()` ДО
    // першої спроби — інакше `.text()` поверне нічого і ми втратимо edge-case
    // 5xx без application/json (Cloudflare/Railway-edge "Service Unavailable").
    anthropicMessagesStream.mockResolvedValueOnce({
      response: new Response("Service Unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    let caught: unknown = null;
    try {
      await handler(req, res);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExternalServiceError);
    expect(caught).toMatchObject({
      status: 503,
      code: "EXTERNAL_SERVICE",
      message: "Service Unavailable",
    });
    // SSE-заголовки НЕ виставлені (помилкова гілка йде через errorHandler, а не event-stream).
    expect(res.headers["Content-Type"]).toBeUndefined();
  });

  it("getReader() === null edge-case → SSE 'err'-подія перед [DONE], стрім коректно закривається", async () => {
    // Anthropic повернув 200 OK без body (Cloudflare/edge-проксі іноді
    // стрипають body). SSE-заголовки вже виставлені на цьому етапі —
    // ми НЕ кидаємо у JSON, а пишемо явну err-подію в стрім, інакше
    // клієнт побачив би лише тиху [DONE]-закриватку без причини.
    const responseWithoutBody = new Response(null, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    // Деякі рантайми не повертають `getReader`-сумісне body для пустого
    // Response — якщо платформа все ж повернула body, явно нулюємо.
    Object.defineProperty(responseWithoutBody, "body", {
      value: null,
      configurable: true,
    });

    anthropicMessagesStream.mockResolvedValueOnce({
      response: responseWithoutBody,
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    const payloads = dataPayloads(res.writes);
    // Очікуємо рівно одну err-подію (саме від edge-case-у), потім [DONE].
    expect(payloads).toContain(
      JSON.stringify({ err: "AI upstream returned empty body" }),
    );
    expect(payloads[payloads.length - 1]).toBe("[DONE]");
    expect(res.writableEnded).toBe(true);
    // SSE-заголовки виставлені (стрім ВЖЕ почато на момент edge-case-у).
    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
  });
});

describe("chat handler — SSE protocol robustness", () => {
  it("reassembly: SSE-подія, розрізана по chunk-боундарі (raw chunk-ів багато)", async () => {
    // Розриваємо рівно посеред JSON-літерала і навіть посеред термінатора \n\n.
    const json = JSON.stringify({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "одна-довга-репліка" },
    });
    const stop = JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
    });
    const fullPayload = `data: ${json}\n\ndata: ${stop}\n\n`;
    // Шматуємо по 7 байтів — гарантовано б'є по середині `data: `, JSON, та між \n\n.
    const chunks: string[] = [];
    for (let i = 0; i < fullPayload.length; i += 7) {
      chunks.push(fullPayload.slice(i, i + 7));
    }
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeChunkedUpstream(chunks),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "одна-довга-репліка" }),
      "[DONE]",
    ]);
  });

  it("малформований JSON у data-лінії — пропускається без падіння", async () => {
    // Anthropic іноді в edge-cases шле некоректні фрейми; стрім має толерувати.
    const chunks = [
      "data: not-a-json{broken\n\n",
      `data: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "після битої" },
      })}\n\n`,
      `data: ${JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
      })}\n\n`,
    ];
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeChunkedUpstream(chunks),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "після битої" }),
      "[DONE]",
    ]);
  });

  it("non-data рядки (`event:`, `: ping`) ігноруються", async () => {
    const chunks = [
      "event: message_start\n",
      ": ping\n\n",
      `data: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "видимий" },
      })}\n\n`,
      `data: ${JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
      })}\n\n`,
    ];
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeChunkedUpstream(chunks),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "видимий" }),
      "[DONE]",
    ]);
  });

  it("`data: [DONE]` від upstream сприймається як end-of-stream без зайвої події у клієнта", async () => {
    // Upstream може закрити стрім явним `[DONE]`-маркером. Сервер має його
    // не форвардити як text-дельту і завершити власним `[DONE]` у кінці.
    const chunks = [
      `data: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "ok" },
      })}\n\n`,
      "data: [DONE]\n\n",
    ];
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeChunkedUpstream(chunks),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "ok" }),
      "[DONE]",
    ]);
  });
});

describe("chat handler — SSE prompt-cache metric", () => {
  it("usage із message_start прокидається у recordAnthropicUsage (включно з cache_read>0)", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "message_start",
          message: { usage: { cache_read_input_tokens: 4096 } },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    // Tokens/cost/cache-hit метрики тепер емітяться через спільний helper.
    // Тест мокає `recordAnthropicUsage` цілком і перевіряє лише, що chat.ts
    // викликав його з правильно витягнутим usage-payload-ом.
    expect(recordAnthropicUsageMock).toHaveBeenCalledTimes(1);
    const call = recordAnthropicUsageMock.mock.calls[0]!;
    // signature: (model, endpoint, usage, promptVersion?)
    expect(typeof call[1]!).toBe("string");
    expect(call[1]!.length).toBeGreaterThan(0);
    expect(call[2]!).toMatchObject({ cache_read_input_tokens: 4096 });
  });

  it("usage із cache_read=0 теж форвардиться у helper (helper сам класифікує hit/miss)", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "message_start",
          message: { usage: { cache_read_input_tokens: 0 } },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(recordAnthropicUsageMock).toHaveBeenCalledTimes(1);
    const call = recordAnthropicUsageMock.mock.calls[0]!;
    expect(call[2]!).toMatchObject({ cache_read_input_tokens: 0 });
  });

  it("output_tokens із message_delta мерджаться з input_tokens із message_start", async () => {
    // Anthropic надсилає `output_tokens` ЛИШЕ у фінальному `message_delta`
    // (як top-level `usage.output_tokens`), а `input_tokens` + cache-токени —
    // у `message_start`. Без merge `kind=completion` лічильник лишається
    // порожнім і `ai_cost_estimate_usd_total` систематично занижує вартість
    // (для Sonnet output = $15/Mtok vs input = $3/Mtok).
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "message_start",
          message: {
            usage: { input_tokens: 1000, cache_read_input_tokens: 4096 },
          },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 250 },
        },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(recordAnthropicUsageMock).toHaveBeenCalledTimes(1);
    const call = recordAnthropicUsageMock.mock.calls[0]!;
    expect(call[2]!).toMatchObject({
      input_tokens: 1000,
      cache_read_input_tokens: 4096,
      output_tokens: 250,
    });
  });

  it("без message_start usage → recordAnthropicUsage не викликається", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq(makeStreamReqBody());
    const res = makeSseRes();
    await handler(req, res);

    expect(recordAnthropicUsageMock).not.toHaveBeenCalled();
  });
});
