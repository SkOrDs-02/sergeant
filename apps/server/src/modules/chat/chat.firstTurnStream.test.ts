/**
 * Стрім ПЕРШОГО ходу чату (С-1 (а), спека
 * `docs/work/specs/hubchat-first-turn-stream.md`).
 *
 * Що стережемо:
 * - `stream: true` на першому ході дає SSE-кадри `{ t }` / `{ tool }` під час
 *   генерації і `{ final }` у формі JSON-відповіді; аргументи інструментів
 *   (`input_json_delta`) клієнту не течуть, а збираються у `final`;
 * - тиха повторна спроба, поки людина нічого не бачила (зависання, 5xx);
 * - обрив після видимого кадру — кадр `err`, без повтору й без повернення квоти;
 * - збій до відкриття потоку лишається JSON-помилкою (як без стріму);
 * - кеш відповіді віддається тими самими кадрами, ліміт M7 — кадром `err`.
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

import {
  anthropicMessages as _anthropicMessages,
  anthropicMessagesStream as _anthropicMessagesStream,
} from "../../lib/anthropic.js";
import handler from "./chat.js";
import { streamFirstTurnToSse } from "./chatFirstTurnStream.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";
import { ChatStreamFrameSchema } from "@sergeant/shared";
import { ExternalServiceError } from "../../obs/errors.js";
import { chatFirstTurnFirstVisibleMs } from "../../obs/metrics.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;

type Ev = Record<string, unknown>;

function sseBody(events: Ev[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

function upstream(events: Ev[], status = 200): { response: Response } & Ev {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseBody(events)));
      controller.close();
    },
  });
  return {
    response: new globalThis.Response(body, {
      status,
      headers: { "content-type": "text/event-stream" },
    }) as unknown as Response,
    recordStreamEnd: vi.fn(),
  };
}

/** Перший шматок віддано, далі тіло обривається помилкою провайдера. */
function upstreamThenError(events: Ev[]): Ev {
  return upstream([
    ...events,
    { type: "error", error: { type: "overloaded_error", message: "boom" } },
  ]);
}

/** Тіло, яке мовчить, доки сигнал спроби не скасує його (зависання). */
function hangingUpstream(signal: AbortSignal): Ev {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () =>
        controller.error(new DOMException("aborted", "AbortError")),
      );
    },
  });
  return {
    response: new globalThis.Response(body, { status: 200 }),
    recordStreamEnd: vi.fn(),
  };
}

const TEXT_EVENTS: Ev[] = [
  { type: "message_start", message: { usage: { input_tokens: 10 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Цього тижня — " },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "960 грн." },
  },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" } },
];

const TOOL_EVENTS: Ev[] = [
  { type: "message_start", message: { usage: { input_tokens: 10 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Зараз знайду." },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: {
      type: "tool_use",
      id: "toolu_1",
      name: "find_transaction",
      input: {},
    },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"query":' },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '"Сільпо"}' },
  },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "tool_use" } },
];

interface SseRes {
  statusCode: number;
  body: unknown;
  writes: string[];
  headers: Record<string, string>;
  ended: boolean;
}

function makeRes(): SseRes & Response {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
    writes: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    status(code: number) {
      state.statusCode = code;
      return state;
    },
    json(payload: unknown) {
      state.body = payload;
      return state;
    },
    setHeader(k: string, v: string) {
      state.headers[k] = v;
    },
    write(s: string) {
      if (state.ended) return false;
      state.writes.push(s);
      return true;
    },
    end() {
      state.ended = true;
    },
    on() {},
    get writableEnded() {
      return state.ended;
    },
  };
  return state as unknown as SseRes & Response;
}

function makeReq(
  body: unknown,
  refund = vi.fn(async () => {}),
): Request & { aiQuotaRefund: Mock } {
  return {
    anthropicKey: "sk-test",
    body,
    aiQuotaRefund: refund,
  } as unknown as Request & { aiQuotaRefund: Mock };
}

