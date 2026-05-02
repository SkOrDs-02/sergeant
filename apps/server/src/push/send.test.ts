import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тестовий plan:
 *   1. `loadApnsKey` — нормалізація CRLF / `\\n` / pad-whitespace.
 *   2. Lazy clients: warn-log + disabled поведінка, коли ключів нема.
 *   3. FCM OAuth token кешування (expiresAt - 60 с margin).
 *   4. `sendAPNs`: happy path, 410 → dead, 500 → retry → delivered, retry exhaustion.
 *   5. `sendFCM`: happy path, UNREGISTERED → dead, 429/5xx → retry.
 *   6. `sendToUser`: no devices → no-op, fan-out із cleanup, mix платформ.
 *
 * Все мокаємо на module-level — pool.query, apnsClient, fcmClient, fetch,
 * sendWebPush — щоб жоден тест не ходив у мережу і не торкав БД.
 */

// ────────────────────────── Module mocks ─────────────────────────
// `vi.mock` calls are hoisted above all top-level code, so any referenced
// identifiers inside the factory must also be hoisted — we declare them via
// `vi.hoisted` to share one set of mocks across the factory and the tests.
const {
  poolMock,
  loggerMock,
  sendWebPushMock,
  apnsProviderSendMock,
  getApnsProviderMock,
  apnsBundleIdMock,
  getFcmAccessTokenMock,
  fcmProjectIdMock,
  pushSendsTotalMock,
  fetchMock,
} = vi.hoisted(() => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => logger),
  };
  return {
    poolMock: { query: vi.fn() },
    loggerMock: logger,
    sendWebPushMock: vi.fn(),
    apnsProviderSendMock: vi.fn(),
    getApnsProviderMock: vi.fn(),
    apnsBundleIdMock: vi.fn(),
    getFcmAccessTokenMock: vi.fn(),
    fcmProjectIdMock: vi.fn(),
    pushSendsTotalMock: { inc: vi.fn() },
    fetchMock: vi.fn(),
  };
});

vi.mock("../db.js", () => ({ default: poolMock, pool: poolMock }));

vi.mock("../obs/logger.js", () => ({
  logger: loggerMock,
  childLogger: () => loggerMock,
  serializeError: (e: unknown) => ({
    message: e instanceof Error ? e.message : String(e),
  }),
}));

vi.mock("../obs/metrics.js", () => ({
  pushSendsTotal: pushSendsTotalMock,
}));

vi.mock("../lib/webpushSend.js", () => ({
  sendWebPush: sendWebPushMock,
}));

vi.mock("./apnsClient.js", async () => {
  // Keep `loadApnsKey` real — there's a dedicated suite that depends on it.
  const actual =
    await vi.importActual<typeof import("./apnsClient.js")>("./apnsClient.js");
  return {
    ...actual,
    getApnsProvider: getApnsProviderMock,
    apnsBundleId: apnsBundleIdMock,
  };
});

vi.mock("./fcmClient.js", () => ({
  getFcmAccessToken: getFcmAccessTokenMock,
  fcmProjectId: fcmProjectIdMock,
}));

// `@parse/node-apn` імпортується лише як namespace для `apn.Notification` —
// проста фабрика достатня, щоб не тягти реальний http2-стек у тести.
vi.mock("@parse/node-apn", () => {
  class FakeNotification {
    topic = "";
    alert: unknown = undefined;
    sound: unknown = undefined;
    badge: unknown = undefined;
    threadId: unknown = undefined;
    payload: unknown = undefined;
    pushType: unknown = undefined;
    priority: unknown = undefined;
    contentAvailable: unknown = undefined;
  }
  return {
    default: { Notification: FakeNotification },
    Notification: FakeNotification,
  };
});

// global fetch — кожен тест підсуває поведінку.
vi.stubGlobal("fetch", fetchMock);

