// @vitest-environment jsdom
//
// Contract coverage for the `feedback` endpoint module (`POST /api/v1/feedback`).
// Це третя нога triplet-а Hard Rule #3: форма server-відповіді ↔ типи
// api-client ↔ цей тест.
//
// Чому саме тут варто бути прискіпливим: UI цього віджета показує
// «надіслано» ЛИШЕ за успішним парсом відповіді. Якщо схема мовчки почне
// приймати сміття, повернеться рівно та брехня, заради усунення якої
// endpoint і зроблений — тому тести нижче явно перевіряють, що биті
// відповіді кидають, а не деградують.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import {
  FeedbackSubmitResponseSchema,
  createFeedbackEndpoints,
} from "./feedback";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockFetchOnce(body: unknown): FetchMock {
  const fn = vi.fn(async () => jsonResponse(body));
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

describe("createFeedbackEndpoints.submit", () => {
  it("POSTs /api/v1/feedback with the body and returns the parsed response", async () => {
    const fetchMock = mockFetchOnce({ ok: true, id: 42 });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const feedback = createFeedbackEndpoints(http);

    const res = await feedback.submit({
      category: "bug",
      message: "Кнопка не працює",
      page: "https://app.example.com/settings",
      viewport: "390x844",
    });

    expect(res).toEqual({ ok: true, id: 42 });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe("https://api.example.com/api/v1/feedback");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      category: "bug",
      message: "Кнопка не працює",
    });
  });

  it("works without the optional page context", async () => {
    mockFetchOnce({ ok: true, id: 7 });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const feedback = createFeedbackEndpoints(http);
    const res = await feedback.submit({ category: "idea", message: "ідея" });
    expect(res.id).toBe(7);
  });

  it("passes through an AbortSignal", async () => {
    const fetchMock = mockFetchOnce({ ok: true, id: 1 });
    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const feedback = createFeedbackEndpoints(http);
    const controller = new AbortController();
    await feedback.submit(
      { category: "other", message: "x" },
      { signal: controller.signal },
    );
    const [, init] = firstCall(fetchMock);
    expect((init as RequestInit).signal).toBe(controller.signal);
  });

  it("rejects a response missing `id` via the canonical schema", () => {
    expect(() => FeedbackSubmitResponseSchema.parse({ ok: true })).toThrow();
  });

  it("rejects a bigint-as-string `id` — Hard Rule #1 guard", () => {
    // Якщо серіалізатор колись забуде Number(row.id), pg віддасть BIGSERIAL
    // рядком. Схема мусить впасти тут, а не пустити string-id у UI.
    expect(() =>
      FeedbackSubmitResponseSchema.parse({ ok: true, id: "42" }),
    ).toThrow();
  });

  it("rejects a response with ok: false via the canonical schema", () => {
    expect(() =>
      FeedbackSubmitResponseSchema.parse({ ok: false, id: 1 }),
    ).toThrow();
  });
});
