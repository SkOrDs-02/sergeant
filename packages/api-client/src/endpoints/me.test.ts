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
      sergeantNudges: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
    const me = createMeEndpoints(createHttpClient());

    await expect(me.getPreferences()).resolves.toEqual({
      analytics: true,
      aiMemory: false,
      pushNotifications: true,
      sergeantNudges: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
    const url = firstCall(fetchMock)[0] as string;
    expect(url).toContain("/api/v1/me/preferences");
  });

  it("GET /api/me/preferences переживає старий сервер без sergeantNudges", async () => {
    // Вікно між деплоями веба (Vercel) і сервера (Coolify): поля ще нема.
    // Без дефолту тут падала б уся сторінка налаштувань.
    mockFetchOnce({
      analytics: true,
      aiMemory: false,
      pushNotifications: true,
      updatedAt: null,
    });
    const me = createMeEndpoints(createHttpClient());

    await expect(me.getPreferences()).resolves.toMatchObject({
      sergeantNudges: false,
    });
  });

  it("PATCH /api/me/preferences валідовує partial patch", async () => {
    const fetchMock = mockFetchOnce({
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      sergeantNudges: false,
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
        sergeantNudges: false,
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

  it("DELETE /api/ai-memory повертає кількість видалених записів", async () => {
    const fetchMock = mockFetchOnce({ ok: true, deleted: 3 });
    const me = createMeEndpoints(createHttpClient());

    await expect(me.clearAiMemory()).resolves.toEqual({ ok: true, deleted: 3 });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toMatch(/\/api(?:\/v1)?\/ai-memory$/);
    expect((init as RequestInit).method).toBe("DELETE");
  });

  // Hard Rule #3 — контрактна трійка для `/api/ai-memory/list` і
  // `/api/ai-memory/{id}`. Асерти нижче цілять у розходження між клієнтом
  // і сервером, які TypeScript не бачить: на дроті все одно JSON.
  it("GET /api/ai-memory/list парсить сторінку і НЕ приймає bigint-стрінгу в id", async () => {
    // Сервер коерцить `BIGSERIAL` у `number` (Hard Rule #1). Якщо коерцію
    // колись приберуть, `id` приїде як "12" — і клієнт має впасти тут, а
    // не мовчки роздвоїти RQ-кеш ("12" ≠ 12) на бойовому екрані.
    const fetchMock = mockFetchOnce({
      items: [
        {
          id: 12,
          source: "chat",
          content: "Алергія на горіхи",
          topic: null,
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      nextCursor: 12,
    });
    const me = createMeEndpoints(createHttpClient());

    const res = await me.listAiMemory({ limit: 20 });
    expect(res.items[0]?.id).toBe(12);
    expect(res.nextCursor).toBe(12);
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toMatch(/\/ai-memory\/list\?limit=20$/);
    expect((init as RequestInit).method).toBe("GET");
  });

  it("GET /api/ai-memory/list відхиляє id-стрінгу від сервера", async () => {
    mockFetchOnce({
      items: [
        {
          id: "12",
          source: "chat",
          content: "x",
          topic: null,
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    const me = createMeEndpoints(createHttpClient());
    await expect(me.listAiMemory()).rejects.toThrow();
  });

  it("GET /api/ai-memory/list без параметрів іде без query-string", async () => {
    const fetchMock = mockFetchOnce({ items: [], nextCursor: null });
    const me = createMeEndpoints(createHttpClient());
    await me.listAiMemory();
    expect(String(firstCall(fetchMock)[0])).toMatch(/\/ai-memory\/list$/);
  });

  it("GET /api/ai-memory/list передає cursor у query", async () => {
    const fetchMock = mockFetchOnce({ items: [], nextCursor: null });
    const me = createMeEndpoints(createHttpClient());
    await me.listAiMemory({ limit: 5, cursor: 99 });
    expect(String(firstCall(fetchMock)[0])).toContain("limit=5&cursor=99");
  });

  it("DELETE /api/ai-memory/{id} б'є в per-item шлях, а не в clear-all", async () => {
    // Найдорожча помилка цього клієнта: промах у `/api/ai-memory` замість
    // `/api/ai-memory/7` стер би ВСЮ памʼять юзера, повернувши при цьому
    // цілком правдоподібний 200.
    const fetchMock = mockFetchOnce({ ok: true, deleted: true });
    const me = createMeEndpoints(createHttpClient());

    await expect(me.deleteAiMemory(7)).resolves.toEqual({
      ok: true,
      deleted: true,
    });
    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toMatch(/\/ai-memory\/7$/);
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("DELETE /api/ai-memory/{id} приймає deleted:false як успіх", async () => {
    mockFetchOnce({ ok: true, deleted: false });
    const me = createMeEndpoints(createHttpClient());
    await expect(me.deleteAiMemory(999)).resolves.toEqual({
      ok: true,
      deleted: false,
    });
  });
});
