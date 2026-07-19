// @vitest-environment jsdom
//
// Unit coverage for the `chat` endpoint module: `send()` (JSON round-trip
// over `POST /api/chat`) and `stream()` (raw `Response` pass-through for
// SSE, via `HttpClient.raw`). Both accept an AbortSignal for HubChat's
// cancel button.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { createChatEndpoints } from "./chat";

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
