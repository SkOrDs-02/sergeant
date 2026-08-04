// @vitest-environment jsdom
//
// Unit + contract-fixture coverage for the `transcribe` endpoint module
// (`POST /api/transcribe` — Groq Whisper STT proxy). Distinct from the JSON
// endpoints: the request body is a raw `Blob`/`ArrayBuffer` with a
// `Content-Type` header derived from the caller-supplied `mimeType`, and
// the result is a **discriminated union** (`TranscribeOutcome`) so callers
// switch on `outcome` instead of `try/catch`-ing every non-2xx status.
//
// This file drives a REAL `createHttpClient` against a mocked `fetch` (not
// a stubbed `HttpClient`), so the request URL/headers/query and the
// `ApiError` → `TranscribeOutcome` mapping are exercised end-to-end.
// `endpoints/product-endpoints.test.ts` already covers the outcome switch
// against a stubbed `post` — this file is the module's canonical co-located
// test (audit flagged `transcribe.ts` as having 0 dedicated tests) and
// locks the wire-level shape + the zod schema boundary (Hard Rule #3):
// server route verified read-only against
// `apps/server/src/modules/transcribe/transcribe.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import {
  TranscribeResponseSchema,
  createTranscribeEndpoints,
} from "./transcribe";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockFetchOnce(body: unknown, init: ResponseInit = {}): FetchMock {
  const fn = vi.fn(async () => jsonResponse(body, init));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createTranscribeEndpoints.send", () => {
  it("POSTs the audio Blob to /api/v1/transcribe with a mimeType Content-Type + query", async () => {
    const fetchMock = mockFetchOnce({
      text: "привіт світ",
      durationSec: 2.5,
      model: "whisper-large-v3-turbo",
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const transcribe = createTranscribeEndpoints(http);
    const audio = new Blob([new Uint8Array([1, 2, 3])], {
      type: "audio/webm",
    });

    const out = await transcribe.send(
      { audio, mimeType: "audio/webm" },
      { language: "uk" },
    );

    expect(out).toEqual({
      outcome: "ok",
      data: {
        text: "привіт світ",
        durationSec: 2.5,
        model: "whisper-large-v3-turbo",
      },
    });

    const [url, init] = firstCall(fetchMock);
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v1/transcribe");
    expect(parsed.searchParams.get("language")).toBe("uk");
    const reqInit = init as RequestInit;
    expect(reqInit.method).toBe("POST");
    expect(reqInit.body).toBe(audio);
    const headers = new Headers(reqInit.headers);
    expect(headers.get("Content-Type")).toBe("audio/webm");
  });

  it("passes an ArrayBuffer body through unchanged and omits the query when none is given", async () => {
    const fetchMock = mockFetchOnce({
      text: "x",
      durationSec: 0,
      model: "whisper-large-v3-turbo",
    });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const transcribe = createTranscribeEndpoints(http);
    const audio = new ArrayBuffer(4);

    await transcribe.send({ audio, mimeType: "audio/wav" });

    const [url, init] = firstCall(fetchMock);
    expect(new URL(String(url)).search).toBe("");
    expect((init as RequestInit).body).toBe(audio);
  });

  it("rejects an out-of-range query via the canonical schema before sending anything", async () => {
    const fetchMock = mockFetchOnce({});
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const transcribe = createTranscribeEndpoints(http);

    await expect(
      transcribe.send(
        { audio: new ArrayBuffer(1), mimeType: "audio/webm" },
        { language: "u" }, // TranscribeQuerySchema requires min(2)
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed success response via the canonical schema", () => {
    // Server contract regression-guard: a negative duration or a missing
    // field must blow up at the boundary, not silently produce NaN/undefined
    // further down in the voice-input UI.
    expect(() =>
      TranscribeResponseSchema.parse({
        text: "x",
        durationSec: -1,
        model: "m",
      }),
    ).toThrow();
    expect(() =>
      TranscribeResponseSchema.parse({ text: "x", model: "m" }),
    ).toThrow();
  });

  it.each([
    [
      503,
      "provider_unavailable",
      { error: "no key", code: "GROQ_KEY_MISSING" },
    ],
    [401, "unauthorized", { error: "Потрібна автентифікація" }],
    [429, "rate_limited", { error: "Занадто багато запитів" }],
    [
      413,
      "payload_too_large",
      { error: "Аудіо завелике", code: "PAYLOAD_TOO_LARGE" },
    ],
    [
      415,
      "unsupported_media_type",
      { error: "Непідтримуваний Content-Type", code: "UNSUPPORTED_MEDIA_TYPE" },
    ],
  ] as const)(
    "maps a real HTTP %s error envelope to outcome %s",
    async (status, outcome, body) => {
      mockFetchOnce(body, { status });
      const http = createHttpClient({ baseUrl: "https://api.example.com" });
      const transcribe = createTranscribeEndpoints(http);

      await expect(
        transcribe.send({ audio: new ArrayBuffer(1), mimeType: "audio/webm" }),
      ).resolves.toEqual({ outcome, status });
    },
  );

  it("surfaces an unmapped status as a generic error outcome carrying the server message", async () => {
    mockFetchOnce({ error: "Groq upstream 5xx" }, { status: 502 });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const transcribe = createTranscribeEndpoints(http);

    await expect(
      transcribe.send({ audio: new ArrayBuffer(1), mimeType: "audio/webm" }),
    ).resolves.toEqual({
      outcome: "error",
      status: 502,
      message: "Groq upstream 5xx",
    });
  });
});
