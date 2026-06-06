// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { createMeEndpoints } from "./me";

// Pattern із `httpClient.test.ts`: `vi.fn` без generic повертає Mock з
// flexible-tuple args. Перший виклик дістаємо через `firstCall(fn)` —
// helper кидає `Error`, якщо мок не викликали; це задовольняє
// `noUncheckedIndexedAccess: true` без `!` / `as` шуму на сайт-ах.
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
    const url = firstCall(fetchMock)[0] as string;
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
    const init = firstCall(fetchMock)[1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });

  it("GET /api/me/preferences повертає consent preferences", async () => {
    const fetchMock = mockFetchOnce({
      analytics: true,
      aiMemory: false,
      pushNotifications: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
    const me = createMeEndpoints(createHttpClient());

    await expect(me.getPreferences()).resolves.toEqual({
      analytics: true,
      aiMemory: false,
      pushNotifications: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
    const url = firstCall(fetchMock)[0] as string;
    expect(url).toContain("/api/v1/me/preferences");
  });

  it("PATCH /api/me/preferences валідовує partial patch", async () => {
    const fetchMock = mockFetchOnce({
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      updatedAt: "2026-06-06T10:05:00.000Z",
    });
    const me = createMeEndpoints(createHttpClient());

    await me.updatePreferences({ analytics: false });

    const init = firstCall(fetchMock)[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ analytics: false }));
  });

  it("GET /api/me/export повертає privacy export без client-side трансформацій", async () => {
    const payload = {
      generatedAt: "2026-06-06T10:10:00.000Z",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: null,
        image: null,
        emailVerified: true,
        createdAt: "2026-01-15T08:30:00.000Z",
      },
      preferences: {
        analytics: true,
        aiMemory: true,
        pushNotifications: false,
        updatedAt: null,
      },
      data: {
        moduleData: [],
        mono: { connection: null, accounts: [], transactions: [] },
        billing: { subscriptions: [] },
        push: { webSubscriptions: [], devices: [] },
        ai: { usageDaily: [], memories: [] },
      },
    };
    mockFetchOnce(payload);
    const me = createMeEndpoints(createHttpClient());

    await expect(me.exportData()).resolves.toEqual(payload);
  });

  it("DELETE /api/me повертає deletion acknowledgement", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      deletedAt: "2026-06-06T10:15:00.000Z",
    });
    const me = createMeEndpoints(createHttpClient());

    await expect(me.deleteAccount()).resolves.toEqual({
      ok: true,
      deletedAt: "2026-06-06T10:15:00.000Z",
    });
    const init = firstCall(fetchMock)[1] as RequestInit;
    expect(init.method).toBe("DELETE");
  });
});
