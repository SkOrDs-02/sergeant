import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PushSubscription } from "web-push";

const { sendNotificationMock, WebPushErrorMock } = vi.hoisted(() => {
  class WebPushErrorMock extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "WebPushError";
      this.statusCode = statusCode;
    }
  }
  return {
    sendNotificationMock: vi.fn(),
    WebPushErrorMock,
  };
});

vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock },
  WebPushError: WebPushErrorMock,
  sendNotification: sendNotificationMock,
}));

import { sendWebPush, __webpushSendTestHooks } from "./webpushSend.js";

const hooks = __webpushSendTestHooks();

function sub(
  endpoint: string = "https://fcm.googleapis.com/fcm/send/abc",
): PushSubscription {
  return {
    endpoint,
    keys: { p256dh: "p", auth: "a" },
  } as unknown as PushSubscription;
}

beforeEach(() => {
  hooks.reset();
  // Швидші тести: нульові затримки retry.
  hooks.configure({
    retryDelaysMs: [0, 10],
    retryJitterMs: 0,
    timeoutMs: 50,
    breakerFailThreshold: 3,
    breakerOpenMs: 1000,
  });
  sendNotificationMock.mockReset();
});

describe("sendWebPush: happy path", () => {
  it("returns outcome='ok' when sendNotification resolves", async () => {
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201, body: "" });
    const r = await sendWebPush(sub(), "payload");
    expect(r.outcome).toBe("ok");
    expect(r.attempts).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("resets breaker on success after prior failures", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("boom", 500),
    );
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("boom", 500),
    );
    await sendWebPush(sub(), "p");
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("ok");
    const breaker = hooks.state.breakers.get("https://fcm.googleapis.com");
    expect(breaker?.failures).toBe(0);
    expect(breaker?.openUntil).toBe(0);
  });
});

describe("sendWebPush: classification", () => {
  it("404 → invalid_endpoint and does not retry", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("gone", 404),
    );
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("invalid_endpoint");
    expect(r.statusCode).toBe(404);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("410 → invalid_endpoint", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("gone", 410),
    );
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("invalid_endpoint");
    expect(r.statusCode).toBe(410);
  });

  it("429 → rate_limited and does not retry", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("slow", 429),
    );
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("rate_limited");
    expect(r.statusCode).toBe(429);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("400 → error and does not retry (crypto/validation)", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("bad payload", 400),
    );
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("error");
    expect(r.statusCode).toBe(400);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendWebPush: retry behavior", () => {
  it("5xx is retried once, then reported as error on final failure", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("server error", 503),
    );
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("server error", 503),
    );
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("error");
    expect(r.statusCode).toBe(503);
    expect(r.attempts).toBe(2);
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("5xx retried once succeeds on second attempt", async () => {
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("server error", 502),
    );
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("ok");
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
  });
});

describe("sendWebPush: timeout", () => {
  it("reports timeout after timeoutMs and counts as breaker failure", async () => {
    // Hang forever to force the timeout race to win.
    sendNotificationMock.mockImplementation(() => new Promise(() => {}));
    hooks.configure({ timeoutMs: 20, retryDelaysMs: [0] });
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("timeout");
    const breaker = hooks.state.breakers.get("https://fcm.googleapis.com");
    expect(breaker?.failures).toBe(1);
  });
});

describe("sendWebPush: circuit breaker", () => {
  it("opens after breakerFailThreshold failures and fast-fails next call", async () => {
    hooks.configure({
      retryDelaysMs: [0],
      breakerFailThreshold: 2,
      breakerOpenMs: 10_000,
    });
    sendNotificationMock.mockRejectedValue(
      new WebPushErrorMock("server error", 500),
    );

    // Two 5xx failures to trip the breaker.
    await sendWebPush(sub(), "p");
    await sendWebPush(sub(), "p");

    // Third call: breaker is open → short-circuit, no HTTP.
    sendNotificationMock.mockClear();
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("circuit_open");
    expect(r.attempts).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("breaker is per-origin (FCM failures do not block Apple)", async () => {
    hooks.configure({
      retryDelaysMs: [0],
      breakerFailThreshold: 1,
      breakerOpenMs: 10_000,
    });
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("server error", 500),
    );
    // Trip FCM breaker.
    await sendWebPush(sub("https://fcm.googleapis.com/fcm/send/abc"), "p");

    // Apple call should still go through (different origin).
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    const r = await sendWebPush(sub("https://web.push.apple.com/xyz"), "p");
    expect(r.outcome).toBe("ok");
  });

  it("404 does not trip the breaker", async () => {
    hooks.configure({
      retryDelaysMs: [0],
      breakerFailThreshold: 1,
      breakerOpenMs: 10_000,
    });
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("gone", 404),
    );
    await sendWebPush(sub(), "p");

    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("ok");
  });

  it("429 does not trip the breaker", async () => {
    hooks.configure({
      retryDelaysMs: [0],
      breakerFailThreshold: 1,
      breakerOpenMs: 10_000,
    });
    sendNotificationMock.mockRejectedValueOnce(
      new WebPushErrorMock("slow", 429),
    );
    await sendWebPush(sub(), "p");

    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    const r = await sendWebPush(sub(), "p");
    expect(r.outcome).toBe("ok");
  });
});
