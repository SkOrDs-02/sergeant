// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import { createPushEndpoints } from "./push";

// Мокаємо глобальний fetch. `vi.fn` без generic повертає Mock з
// flexible-tuple args — pattern із `me.test.ts` / `httpClient.test.ts`.
// Перший виклик дістаємо через `firstCall(fn)` — задовольняє
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

describe("createPushEndpoints.register", () => {
  it("валідний web-payload з keys повертає { ok: true, platform: 'web' }", async () => {
    const fetchMock = mockFetchOnce({ ok: true, platform: "web" });

    const push = createPushEndpoints(createHttpClient());
    const res = await push.register({
      platform: "web",
      token: "https://fcm.googleapis.com/wp/xxx",
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    });

    expect(res).toEqual({ ok: true, platform: "web" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = firstCall(fetchMock)[1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as {
      platform: string;
      token: string;
      keys: { p256dh: string; auth: string };
    };
    expect(parsed.platform).toBe("web");
    expect(parsed.keys).toEqual({ p256dh: "p256dh-value", auth: "auth-value" });
  });

  it("iOS payload без keys працює і повертає platform: 'ios'", async () => {
    mockFetchOnce({ ok: true, platform: "ios" });

    const push = createPushEndpoints(createHttpClient());
    const res = await push.register({
      platform: "ios",
      token: "a".repeat(64),
    });

    expect(res).toEqual({ ok: true, platform: "ios" });
  });

  it("невалідна platform у відповіді → ZodError з PushRegisterResponseSchema", async () => {
    mockFetchOnce({ ok: true, platform: "desktop" });

    const push = createPushEndpoints(createHttpClient());
    await expect(
      push.register({ platform: "android", token: "fcm-token" }),
    ).rejects.toThrow();
  });

  it("AbortSignal прокидається у http.post", async () => {
    const fetchMock = mockFetchOnce({ ok: true, platform: "android" });

    const push = createPushEndpoints(createHttpClient());
    const ctrl = new AbortController();
    await push.register(
      { platform: "android", token: "fcm-token" },
      { signal: ctrl.signal },
    );

    const init = firstCall(fetchMock)[1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });

  it("`/api/push/register` переписується на `/api/v1/push/register` через applyApiPrefix", async () => {
    const fetchMock = mockFetchOnce({ ok: true, platform: "android" });

    const push = createPushEndpoints(createHttpClient());
    await push.register({ platform: "android", token: "fcm-token" });

    const url = firstCall(fetchMock)[0] as string;
    expect(url).toContain("/api/v1/push/register");
    expect(url).not.toContain("/api/push/register");
  });
});

describe("createPushEndpoints.unregister", () => {
  it("web-payload `{ platform, endpoint }` → 200 { ok, platform: 'web' }", async () => {
    const fetchMock = mockFetchOnce({ ok: true, platform: "web" });

    const push = createPushEndpoints(createHttpClient());
    const res = await push.unregister({
      platform: "web",
      endpoint: "https://fcm.googleapis.com/wp/xxx",
    });

    expect(res).toEqual({ ok: true, platform: "web" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = firstCall(fetchMock)[1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as {
      platform: string;
      endpoint: string;
    };
    expect(parsed.platform).toBe("web");
    expect(parsed.endpoint).toBe("https://fcm.googleapis.com/wp/xxx");
  });

  it("native payload `{ platform, token }` — без keys — повертає platform: 'ios'", async () => {
    mockFetchOnce({ ok: true, platform: "ios" });

    const push = createPushEndpoints(createHttpClient());
    const res = await push.unregister({
      platform: "ios",
      token: "a".repeat(64),
    });

    expect(res).toEqual({ ok: true, platform: "ios" });
  });

  it("`/api/push/unregister` переписується на `/api/v1/push/unregister`", async () => {
    const fetchMock = mockFetchOnce({ ok: true, platform: "web" });

    const push = createPushEndpoints(createHttpClient());
    await push.unregister({
      platform: "web",
      endpoint: "https://fcm.googleapis.com/wp/xxx",
    });

    const url = firstCall(fetchMock)[0] as string;
    expect(url).toContain("/api/v1/push/unregister");
    expect(url).not.toContain("/api/push/unregister");
  });

  it("невалідна platform у відповіді → ZodError з PushUnregisterResponseSchema", async () => {
    mockFetchOnce({ ok: true, platform: "desktop" });

    const push = createPushEndpoints(createHttpClient());
    await expect(
      push.unregister({ platform: "android", token: "fcm-token" }),
    ).rejects.toThrow();
  });
});