/** Кадри потоку; кожен, крім `[DONE]`, мусить пройти контракт (Hard Rule #3). */
function frames(writes: string[]): unknown[] {
  return writes
    .filter((w) => w.startsWith("data: "))
    .map((w) => w.slice(6).replace(/\n\n$/, ""))
    .map((raw) => {
      if (raw === "[DONE]") return raw;
      const frame: unknown = JSON.parse(raw);
      expect(ChatStreamFrameSchema.safeParse(frame).success).toBe(true);
      return frame;
    });
}

let question = 0;
/** Кожен тест — інше питання, щоб кеш відповіді не перетинався. */
function body(extra: Record<string, unknown> = {}): Record<string, unknown> {
  question += 1;
  return {
    stream: true,
    messages: [{ role: "user", content: `Питання ${question}` }],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessagesStream.mockReset();
  __resetChatResponseCache();
});

describe("стрім першого ходу: кадри", () => {
  it("текстова відповідь: кадри `t`, потім `final` у формі JSON-відповіді", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(upstream(TEXT_EVENTS));
    const res = makeRes();
    await handler(makeReq(body()), res);

    expect(anthropicMessages).not.toHaveBeenCalled();
    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(frames(res.writes)).toEqual([
      // Довге тире міняється на льоту, як і в турі синтезу.
      { t: "Цього тижня – " },
      { t: "960 грн." },
      { final: { text: "Цього тижня – 960 грн." } },
      "[DONE]",
    ]);
    expect(res.ended).toBe(true);
  });

  it("хід з інструментом: вступ і ранній підпис до `final`, аргументи лише у `final`", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(upstream(TOOL_EVENTS));
    const res = makeRes();
    await handler(makeReq(body()), res);

    const out = frames(res.writes);
    expect(out.slice(0, 2)).toEqual([
      { t: "Зараз знайду." },
      { tool: "find_transaction" },
    ]);
    const final = (out[2] as { final: Record<string, unknown> }).final;
    expect(final["text"]).toBe("Зараз знайду.");
    expect(final["tool_calls"]).toEqual([
      { id: "toolu_1", name: "find_transaction", input: { query: "Сільпо" } },
    ]);
    expect(final["tool_calls_raw"]).toEqual([
      { type: "text", text: "Зараз знайду." },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "find_transaction",
        input: { query: "Сільпо" },
      },
    ]);
    expect(out[3]).toBe("[DONE]");
    // Частковий JSON аргументів жодним кадром не вийшов.
    expect(res.writes.join("")).not.toContain("partial_json");
    expect(res.writes.join("")).not.toContain('{\\"query\\":');
  });

  it("пише час до першого видимого знаку", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(upstream(TOOL_EVENTS));
    const before = await chatFirstTurnFirstVisibleMs.get();
    const count = (snap: typeof before): number =>
      snap.values
        .filter(
          (v) =>
            v.metricName === "chat_first_turn_first_visible_ms_count" &&
            v.labels["source"] === "model",
        )
        .reduce((a, v) => a + v.value, 0);
    await handler(makeReq(body()), makeRes());
    expect(count(await chatFirstTurnFirstVisibleMs.get())).toBe(
      count(before) + 1,
    );
  });

  it("без `stream` перший хід лишається JSON (старі клієнти)", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [{ type: "text", text: "Привіт" }],
        stop_reason: "end_turn",
      },
    });
    const res = makeRes();
    const { stream: _omit, ...plain } = body();
    void _omit;
    await handler(makeReq(plain), res);
    expect(anthropicMessagesStream).not.toHaveBeenCalled();
    expect(res.body).toEqual({ text: "Привіт" });
    expect(res.writes).toEqual([]);
  });
});