// ───────────────────────── Test imports ──────────────────────────
import { sendAPNs, sendFCM, sendToUser } from "./send.js";
import { loadApnsKey } from "./apnsClient.js";

beforeEach(() => {
  poolMock.query.mockReset();
  sendWebPushMock.mockReset();
  fetchMock.mockReset();
  apnsProviderSendMock.mockReset();
  getApnsProviderMock.mockReset();
  apnsBundleIdMock.mockReset();
  getFcmAccessTokenMock.mockReset();
  fcmProjectIdMock.mockReset();
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────── loadApnsKey ─────────────────────────
describe("loadApnsKey", () => {
  it("passes through clean LF PEM", () => {
    const raw =
      "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----";
    expect(loadApnsKey(raw)).toBe(
      "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n",
    );
  });

  it("normalizes native CRLF to LF", () => {
    const raw =
      "-----BEGIN PRIVATE KEY-----\r\nABC\r\nDEF\r\n-----END PRIVATE KEY-----\r\n";
    expect(loadApnsKey(raw)).toBe(
      "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n",
    );
  });

  it("unescapes literal \\n sequences (shell-single-quoted env)", () => {
    const raw =
      "-----BEGIN PRIVATE KEY-----\\nABC\\nDEF\\n-----END PRIVATE KEY-----";
    expect(loadApnsKey(raw)).toBe(
      "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n",
    );
  });

  it("unescapes literal \\r\\n sequences", () => {
    const raw =
      "-----BEGIN PRIVATE KEY-----\\r\\nABC\\r\\nDEF\\r\\n-----END PRIVATE KEY-----";
    expect(loadApnsKey(raw)).toBe(
      "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n",
    );
  });

  it("trims surrounding whitespace and always ends with exactly one LF", () => {
    const raw =
      "   \n-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n\n  ";
    const out = loadApnsKey(raw);
    expect(out.startsWith("-----BEGIN PRIVATE KEY-----")).toBe(true);
    expect(out.endsWith("-----END PRIVATE KEY-----\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(loadApnsKey("")).toBe("");
    expect(loadApnsKey("   ")).toBe("");
    expect(loadApnsKey("\r\n  \r\n")).toBe("");
  });
});

// ─────────────────────────── sendAPNs ────────────────────────────
describe("sendAPNs", () => {
  beforeEach(() => {
    apnsBundleIdMock.mockReturnValue("com.sergeant.app");
    getApnsProviderMock.mockReturnValue({ send: apnsProviderSendMock });
  });

  it("returns delivered=true on success", async () => {
    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [{ device: "tok1" }],
      failed: [],
    });
    const r = await sendAPNs("u1", "tok1", { title: "hi", body: "world" });
    expect(r).toEqual({ delivered: true, dead: false });
    expect(apnsProviderSendMock).toHaveBeenCalledTimes(1);
  });

  it("returns dead=true on 410 BadDeviceToken without retry", async () => {
    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [],
      failed: [
        {
          device: "tok1",
          status: 410,
          response: { reason: "BadDeviceToken" },
        },
      ],
    });
    const r = await sendAPNs("u1", "tok1", { title: "hi" });
    expect(r.delivered).toBe(false);
    expect(r.dead).toBe(true);
    expect(r.error).toBe("BadDeviceToken");
    expect(apnsProviderSendMock).toHaveBeenCalledTimes(1);
  });

  it("returns dead=true on 400 Unregistered reason", async () => {
    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [],
      failed: [
        {
          device: "tok1",
          status: 400,
          response: { reason: "Unregistered" },
        },
      ],
    });
    const r = await sendAPNs("u1", "tok1", { title: "hi" });
    expect(r.dead).toBe(true);
  });

  it("retries on 500 and succeeds on the second try", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 10 });
    apnsProviderSendMock
      .mockResolvedValueOnce({
        sent: [],
        failed: [
          {
            device: "tok1",
            status: 500,
            response: { reason: "InternalServerError" },
          },
        ],
      })
      .mockResolvedValueOnce({
        sent: [{ device: "tok1" }],
        failed: [],
      });
    const p = sendAPNs("u1", "tok1", { title: "hi" });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.delivered).toBe(true);
    expect(apnsProviderSendMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after MAX_ATTEMPTS on transient 500", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 10 });
    apnsProviderSendMock.mockResolvedValue({
      sent: [],
      failed: [
        {
          device: "tok1",
          status: 500,
          response: { reason: "InternalServerError" },
        },
      ],
    });
    const p = sendAPNs("u1", "tok1", { title: "hi" });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.delivered).toBe(false);
    expect(r.dead).toBe(false);
    expect(apnsProviderSendMock).toHaveBeenCalledTimes(3);
  });

  it("returns disabled when provider is null", async () => {
    getApnsProviderMock.mockReturnValueOnce(null);
    apnsBundleIdMock.mockReturnValueOnce(null);
    const r = await sendAPNs("u1", "tok1", { title: "hi" });
    expect(r.delivered).toBe(false);
    expect(r.error).toBe("apns_disabled");
  });

  it("silent=true → background push-type, priority 5, content-available, no alert", async () => {
    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [{ device: "tok1" }],
      failed: [],
    });
    await sendAPNs("u1", "tok1", {
      title: "ignored",
      body: "ignored",
      silent: true,
      data: { kind: "sync" },
    });
    const [note, token] = apnsProviderSendMock.mock.calls[0];
    expect(token).toBe("tok1");
    expect(note.pushType).toBe("background");
    expect(note.priority).toBe(5);
    expect(note.contentAvailable).toBe(true);
    // alert/sound навмисно НЕ виставлені у silent-гілці — інакше iOS покаже
    // banner замість background-delivery.
    expect(note.alert).toBeUndefined();
    expect(note.sound).toBeUndefined();
    // data прокидається у top-level payload як і у non-silent.
    expect(note.payload).toEqual({ kind: "sync" });
  });

  it("non-silent → alert+sound, no background headers", async () => {
    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [{ device: "tok1" }],
      failed: [],
    });
    await sendAPNs("u1", "tok1", { title: "hi", body: "world" });
    const [note] = apnsProviderSendMock.mock.calls[0];
    expect(note.alert).toEqual({ title: "hi", body: "world" });
    expect(note.sound).toBe("default");
    expect(note.pushType).toBeUndefined();
    expect(note.contentAvailable).toBeUndefined();
  });

  it("top-level url is merged into note.payload (and wins over data.url)", async () => {
    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [{ device: "tok1" }],
      failed: [],
    });
    await sendAPNs("u1", "tok1", {
      title: "hi",
      url: "sergeant://finyk/tx/42",
      data: { url: "ignored-inner", kind: "navigate" },
    });
    const [note] = apnsProviderSendMock.mock.calls[0];
    expect(note.payload).toEqual({
      kind: "navigate",
      url: "sergeant://finyk/tx/42",
    });
  });
});

