// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { createMeEndpoints } from "./me";

// Повторюємо pattern із `httpClient.test.ts`: `vi.fn` без generic-параметра
// повертає Mock з flexible-tuple args, тож `mock.calls[0][n]` індексується
// без помилки TS2493 "has no element at index" під CI-strict tsconfig.
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

describe("createMeEndpoints", () => {
  it("GET /api/me повертає провалідовану MeResponse", async () => {
    const fetchMock = mockFetchOnce({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Тест",
        image: null,
        emailVerified: true,
        createdAt: "2026-01-15T08:30:00.000Z",
      },
    });

    const http = createHttpClient();
    const me = createMeEndpoints(http);
    const res = await me.get();

    expect(res).toEqual({
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Тест",
        image: null,
        emailVerified: true,
        createdAt: "2026-01-15T08:30:00.000Z",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    // `createHttpClient()` defaults to `apiPrefix = "/api/v1"` (see
    // DEFAULT_API_PREFIX / PR #390), so `/api/me` is rewritten to
    // `/api/v1/me` before fetch. The server mirrors both `/api/me` and
    // `/api/v1/me` (see `apiVersionRewrite`), but the client-side URL
    // we assert here is the post-rewrite one.
    expect(url).toContain("/api/v1/me");
  });

  it("кидає ZodError на відповіді без поля user", async () => {
    mockFetchOnce({ oops: true });
    const me = createMeEndpoints(createHttpClient());
    await expect(me.get()).rejects.toThrow();
  });

  it("кидає ZodError, якщо id порожній", async () => {
    mockFetchOnce({
      user: {
        id: "",
        email: null,
        name: null,
        image: null,
        emailVerified: false,
        createdAt: null,
      },
    });
    const me = createMeEndpoints(createHttpClient());
    await expect(me.get()).rejects.toThrow();
  });

  it("пропускає AbortSignal у fetch", async () => {
    const fetchMock = mockFetchOnce({
      user: {
        id: "u1",
        email: null,
        name: null,
        image: null,
        emailVerified: false,
        createdAt: null,
      },
    });
    const me = createMeEndpoints(createHttpClient());
    const ctrl = new AbortController();
    await me.get({ signal: ctrl.signal });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });
});
