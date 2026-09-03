/**
 * Direct unit coverage for `chatStream.ts` (`streamAnthropicToSse`).
 *
 * `chat.stream.test.ts` already exercises this module extensively, but only
 * indirectly — through the `chat.ts` route handler, which bundles in
 * request-body validation, tool-result assembly and payload construction.
 * This file imports `streamAnthropicToSse` directly and mocks *only* the
 * Anthropic HTTP boundary (`anthropicMessagesStream` / `recordAnthropicUsage`
 * in `../../lib/anthropic.js`), so failures here point straight at the
 * streaming/SSE-framing module itself rather than at `chat.ts` business
 * logic.
 *
 * Covers:
 * - SSE headers + framing (`data: {"t":...}` events, terminal `[DONE]`).
 * - First-call upstream error path (pre-SSE — throws `ExternalServiceError`,
 *   writes nothing, refunds AI quota).
 * - Quota refund on upstream failure (`refundQuotaOnUpstreamFailure`).
 * - `getReader() == null` edge case (empty body after 200 OK).
 * - Auto-continuation on `stop_reason: "max_tokens"` + `MAX_TEXT_CONTINUATIONS`
 *   cap enforcement.
 * - Graceful degradation when a continuation call itself fails.
 * - Abort-signal short-circuit (client disconnect mid-stream).
 * - SSE heartbeat ping cadence (`SSE_HEARTBEAT_MS`), cleared on completion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessagesStream: vi.fn(),
  recordAnthropicUsage: vi.fn(),
}));

import {
  anthropicMessagesStream as _anthropicMessagesStream,
  recordAnthropicUsage as _recordAnthropicUsage,
} from "../../lib/anthropic.js";
import { streamAnthropicToSse } from "./chatStream.js";
import { ExternalServiceError } from "../../obs/errors.js";

// AI-CONTEXT: CodeQL не моделює Node-глобали fetch-стека (Response,
// ReadableStream, TextEncoder) і позначає прямі `new Response(...)` як
// "invocation of non-function". Аліаси з runtime-guard-ом семантично
// ідентичні глобалам, але дають аналізатору визначений callee.
const {
  Response: NodeResponse,
  ReadableStream: NodeReadableStream,
  TextEncoder: NodeTextEncoder,
} = globalThis;
if (!NodeResponse || !NodeReadableStream || !NodeTextEncoder) {
  throw new Error("Node fetch-stack globals missing (need Node >= 18)");
}

const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;
const recordAnthropicUsageMock = _recordAnthropicUsage as unknown as Mock;

interface SseEvent {
  type: string;
  delta?: { type?: string; text?: string; stop_reason?: string } | undefined;
  message?: { usage?: Record<string, number> } | undefined;
  usage?: Record<string, number> | undefined;
  [key: string]: unknown;
}

function eventsToSseString(events: SseEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

function makeUpstreamSse(
  events: SseEvent[],
  init: { status?: number } = {},
): globalThis.Response {
  const status = init.status ?? 200;
  const encoder = new NodeTextEncoder();
  const stream = new NodeReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(eventsToSseString(events)));
      controller.close();
    },
  });
  return new NodeResponse(stream, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

interface SseRes {
  writes: string[];
  headers: Record<string, string>;
  setHeader(k: string, v: string): void;
  write(s: string): boolean;
  end(): void;
  readonly writableEnded: boolean;
}

function makeSseRes(): SseRes & Response {
  const writes: string[] = [];
  const headers: Record<string, string> = {};
  let writableEnded = false;
  const res: SseRes = {
    writes,
    headers,
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
    get writableEnded() {
      return writableEnded;
    },
  };
  return res as unknown as SseRes & Response;
}

function dataPayloads(writes: string[]): string[] {
  return writes
    .filter((w) => w.startsWith("data: "))
    .map((w) => w.slice("data: ".length).replace(/\n\n$/, ""));
}

function makeReq(refund?: Mock): Request {
  return { aiQuotaRefund: refund } as unknown as Request;
}

const PAYLOAD = {
  model: "claude-test",
  messages: [{ role: "user", content: "hi" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessagesStream.mockReset();
  recordAnthropicUsageMock.mockReset();
});

describe("streamAnthropicToSse — basic SSE framing", () => {
  it("sets SSE headers, forwards text deltas, ends with [DONE]", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Привіт" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const req = makeReq();
    const res = makeSseRes();
    await streamAnthropicToSse(req, res, "sk-test", PAYLOAD);

    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(res.headers["Cache-Control"]).toBe("no-cache, no-transform");
    expect(res.headers["X-Accel-Buffering"]).toBe("no");
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "Привіт" }),
      "[DONE]",
    ]);
    expect(res.writableEnded).toBe(true);
  });

  it("calls recordStreamEnd(outcome) once per upstream iteration", async () => {
    const recordStreamEnd = vi.fn();
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd,
    });

    await streamAnthropicToSse(makeReq(), makeSseRes(), "sk-test", PAYLOAD);

    expect(recordStreamEnd).toHaveBeenCalledTimes(1);
    expect(recordStreamEnd).toHaveBeenCalledWith("ok");
  });

  it("forwards usage from message_start into recordAnthropicUsage with endpoint/promptVersion/userId", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        { type: "message_start", message: { usage: { input_tokens: 10 } } },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      recordStreamEnd: vi.fn(),
      // Ініціатива 0025: транспорт і таймер стріму їдуть у `$ai_generation`
      // через meta шостим аргументом.
      provider: "openrouter",
      elapsedMs: () => 321,
    });

    await streamAnthropicToSse(
      makeReq(),
      makeSseRes(),
      "sk-test",
      PAYLOAD,
      "chat",
      undefined,
      "prompt-v13",
      "user-abc",
    );

    expect(recordAnthropicUsageMock).toHaveBeenCalledTimes(1);
    expect(recordAnthropicUsageMock).toHaveBeenCalledWith(
      "claude-test",
      "chat",
      expect.objectContaining({ input_tokens: 10 }),
      "prompt-v13",
      "user-abc",
      { provider: "openrouter", latencyMs: 321 },
    );
  });
});

describe("streamAnthropicToSse — first-call upstream errors", () => {
  it("upstream !ok (JSON error body) → throws ExternalServiceError, writes nothing, refunds quota", async () => {
    const firstRecordEnd = vi.fn();
    // Персистентна mockImplementation (не Once-черга): CI-прогони під
    // starvation-навантаженням тричі поспіль віддавали !ok-тестам не їхню
    // відповідь (503→502, деталі в історії PR #605). Свіжий Response на
    // кожен виклик — body одноразовий, а тест більше не залежить від
    // стану Once-черги.
    anthropicMessagesStream.mockImplementation(async () => ({
      response: new NodeResponse(
        JSON.stringify({ error: { message: "rate limited" } }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
      recordStreamEnd: firstRecordEnd,
    }));

    const refund = vi.fn().mockResolvedValue(undefined);
    const req = makeReq(refund);
    const res = makeSseRes();

    await expect(
      streamAnthropicToSse(req, res, "sk-test", PAYLOAD),
    ).rejects.toBeInstanceOf(ExternalServiceError);

    expect(refund).toHaveBeenCalledTimes(1);
    expect(firstRecordEnd).toHaveBeenCalledTimes(1);
    expect(firstRecordEnd).toHaveBeenCalledWith("error");
    expect(res.writes).toHaveLength(0);
    expect(res.headers["Content-Type"]).toBeUndefined();
  });

  it("upstream !ok (non-JSON body) → falls back to raw text via clone(), still throws + refunds", async () => {
    anthropicMessagesStream.mockImplementation(async () => ({
      response: new NodeResponse("Service Unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
      recordStreamEnd: vi.fn(),
    }));

    const refund = vi.fn().mockResolvedValue(undefined);
    const req = makeReq(refund);

    const caught: unknown = await streamAnthropicToSse(
      req,
      makeSseRes(),
      "sk-test",
      PAYLOAD,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(ExternalServiceError);
    // Апстрімний статус назовні не проходить: `makeAiProviderError` мапить
    // 429 → 503 (retry-after має сенс), решту — у 502. Тут апстрім віддав
    // 503, тож наша відповідь — 502, а справжній код лишається в `cause`.
    // `cause` в асерції навмисно: у Received видно rawProviderMessage і
    // upstreamStatus — тобто ЩО саме прочитав код.
    const err = caught as ExternalServiceError & { cause?: unknown };
    expect({
      status: err.status,
      code: err.code,
      cause: err.cause,
    }).toMatchObject({ status: 502, code: "ANTHROPIC_ERROR" });
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("anthropicMessagesStream() itself rejects → propagates, still refunds quota", async () => {
    anthropicMessagesStream.mockRejectedValueOnce(new Error("DNS failure"));
    const refund = vi.fn().mockResolvedValue(undefined);
    const req = makeReq(refund);

    await expect(
      streamAnthropicToSse(req, makeSseRes(), "sk-test", PAYLOAD),
    ).rejects.toThrow("DNS failure");
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("missing aiQuotaRefund on req is tolerated (best-effort refund, no throw)", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: new NodeResponse(
        JSON.stringify({ error: { message: "boom" } }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
      recordStreamEnd: vi.fn(),
    });

    // No aiQuotaRefund attached at all — refundQuotaOnUpstreamFailure must
    // no-op instead of throwing a TypeError on `undefined?.()`.
    await expect(
      streamAnthropicToSse(
        makeReq(undefined),
        makeSseRes(),
        "sk-test",
        PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it("getReader() === null (empty body on 200 OK) → writes err event then [DONE], SSE headers already set", async () => {
    const responseWithoutBody = new NodeResponse(null, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    Object.defineProperty(responseWithoutBody, "body", {
      value: null,
      configurable: true,
    });

    anthropicMessagesStream.mockResolvedValueOnce({
      response: responseWithoutBody,
      recordStreamEnd: vi.fn(),
    });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "sk-test", PAYLOAD);

    const payloads = dataPayloads(res.writes);
    expect(payloads).toContain(
      JSON.stringify({ err: "AI upstream returned empty body" }),
    );
    expect(payloads[payloads.length - 1]).toBe("[DONE]");
    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(res.writableEnded).toBe(true);
  });
});

describe("streamAnthropicToSse — auto-continuation", () => {
  it("issues a second upstream call on stop_reason=max_tokens, appends accumulated assistant text", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "part1 " },
          },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        ]),
        recordStreamEnd: vi.fn(),
      })
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "part2" },
          },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
        ]),
        recordStreamEnd: vi.fn(),
      });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "sk-test", PAYLOAD, "chat");

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(2);
    const secondCallPayload = anthropicMessagesStream.mock.calls[1]![1] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(secondCallPayload.messages.at(-1)).toEqual({
      role: "assistant",
      content: "part1 ",
    });
    const secondCallOpts = anthropicMessagesStream.mock.calls[1]![2] as {
      endpoint: string;
    };
    expect(secondCallOpts.endpoint).toBe("chat-cont");
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "part1 " }),
      JSON.stringify({ t: "part2" }),
      "[DONE]",
    ]);
  });

  it("stops after MAX_TEXT_CONTINUATIONS continuations even if upstream keeps returning max_tokens", async () => {
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
      .mockResolvedValueOnce(partial(5)); // never consumed — cap is default 3

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "sk-test", PAYLOAD);

    // 1 initial call + default MAX_TEXT_CONTINUATIONS(3) continuations = 4.
    expect(anthropicMessagesStream).toHaveBeenCalledTimes(4);
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "c1 " }),
      JSON.stringify({ t: "c2 " }),
      JSON.stringify({ t: "c3 " }),
      JSON.stringify({ t: "c4 " }),
      "[DONE]",
    ]);
  });

  it("continuation upstream !ok → writes err event, keeps partial text, still ends [DONE] (no throw)", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "partial… " },
          },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        ]),
        recordStreamEnd: vi.fn(),
      })
      .mockResolvedValueOnce({
        response: new NodeResponse(JSON.stringify({ error: "upstream 500" }), {
          status: 500,
        }),
        recordStreamEnd: vi.fn(),
      });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "sk-test", PAYLOAD);

    const payloads = dataPayloads(res.writes);
    expect(payloads[0]).toBe(JSON.stringify({ t: "partial… " }));
    expect(payloads).toContain(
      JSON.stringify({ err: "AI continuation failed" }),
    );
    expect(payloads.at(-1)).toBe("[DONE]");
    expect(res.writableEnded).toBe(true);
  });

  it("continuation call throws → writes generic err event (no raw provider text), still ends [DONE]", async () => {
    anthropicMessagesStream
      .mockResolvedValueOnce({
        response: makeUpstreamSse([
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "chunk " },
          },
          { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        ]),
        recordStreamEnd: vi.fn(),
      })
      .mockRejectedValueOnce(new Error("network down"));

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "sk-test", PAYLOAD);

    const payloads = dataPayloads(res.writes);
    // Сирий текст помилки не витікає клієнту — лише generic (CWE-209).
    expect(payloads).toContain(
      JSON.stringify({ err: "AI continuation failed" }),
    );
    expect(res.writes.join("")).not.toContain("network down");
    expect(payloads.at(-1)).toBe("[DONE]");
  });

  it("does not continue when accumulatedText is empty even if stop_reason=max_tokens", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "sk-test", PAYLOAD);

    expect(anthropicMessagesStream).toHaveBeenCalledTimes(1);
    expect(dataPayloads(res.writes)).toEqual(["[DONE]"]);
  });
});

describe("streamAnthropicToSse — abort signal", () => {
  it("an already-aborted signal stops the continuation loop before the next upstream call", async () => {
    const controller = new AbortController();
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "before-abort " },
        },
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
      ]),
      recordStreamEnd: vi.fn(),
    });
    controller.abort();

    const res = makeSseRes();
    await streamAnthropicToSse(
      makeReq(),
      res,
      "sk-test",
      PAYLOAD,
      "chat",
      controller.signal,
    );

    // Only the first (already in-flight) upstream call happens; the
    // continuation branch is skipped because `abortSignal.aborted` is true.
    expect(anthropicMessagesStream).toHaveBeenCalledTimes(1);
    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "before-abort " }),
      "[DONE]",
    ]);
  });
});

describe("streamAnthropicToSse — heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a ': ping' comment once the heartbeat interval elapses while the reader is pending, then finishes cleanly", async () => {
    // Upstream resolves immediately (arming SSE headers + the heartbeat
    // timer), but its body stream never enqueues/closes until we manually
    // drive `controller` — this lets us advance the fake macrotask clock
    // past `SSE_HEARTBEAT_MS` while `reader.read()` is still pending
    // (that promise settles via microtask, so it is unaffected by the
    // fake timer advance).
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const pendingStream = new NodeReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    anthropicMessagesStream.mockResolvedValueOnce({
      response: new NodeResponse(pendingStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
      recordStreamEnd: vi.fn(),
    });

    const res = makeSseRes();
    const donePromise = streamAnthropicToSse(
      makeReq(),
      res,
      "sk-test",
      PAYLOAD,
    );

    // Let the already-resolved upstream promise settle so headers are set
    // and the heartbeat `setInterval` is armed before we advance the clock.
    await vi.advanceTimersByTimeAsync(0);
    expect(res.headers["Content-Type"]).toBe(
      "text/event-stream; charset=utf-8",
    );

    // Advance exactly one heartbeat tick — reader.read() is still pending,
    // so this must produce a ping comment, not a data event.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(res.writes).toContain(": ping\n\n");
    expect(dataPayloads(res.writes)).toEqual([]);

    // Now finish the upstream body — the stream should drain to [DONE] and
    // the heartbeat interval must be cleared (no dangling handle).
    const encoder = new NodeTextEncoder();
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        })}\n\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
        })}\n\n`,
      ),
    );
    controller.close();
    await donePromise;

    expect(dataPayloads(res.writes)).toEqual([
      JSON.stringify({ t: "ok" }),
      "[DONE]",
    ]);
    expect(res.writableEnded).toBe(true);
    // clearInterval у finally реально спрацював — жодного живого таймера.
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * B46 — in-stream `error` event (`docs/90-work/audits/ai-testing-2026-08-25.md`).
 *
 * Провайдер відкриває тіло 200-кою і аж потім шле
 * `{"type":"error","error":{...}}`. HTTP-статус про це вже нічого не скаже,
 * а ретраї в `lib/anthropic.ts` не діють — вони живуть до заголовків.
 * Заміряна частота на прод-формі виклику (floor-модель + 78 інструментів +
 * стрім): 7 зривів із 12.
 *
 * До фікса подія не мала жодної гілки в циклі: `outcome` лишався `"ok"`,
 * текст порожнім, квота списаною, у Sentry — нічого. Тобто 58% зривів
 * рахувались як успішні запити.
 */