// ─────────────────────────── sendFCM ─────────────────────────────
describe("sendFCM", () => {
  beforeEach(() => {
    fcmProjectIdMock.mockReturnValue("sergeant-test");
    getFcmAccessTokenMock.mockResolvedValue("ya29.test-token");
  });

  function resp(status: number, body: unknown): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () =>
        typeof body === "string" ? body : JSON.stringify(body),
    } as unknown as Response;
  }

  it("returns delivered=true on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      resp(200, { name: "projects/x/messages/1" }),
    );
    const r = await sendFCM("u1", "dev-token", { title: "hi" });
    expect(r.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/projects/sergeant-test/messages:send");
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.message.token).toBe("dev-token");
    expect(parsed.message.notification.title).toBe("hi");
  });

  it("stringifies data map values for FCM v1", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { name: "n" }));
    await sendFCM("u1", "tok", {
      title: "t",
      data: { n: 1, s: "s", obj: { k: "v" } },
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.message.data).toEqual({
      n: "1",
      s: "s",
      obj: '{"k":"v"}',
    });
  });

  it("returns dead=true on UNREGISTERED status", async () => {
    fetchMock.mockResolvedValueOnce(
      resp(404, {
        error: { code: 404, status: "UNREGISTERED", message: "gone" },
      }),
    );
    const r = await sendFCM("u1", "tok", { title: "hi" });
    expect(r.dead).toBe(true);
    expect(r.error).toBe("UNREGISTERED");
  });

  it("does NOT mark token dead on INVALID_ARGUMENT (ambiguous between token and payload)", async () => {
    // FCM v1 повертає INVALID_ARGUMENT як для malformed token, так і для
    // malformed payload. Payload однаковий для всього fan-out-у, тож якщо
    // позначити токен як dead у відповідь на payload-error — знесемо всі
    // Android-токени юзера разом. Лишаємо у `errors[]`, без cleanup.
    fetchMock.mockResolvedValueOnce(
      resp(400, {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          details: [
            {
              "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
              errorCode: "INVALID_ARGUMENT",
            },
          ],
        },
      }),
    );
    const r = await sendFCM("u1", "tok", { title: "hi" });
    expect(r.delivered).toBe(false);
    expect(r.dead).toBe(false);
    expect(r.error).toBe("INVALID_ARGUMENT");
  });

  it("returns dead=true on SENDER_ID_MISMATCH", async () => {
    // Токен зареєстровано під іншим Firebase project — нашим projectId він
    // ніколи не стане валідним, безпечно DELETE.
    fetchMock.mockResolvedValueOnce(
      resp(403, {
        error: {
          code: 403,
          status: "SENDER_ID_MISMATCH",
          message: "SenderId mismatch",
        },
      }),
    );
    const r = await sendFCM("u1", "tok", { title: "hi" });
    expect(r.dead).toBe(true);
    expect(r.error).toBe("SENDER_ID_MISMATCH");
  });

  it("retries on 503 and succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 10 });
    fetchMock
      .mockResolvedValueOnce(resp(503, { error: { status: "UNAVAILABLE" } }))
      .mockResolvedValueOnce(resp(200, { name: "n" }));
    const p = sendFCM("u1", "tok", { title: "hi" });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 up to MAX_ATTEMPTS", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 10 });
    fetchMock.mockResolvedValue(
      resp(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
    );
    const p = sendFCM("u1", "tok", { title: "hi" });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.delivered).toBe(false);
    expect(r.dead).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on 401 (config error)", async () => {
    fetchMock.mockResolvedValueOnce(
      resp(401, { error: { status: "UNAUTHENTICATED" } }),
    );
    const r = await sendFCM("u1", "tok", { title: "hi" });
    expect(r.delivered).toBe(false);
    expect(r.dead).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to HTTP status when error body is empty", async () => {
    // Регресія: пусте тіло при 400 не мусить давати `error: ""` у логах —
    // чекаємо stringified status code як fallback.
    fetchMock.mockResolvedValueOnce(resp(400, ""));
    const r = await sendFCM("u1", "tok", { title: "hi" });
    expect(r.delivered).toBe(false);
    expect(r.dead).toBe(false);
    expect(r.error).toBe("400");
  });

  it("returns disabled when projectId is null", async () => {
    fcmProjectIdMock.mockReturnValueOnce(null);
    const r = await sendFCM("u1", "tok", { title: "hi" });
    expect(r.error).toBe("fcm_disabled");
  });

  it("silent=true → data-only (no notification), android priority high, apns background headers", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { name: "n" }));
    await sendFCM("u1", "and-tok", {
      title: "ignored",
      body: "ignored",
      silent: true,
      data: { kind: "sync", count: 3 },
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.message.notification).toBeUndefined();
    expect(body.message.data).toEqual({ kind: "sync", count: "3" });
    expect(body.message.android).toEqual({ priority: "high" });
    expect(body.message.apns).toEqual({
      headers: {
        "apns-push-type": "background",
        "apns-priority": "5",
      },
      payload: { aps: { "content-available": 1 } },
    });
  });

  it("non-silent → notification block present, no background headers", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { name: "n" }));
    await sendFCM("u1", "and-tok", { title: "hi", body: "world" });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.message.notification).toEqual({ title: "hi", body: "world" });
    expect(body.message.android).toBeUndefined();
    expect(body.message.apns).toBeUndefined();
  });

  it("top-level url is propagated into data.url (and wins over data.url)", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { name: "n" }));
    await sendFCM("u1", "and-tok", {
      title: "hi",
      url: "sergeant://finyk/tx/42",
      data: { url: "ignored-inner", kind: "navigate" },
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.message.data).toEqual({
      kind: "navigate",
      url: "sergeant://finyk/tx/42",
    });
  });
});