describe("стрім першого ходу: збої", () => {
  it("обрив після видимого тексту: кадр `err`, без повтору й без повернення квоти", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(
      upstreamThenError(TEXT_EVENTS.slice(0, 3)),
    );
    const req = makeReq(body());
    const res = makeRes();
    await handler(req, res);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(1);
    expect(frames(res.writes)).toEqual([
      { t: "Цього тижня – " },
      { err: "Сержант тимчасово недоступний" },
      "[DONE]",
    ]);
    expect(req.aiQuotaRefund).not.toHaveBeenCalled();
  });

  it("5xx до першого кадру: тиха повторна спроба", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce(upstream([], 503))
      .mockResolvedValueOnce(upstream(TEXT_EVENTS));
    const res = makeRes();
    await handler(makeReq(body()), res);
    expect(anthropicMessagesStream).toHaveBeenCalledTimes(2);
    expect(frames(res.writes).at(-2)).toEqual({
      final: { text: "Цього тижня – 960 грн." },
    });
  });

  it("обидві спроби 4xx/5xx до потоку: JSON-помилка і повернення квоти", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce(upstream([], 503))
      .mockResolvedValueOnce(upstream([], 503));
    const req = makeReq(body());
    const res = makeRes();
    await expect(handler(req, res)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    expect(res.writes).toEqual([]);
    expect(req.aiQuotaRefund).toHaveBeenCalled();
  });

  it("ліміт M7 на зібраній відповіді: кадр `err` з кодом", async () => {
    const tools: Ev[] = [];
    for (let i = 0; i < 9; i++) {
      tools.push(
        {
          type: "content_block_start",
          index: i,
          content_block: {
            type: "tool_use",
            id: `toolu_${i}`,
            name: "find_transaction",
            input: {},
          },
        },
        { type: "content_block_stop", index: i },
      );
    }
    anthropicMessagesStream.mockResolvedValueOnce(
      upstream([
        ...tools,
        { type: "message_delta", delta: { stop_reason: "tool_use" } },
      ]),
    );
    const req = makeReq(body());
    const res = makeRes();
    await handler(req, res);
    const out = frames(res.writes);
    expect(out.at(-2)).toEqual({
      err: "Перевищено ліміт tool-ітерацій у запиті",
      code: "MAX_TOOL_ITERATIONS",
    });
    expect(out.some((f) => typeof f === "object" && "final" in f!)).toBe(false);
    expect(req.aiQuotaRefund).toHaveBeenCalled();
  });
});

describe("стрім першого ходу: кеш відповіді", () => {
  it("повторне питання віддається з кешу тими самими кадрами", async () => {
    anthropicMessagesStream.mockResolvedValueOnce(upstream(TOOL_EVENTS));
    const same = body();
    await handler(makeReq(same), makeRes());
    const res = makeRes();
    await handler(makeReq(same), res);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(1);
    const out = frames(res.writes);
    expect(out.slice(0, 2)).toEqual([
      { t: "Зараз знайду." },
      { tool: "find_transaction" },
    ]);
    expect(
      (out[2] as { final: { tool_calls: unknown[] } }).final.tool_calls,
    ).toHaveLength(1);
  });
});

describe("streamFirstTurnToSse: тихий повтор при зависанні", () => {
  it("спроба без жодного кадру за бюджет скасовується і повторюється", async () => {
    anthropicMessagesStream
      .mockImplementationOnce(
        async (_k: string, _p: unknown, opts: { signal: AbortSignal }) =>
          hangingUpstream(opts.signal),
      )
      .mockResolvedValueOnce(upstream(TEXT_EVENTS));
    const res = makeRes();
    const result = await streamFirstTurnToSse({
      req: makeReq({}),
      res,
      apiKey: "sk",
      payload: { model: "m", messages: [] },
      signal: new AbortController().signal,
      traceId: "t",
      userId: undefined,
      promptVersion: "v",
      attemptTimeoutMs: 30,
      totalTimeoutMs: 5_000,
      handlerStartedAt: Date.now(),
    });
    expect(anthropicMessagesStream).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe("ok");
    // Людина бачила лише кадри другої спроби.
    expect(frames(res.writes)).toEqual([
      { t: "Цього тижня – " },
      { t: "960 грн." },
    ]);
  });
});