describe("streamAnthropicToSse — B46 in-stream error event", () => {
  it("records the iteration as an error instead of a silent success", async () => {
    const recordStreamEnd = vi.fn();
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        { type: "message_start", message: { usage: { input_tokens: 0 } } },
        {
          type: "error",
          error: {
            type: "api_error",
            message: "stream closed before completion",
          },
        },
      ]),
      recordStreamEnd,
    });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "key", PAYLOAD);

    expect(recordStreamEnd).toHaveBeenCalledWith("error");
  });

  it("does not leak the provider error text to the client", async () => {
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "error",
          error: {
            type: "api_error",
            message: "stream closed before completion",
          },
        },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "key", PAYLOAD);

    const payloads = dataPayloads(res.writes);
    const errEvent = payloads.find((p) => p.includes('"err"'));
    expect(errEvent).toBeDefined();
    // Клієнт бачить generic-рядок; сирий провайдерний текст лишається всередині.
    expect(errEvent).not.toContain("stream closed before completion");
    expect(res.writes.join("")).not.toContain(
      "stream closed before completion",
    );
  });

  it("refunds the AI quota when the stream died without a single character", async () => {
    const refund = vi.fn().mockResolvedValue(undefined);
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "error",
          error: { message: "stream closed before completion" },
        },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(refund), res, "key", PAYLOAD);

    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("keeps the quota spent when partial text already reached the user", async () => {
    // Половина відповіді дострімилась — людина щось отримала, тож повертати
    // квоту було б неправильно (та сама логіка, що в continuation-гілці).
    const refund = vi.fn().mockResolvedValue(undefined);
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Половина відповіді" },
        },
        {
          type: "error",
          error: { message: "stream closed before completion" },
        },
      ]),
      recordStreamEnd: vi.fn(),
    });

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(refund), res, "key", PAYLOAD);

    expect(refund).not.toHaveBeenCalled();
    expect(dataPayloads(res.writes).join("")).toContain("Половина відповіді");
  });

  it("stops reading after the error event and does not attempt continuation", async () => {
    const secondCall = vi.fn();
    anthropicMessagesStream.mockResolvedValueOnce({
      response: makeUpstreamSse([
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        { type: "error", error: { message: "boom" } },
      ]),
      recordStreamEnd: vi.fn(),
    });
    anthropicMessagesStream.mockImplementationOnce(secondCall);

    const res = makeSseRes();
    await streamAnthropicToSse(makeReq(), res, "key", PAYLOAD);

    // `stop_reason: max_tokens` сам собою тягне continuation — але не тоді,
    // коли стрім упав: продовжувати нема від чого.
    expect(secondCall).not.toHaveBeenCalled();
  });
});