// ─────────────────────────── sendToUser ──────────────────────────
describe("sendToUser", () => {
  beforeEach(() => {
    apnsBundleIdMock.mockReturnValue("com.sergeant.app");
    getApnsProviderMock.mockReturnValue({ send: apnsProviderSendMock });
    fcmProjectIdMock.mockReturnValue("sergeant-test");
    getFcmAccessTokenMock.mockResolvedValue("ya29.test-token");
  });

  it("no-ops when user has no devices", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] }); // push_devices
    poolMock.query.mockResolvedValueOnce({ rows: [] }); // push_subscriptions
    const r = await sendToUser("u1", { title: "hi" });
    expect(r).toEqual({
      delivered: { ios: 0, android: 0, web: 0 },
      cleaned: 0,
      errors: [],
    });
    // Ні APNs, ні FCM, ні web не чіпали.
    expect(apnsProviderSendMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendWebPushMock).not.toHaveBeenCalled();
  });

  it("fan-outs to ios + android + web", async () => {
    poolMock.query.mockResolvedValueOnce({
      rows: [
        { token: "ios-tok", platform: "ios" },
        { token: "and-tok", platform: "android" },
      ],
    });
    poolMock.query.mockResolvedValueOnce({
      rows: [{ endpoint: "https://fcm/x", p256dh: "p", auth: "a" }],
    });

    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [{ device: "ios-tok" }],
      failed: [],
    });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => "{}",
    } as unknown as Response);
    sendWebPushMock.mockResolvedValueOnce({
      outcome: "ok",
      durationMs: 1,
      attempts: 1,
    });

    const r = await sendToUser("u1", { title: "hi", body: "b" });
    expect(r.delivered).toEqual({ ios: 1, android: 1, web: 1 });
    expect(r.cleaned).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it("cleans up dead APNs token via DELETE", async () => {
    poolMock.query
      .mockResolvedValueOnce({
        rows: [{ token: "ios-tok", platform: "ios" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 }); // DELETE push_devices

    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [],
      failed: [
        {
          device: "ios-tok",
          status: 410,
          response: { reason: "Unregistered" },
        },
      ],
    });

    const r = await sendToUser("u1", { title: "hi" });
    expect(r.delivered.ios).toBe(0);
    expect(r.cleaned).toBe(1);
    const deleteCall = poolMock.query.mock.calls.find((c) =>
      String(c[0]).includes("DELETE FROM push_devices"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.[1]).toEqual(["ios", "ios-tok"]);
  });

  it("cleans up dead FCM token on UNREGISTERED", async () => {
    poolMock.query
      .mockResolvedValueOnce({
        rows: [{ token: "and-tok", platform: "android" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 });

    fetchMock.mockResolvedValueOnce({
      status: 404,
      ok: false,
      text: async () => JSON.stringify({ error: { status: "UNREGISTERED" } }),
    } as unknown as Response);

    const r = await sendToUser("u1", { title: "hi" });
    expect(r.cleaned).toBe(1);
    const deleteCall = poolMock.query.mock.calls.find((c) =>
      String(c[0]).includes("DELETE FROM push_devices"),
    );
    expect(deleteCall?.[1]).toEqual(["android", "and-tok"]);
  });

  it("soft-deletes stale web subscription on invalid_endpoint", async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ endpoint: "https://fcm/x", p256dh: "p", auth: "a" }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    sendWebPushMock.mockResolvedValueOnce({
      outcome: "invalid_endpoint",
      durationMs: 1,
      attempts: 1,
      statusCode: 410,
    });

    const r = await sendToUser("u1", { title: "hi" });
    expect(r.cleaned).toBe(1);
    const updateCall = poolMock.query.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE push_subscriptions"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toEqual(["https://fcm/x"]);
  });

  it("records transient error WITHOUT cleanup", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 10 });
    poolMock.query
      .mockResolvedValueOnce({
        rows: [{ token: "ios-tok", platform: "ios" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    apnsProviderSendMock.mockResolvedValue({
      sent: [],
      failed: [
        {
          device: "ios-tok",
          status: 503,
          response: { reason: "ServiceUnavailable" },
        },
      ],
    });

    const p = sendToUser("u1", { title: "hi" });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.errors).toEqual([
      { platform: "ios", reason: "ServiceUnavailable" },
    ]);
    expect(r.cleaned).toBe(0);
    // DELETE НЕ повинен був викликатися
    const deleteCall = poolMock.query.mock.calls.find((c) =>
      String(c[0]).includes("DELETE FROM push_devices"),
    );
    expect(deleteCall).toBeUndefined();
  });

  it("propagates top-level url into web-push data.url", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ endpoint: "https://fcm/x", p256dh: "p", auth: "a" }],
    });
    sendWebPushMock.mockResolvedValueOnce({
      outcome: "ok",
      durationMs: 1,
      attempts: 1,
    });

    await sendToUser("u1", {
      title: "hi",
      body: "b",
      url: "sergeant://routine/habit/42",
    });

    expect(sendWebPushMock).toHaveBeenCalledTimes(1);
    const payloadJson = sendWebPushMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(payloadJson);
    expect(parsed.data).toEqual({ url: "sergeant://routine/habit/42" });
  });

  it("silent+url fan-out: all three platforms receive the same deep-link", async () => {
    poolMock.query
      .mockResolvedValueOnce({
        rows: [
          { token: "ios-tok", platform: "ios" },
          { token: "and-tok", platform: "android" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ endpoint: "https://fcm/x", p256dh: "p", auth: "a" }],
      });

    apnsProviderSendMock.mockResolvedValueOnce({
      sent: [{ device: "ios-tok" }],
      failed: [],
    });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => "{}",
    } as unknown as Response);
    sendWebPushMock.mockResolvedValueOnce({
      outcome: "ok",
      durationMs: 1,
      attempts: 1,
    });

    const r = await sendToUser("u1", {
      title: "sync",
      silent: true,
      url: "sergeant://finyk/tx/42",
    });
    expect(r.delivered).toEqual({ ios: 1, android: 1, web: 1 });

    // APNs — silent-гілка з url у top-level payload
    const [note] = apnsProviderSendMock.mock.calls[0];
    expect(note.pushType).toBe("background");
    expect(note.payload).toEqual({ url: "sergeant://finyk/tx/42" });

    // FCM — silent (data-only) з url у data map
    const fcmBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(fcmBody.message.notification).toBeUndefined();
    expect(fcmBody.message.data).toEqual({ url: "sergeant://finyk/tx/42" });

    // Web — url у data, без зміни поведінки service-worker-а
    const webPayload = JSON.parse(sendWebPushMock.mock.calls[0][1] as string);
    expect(webPayload.data).toEqual({ url: "sergeant://finyk/tx/42" });
  });
});
