// @vitest-environment jsdom
//
// Unit coverage for the `chat` endpoint module: `send()` (JSON round-trip
// over `POST /api/chat`) and `stream()` (raw `Response` pass-through for
// SSE, via `HttpClient.raw`). Both accept an AbortSignal for HubChat's
// cancel button.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { ApiError, isApiError } from "../ApiError";
import {
  CHAT_STREAM_INTERRUPTED,
  ChatStreamError,
  createChatEndpoints,
  parseChatStreamFrame,
} from "./chat";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const payload = {
  context: "workout-coach",
  messages: [{ role: "user" as const, content: "How's my week?" }],
};

describe("createChatEndpoints.send", () => {
  it("POSTs to /api/chat and returns the parsed response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ text: "You did great!" }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    const res = await chat.send(payload);

    expect(res).toEqual({ text: "You did great!" });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/chat");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(payload);
  });

  // Hard Rule #3 — контрактна трійка для `preset`: поле має долетіти до
  // сервера як є. Значення береться з `CHAT_PRESETS` (`@sergeant/shared`),
  // тим самим enum-ом валідує `ChatRequestSchema` на боці сервера.
  it("надсилає preset у тілі запиту", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ text: "ok" }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    await chat.send({ ...payload, preset: "profile_interview" });

    const [, init] = firstCall(fetchMock);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      ...payload,
      preset: "profile_interview",
    });
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ text: "ok" }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    const controller = new AbortController();
    await chat.send(payload, { signal: controller.signal });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it("works with no opts supplied (default {} param)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ text: "ok" }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    await expect(chat.send(payload)).resolves.toEqual({ text: "ok" });
  });

  it("surfaces a tool_calls response shape unmodified", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        tool_calls: [{ id: "call_1", name: "get_workouts" }],
      }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    const res = await chat.send(payload);
    expect(res.tool_calls).toEqual([{ id: "call_1", name: "get_workouts" }]);
  });
});

describe("createChatEndpoints.stream", () => {
  it("POSTs to /api/chat via raw() and returns the Response untouched", async () => {
    const rawResponse = new Response("data: chunk\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const fetchMock = vi.fn(async () => rawResponse) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    const res = await chat.stream(payload);

    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/chat");
    expect((init as RequestInit).method).toBe("POST");
  });

  // Hard Rule #3 — контрактна трійка для `round_trip_ticket`: тур синтезу
  // несе квиток першого туру дослівно, разом із tool_results і
  // tool_calls_raw; лише така форма погашає квиток на сервері
  // (`aiQuota.ts::tryConsumeRoundTripTicket`, `chat.roundTripTicket.test.ts`).
  it("надсилає round_trip_ticket у тілі синтезу разом із tool_results", async () => {
    const fetchMock = vi.fn(
      async () => new Response("", { status: 200 }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    const body = {
      ...payload,
      tool_results: [{ tool_use_id: "tc1", content: "ok" }],
      tool_calls_raw: [{ type: "tool_use", id: "tc1", name: "x", input: {} }],
      round_trip_ticket: "4b0c5d2e-1f3a-4c6b-9d8e-7a6b5c4d3e2f",
      stream: true,
    };
    await chat.stream(body);

    const [, init] = firstCall(fetchMock);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(body);
  });

  it("passes through an AbortSignal on stream()", async () => {
    const fetchMock = vi.fn(
      async () => new Response("", { status: 200 }),
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const chat = createChatEndpoints(http);
    const controller = new AbortController();
    await chat.stream(payload, { signal: controller.signal });

    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });
});

describe("parseChatStreamFrame (кадри SSE першого ходу, С-1 (а))", () => {
  it("розбирає чотири види кадрів", () => {
    expect(parseChatStreamFrame('{"t":"Привіт"}')).toEqual({ t: "Привіт" });
    expect(parseChatStreamFrame('{"tool":"find_transaction"}')).toEqual({
      tool: "find_transaction",
    });
    expect(
      parseChatStreamFrame(
        JSON.stringify({
          final: {
            text: null,
            tool_calls: [{ id: "t1", name: "find_transaction", input: {} }],
            tool_calls_raw: [],
            round_trip_ticket: "x",
          },
        }),
      ),
    ).toMatchObject({ final: { round_trip_ticket: "x" } });
    expect(
      parseChatStreamFrame('{"err":"Збій","code":"MAX_TOOL_ITERATIONS"}'),
    ).toEqual({ err: "Збій", code: "MAX_TOOL_ITERATIONS" });
  });

  it("кінець потоку, битий JSON і невідомий кадр дають null", () => {
    expect(parseChatStreamFrame("[DONE]")).toBeNull();
    expect(parseChatStreamFrame("{не json")).toBeNull();
    expect(parseChatStreamFrame('{"новий":"кадр"}')).toBeNull();
  });
});

describe("createChatEndpoints.firstTurn (стрім першого ходу, С-1 (а))", () => {
  const sse = (frames: unknown[], end = true): Response =>
    new Response(
      frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") +
        (end ? "data: [DONE]\n\n" : ""),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  const setup = (res: Response) => {
    const fetchMock = vi.fn(async () => res) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const chat = createChatEndpoints(
      createHttpClient({ baseUrl: "https://api.example.com" }),
    );
    return { chat, fetchMock };
  };

  it("просить stream: true, віддає кадри колбеками і повертає `final`", async () => {
    const final = {
      text: "Зараз знайду.",
      tool_calls: [{ id: "t1", name: "find_transaction", input: { q: "x" } }],
      tool_calls_raw: [],
      round_trip_ticket: "tk",
    };
    const { chat, fetchMock } = setup(
      sse([
        { t: "Зараз " },
        { t: "знайду." },
        { tool: "find_transaction" },
        { final },
      ]),
    );
    const onText = vi.fn();
    const onTool = vi.fn();
    const out = await chat.firstTurn(payload, { onText, onTool });

    expect(out).toEqual(final);
    expect(onText.mock.calls.map((c) => c[0])).toEqual(["Зараз ", "знайду."]);
    expect(onTool).toHaveBeenCalledWith("find_transaction");
    const [, init] = firstCall(fetchMock);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      ...payload,
      stream: true,
    });
  });

  it("старий сервер відповідає JSON: той самий результат без колбеків", async () => {
    const { chat } = setup(jsonResponse({ text: "Привіт" }));
    const onText = vi.fn();
    await expect(chat.firstTurn(payload, { onText })).resolves.toEqual({
      text: "Привіт",
    });
    expect(onText).not.toHaveBeenCalled();
  });

  it("JSON-помилка до потоку — ApiError http, як у send()", async () => {
    const { chat } = setup(
      jsonResponse({ error: "Ліміт", code: "AI_QUOTA" }, { status: 429 }),
    );
    const err = await chat.firstTurn(payload).catch((e: unknown) => e);
    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).serverMessage).toBe("Ліміт");
  });

  it("кадр err після тексту — ChatStreamError з кодом", async () => {
    const { chat } = setup(
      sse([{ t: "Цього " }, { err: "Збій", code: "MAX_TOOL_ITERATIONS" }]),
    );
    const onText = vi.fn();
    const err = await chat.firstTurn(payload, { onText }).catch((e) => e);
    expect(err).toBeInstanceOf(ChatStreamError);
    expect((err as ChatStreamError).code).toBe("MAX_TOOL_ITERATIONS");
    expect(onText).toHaveBeenCalledWith("Цього ");
  });

  it("потік закрився без `final` — обрив", async () => {
    const { chat } = setup(sse([{ t: "Цього " }], false));
    await expect(chat.firstTurn(payload)).rejects.toThrow(
      CHAT_STREAM_INTERRUPTED,
    );
  });
});
